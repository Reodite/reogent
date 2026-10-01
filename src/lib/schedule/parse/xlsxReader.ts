import { XMLParser } from "fast-xml-parser";
import { strFromU8, Unzip, UnzipInflate } from "fflate";

export interface SheetRow {
  rowNum: number;
  /** column letter -> raw cell text (shared strings resolved; numbers as strings) */
  cells: Record<string, string>;
}

export interface SheetGrid {
  rows: SheetRow[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: false, // Meeting Patterns cells rely on preserved '\n\n' separators
  parseTagValue: false,
  isArray: (name) => name === "si" || name === "r" || name === "row" || name === "c",
});

const MAX_COMPRESSED_BYTES = 10 * 1024 * 1024;
const MAX_ENTRY_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
const MAX_GRID_TEXT_UNITS = 2 * 1024 * 1024;
const MAX_ENTRIES = 128;
const INPUT_CHUNK_BYTES = 1024;
const SHEET_PATH = /^xl\/worksheets\/sheet\d+\.xml$/;

interface ZipEntry {
  name: string;
  start: number;
  dataStart: number;
  dataEnd: number;
  end: number;
  originalSize: number;
  crc: number;
}

function invalidZip(): never {
  throw new Error("Malformed or unsupported xlsx ZIP archive");
}

function isRelevant(name: string): boolean {
  return name === "xl/sharedStrings.xml" || SHEET_PATH.test(name);
}

// Unzip does not validate the central directory or require an end record.
function zipDirectory(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (at: number) => view.getUint16(at, true);
  const u32 = (at: number) => view.getUint32(at, true);
  let end = bytes.length - 22;
  for (; end >= Math.max(0, bytes.length - 22 - 65535); end--) {
    if (u32(end) === 0x06054b50 && end + 22 + u16(end + 20) === bytes.length) break;
  }
  if (end < 0 || end < bytes.length - 22 - 65535) invalidZip();
  const count = u16(end + 10);
  if (count > MAX_ENTRIES) throw new Error("Too many entries in xlsx archive");
  const start = u32(end + 16);
  if (u32(end + 4) !== 0 || u16(end + 8) !== count || start + u32(end + 12) !== end) invalidZip();

  const entries: ZipEntry[] = [];
  const relevantNames = new Set<string>();
  let at = start;
  for (let i = 0; i < count; i++) {
    if (at + 46 > end || u32(at) !== 0x02014b50) invalidZip();
    const flags = u16(at + 8);
    const method = u16(at + 10);
    const crc = u32(at + 16);
    const compressedSize = u32(at + 20);
    const originalSize = u32(at + 24);
    const nameLength = u16(at + 28);
    const next = at + 46 + nameLength + u16(at + 30) + u16(at + 32);
    const local = u32(at + 42);
    // Reject ZIP64, split archives, encryption and unsupported compression.
    if (
      next > end ||
      u16(at + 34) !== 0 ||
      flags & ~0x080e ||
      (method !== 0 && method !== 8) ||
      originalSize === 0xffffffff
    )
      invalidZip();
    if (
      local + 30 > start ||
      u32(local) !== 0x04034b50 ||
      u16(local + 6) !== flags ||
      u16(local + 8) !== method ||
      u16(local + 26) !== nameLength
    )
      invalidZip();
    const dataStart = local + 30 + nameLength + u16(local + 28);
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > start) invalidZip();
    const nameBytes = bytes.subarray(at + 46, at + 46 + nameLength);
    if (!nameBytes.every((value, j) => value === bytes[local + 30 + j])) invalidZip();
    const name = strFromU8(nameBytes, !(flags & 0x0800));
    if (isRelevant(name)) {
      if (relevantNames.has(name)) throw new Error("Duplicate worksheet or shared strings path in xlsx archive");
      relevantNames.add(name);
    }
    let localEnd = dataEnd;
    if (flags & 8) {
      if (dataEnd + 12 > start) invalidZip();
      const descriptor = dataEnd + (u32(dataEnd) === 0x08074b50 ? 4 : 0);
      localEnd = descriptor + 12;
      if (
        localEnd > start ||
        u32(descriptor) !== crc ||
        u32(descriptor + 4) !== compressedSize ||
        u32(descriptor + 8) !== originalSize
      )
        invalidZip();
      if (
        (u32(local + 14) !== 0 && u32(local + 14) !== crc) ||
        (u32(local + 18) !== 0 && u32(local + 18) !== compressedSize) ||
        (u32(local + 22) !== 0 && u32(local + 22) !== originalSize)
      )
        invalidZip();
    } else if (u32(local + 14) !== crc || u32(local + 18) !== compressedSize || u32(local + 22) !== originalSize) {
      invalidZip();
    }
    entries.push({ name, start: local, dataStart, dataEnd, end: localEnd, originalSize, crc });
    at = next;
  }
  if (at !== end) invalidZip();
  let localEnd = 0;
  for (const entry of [...entries].sort((a, b) => a.start - b.start)) {
    if (entry.start !== localEnd) invalidZip();
    localEnd = entry.end;
  }
  if (localEnd !== start) invalidZip();
  return entries;
}

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});

function unzipWorkbook(buf: ArrayBuffer): Record<string, Uint8Array> {
  if (buf.byteLength > MAX_COMPRESSED_BYTES) throw new Error("Compressed xlsx input exceeds size limit");
  const bytes = new Uint8Array(buf);
  const entries = zipDirectory(bytes);
  const files: Record<string, Uint8Array> = Object.create(null);
  let total = 0;
  // Preserve central-directory order for the worksheet fallback.
  for (const entry of entries) {
    if (!isRelevant(entry.name)) continue;
    let completed = false;
    const unzip = new Unzip((file) => {
      if (file.name !== entry.name) invalidZip();
      const chunks: Uint8Array[] = [];
      let size = 0;
      let crc = 0xffffffff;
      file.ondata = (error, chunk, final) => {
        if (error) throw error;
        size += chunk.length;
        total += chunk.length;
        if (size > MAX_ENTRY_BYTES || total > MAX_TOTAL_BYTES) throw new Error("Expanded xlsx data exceeds size limit");
        for (const byte of chunk) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
        chunks.push(chunk);
        if (final) {
          if (size !== entry.originalSize) throw new Error("Uncompressed xlsx entry size mismatch");
          if ((crc ^ 0xffffffff) >>> 0 !== entry.crc) throw new Error("Xlsx entry checksum mismatch");
          const content = new Uint8Array(size);
          let offset = 0;
          for (const part of chunks) {
            content.set(part, offset);
            offset += part.length;
          }
          files[file.name] = content;
          completed = true;
        }
      };
      file.start();
    });
    unzip.register(UnzipInflate);
    // Use validated sizes in a copied header to avoid descriptor-signature scans inside compressed data.
    const header = bytes.slice(entry.start, entry.dataStart);
    const view = new DataView(header.buffer);
    view.setUint16(6, view.getUint16(6, true) & ~8, true);
    view.setUint32(14, entry.crc, true);
    view.setUint32(18, entry.dataEnd - entry.dataStart, true);
    view.setUint32(22, entry.originalSize, true);
    // Small input chunks bound each inflate allocation before ondata can check it.
    for (const part of [header, bytes.subarray(entry.dataStart, entry.dataEnd)]) {
      for (let at = 0; at < part.length; at += INPUT_CHUNK_BYTES) {
        unzip.push(part.subarray(at, at + INPUT_CHUNK_BYTES), false);
      }
    }
    // Unzip needs a byte after the header to recognize a zero-length entry.
    unzip.push(new Uint8Array(1), true);
    if (!completed) invalidZip();
  }
  return files;
}

function parseXml(bytes: Uint8Array) {
  const xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml))
    throw new Error("DTD and entity declarations are not allowed in xlsx XML");
  return parser.parse(xml, true);
}

/** Extract concatenated text from a <t> node or rich-text <r> runs. */
function textOf(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    // Check child elements before '#text': with trimValues=false, container
    // nodes like <si> carry inter-element whitespace as '#text'.
    if ("t" in obj) return textOf(obj["t"]);
    if ("r" in obj) return textOf(obj["r"]);
    if ("#text" in obj) return String(obj["#text"]);
  }
  return "";
}

function parseSharedStrings(bytes: Uint8Array): string[] {
  const doc = parseXml(bytes);
  const sis = doc?.sst?.si ?? [];
  return (Array.isArray(sis) ? sis : [sis]).map(textOf);
}

/** 'G4' -> 'G'; 'AA12' -> 'AA' */
function colOf(ref: string): string {
  const m = ref.match(/^([A-Z]+)\d+$/);
  return m ? m[1] : "";
}

/** Prefer sheet1, then the first numbered worksheet in central-directory order. */
function findSheetPath(files: Record<string, Uint8Array>): string {
  if (files["xl/worksheets/sheet1.xml"]) return "xl/worksheets/sheet1.xml";
  const candidate = Object.keys(files).find((p) => SHEET_PATH.test(p));
  if (candidate) return candidate;
  throw new Error("No worksheet found in xlsx file");
}

/**
 * Read a Workday schedule .xlsx into a sparse grid.
 * NOTE: the sheet's <dimension> is wrong (A1:A1) and empty cells are omitted
 * entirely, so we scan every <row>/<c> and key cells by column letter.
 */
export function readXlsx(buf: ArrayBuffer): SheetGrid {
  const files = unzipWorkbook(buf);

  const sharedStrings = files["xl/sharedStrings.xml"] ? parseSharedStrings(files["xl/sharedStrings.xml"]) : [];

  const doc = parseXml(files[findSheetPath(files)]);
  const xmlRows = doc?.worksheet?.sheetData?.row ?? [];

  const rows: SheetRow[] = [];
  let textUnits = 0;
  for (const xmlRow of Array.isArray(xmlRows) ? xmlRows : [xmlRows]) {
    const rowNum = parseInt(xmlRow["@_r"] ?? "0", 10);
    const cells: Record<string, string> = {};
    const xmlCells = xmlRow.c ?? [];
    for (const c of Array.isArray(xmlCells) ? xmlCells : [xmlCells]) {
      const ref: string = c["@_r"] ?? "";
      const type: string = c["@_t"] ?? "n";
      let value = "";
      if (type === "s") {
        const idx = parseInt(textOf(c.v), 10);
        value = sharedStrings[idx] ?? "";
      } else if (type === "inlineStr") {
        value = textOf(c.is);
      } else {
        value = textOf(c.v);
      }
      if (ref && value !== "") {
        // Shared-string references can multiply downstream text processing without enlarging the ZIP.
        textUnits += value.length;
        if (textUnits > MAX_GRID_TEXT_UNITS) throw new Error("Expanded worksheet text exceeds size limit");
        cells[colOf(ref)] = value;
      }
    }
    if (Object.keys(cells).length > 0) rows.push({ rowNum, cells });
  }
  rows.sort((a, b) => a.rowNum - b.rowNum);
  return { rows };
}
