import { strToU8, UnzipInflate, Zip, ZipDeflate, zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import { readXlsx } from "./xlsxReader";

const sheetPath = "xl/worksheets/sheet1.xml";
const sheet =
  '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Schedule</t></is></c></row></sheetData></worksheet>';
const MiB = 1024 * 1024;

function archive(files: Record<string, string>, level: 0 | 6 = 6): Uint8Array<ArrayBuffer> {
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, xml]) => [name, strToU8(xml)])), { level });
}

function read(bytes: Uint8Array<ArrayBuffer>) {
  return readXlsx(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

function directoryOffset(bytes: Uint8Array): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(bytes.length - 6, true);
}

function declareSize(bytes: Uint8Array, size: number) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  view.setUint32(22, size, true);
  view.setUint32(directoryOffset(bytes) + 24, size, true);
}

function streamedArchive(): Uint8Array<ArrayBuffer> {
  const chunks: Uint8Array[] = [];
  const zip = new Zip((error, data) => {
    if (error) throw error;
    chunks.push(data);
  });
  const file = new ZipDeflate(sheetPath);
  zip.add(file);
  file.push(strToU8(sheet), true);
  zip.end();
  const bytes = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

describe("readXlsx", () => {
  it("preserves shared rich text, inline entities, whitespace and numeric cells", () => {
    const bytes = archive({
      "xl/sharedStrings.xml": "<sst><si>\n<r><t>First &amp; </t></r><r><t>second\n\nline</t></r>\n</si></sst>",
      [sheetPath]:
        '<worksheet><sheetData><row r="2"><c r="B2"><v>42</v></c></row><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="inlineStr"><is><t>&lt;Text&gt; &#65; &quot;quoted&quot;</t></is></c></row></sheetData></worksheet>',
    });
    expect(read(bytes)).toEqual({
      rows: [
        { rowNum: 1, cells: { A: "First & second\n\nline", C: '<Text> &#65; "quoted"' } },
        { rowNum: 2, cells: { B: "42" } },
      ],
    });
  });

  it("prefers sheet1 and otherwise uses central-directory worksheet order", () => {
    const files = { "xl/worksheets/sheet3.xml": sheet.replace("Schedule", "Third"), "xl/worksheets/sheet2.xml": sheet };
    expect(read(archive({ ...files, [sheetPath]: sheet.replace("Schedule", "First") })).rows[0].cells.A).toBe("First");
    const bytes = archive(files);
    const start = directoryOffset(bytes);
    const length = 46 + strToU8("xl/worksheets/sheet3.xml").length;
    const first = bytes.slice(start, start + length);
    bytes.copyWithin(start, start + length, start + length * 2);
    bytes.set(first, start + length);
    expect(read(bytes).rows[0].cells.A).toBe("Schedule");
  });

  it("supports stored entries and streaming data descriptors", () => {
    expect(read(archive({ [sheetPath]: sheet }, 0)).rows[0].cells.A).toBe("Schedule");
    const streamed = streamedArchive();
    expect(read(streamed).rows[0].cells.A).toBe("Schedule");
    const start = directoryOffset(streamed);
    const unsigned = new Uint8Array(streamed.length - 4);
    unsigned.set(streamed.subarray(0, start - 16));
    unsigned.set(streamed.subarray(start - 12), start - 16);
    new DataView(unsigned.buffer).setUint32(unsigned.length - 6, start - 4, true);
    expect(read(unsigned).rows[0].cells.A).toBe("Schedule");
  });

  it("skips unused large entries and feeds at most 1 KiB to the inflater", () => {
    const bytes = archive({ "xl/media/unused.bin": "x".repeat(3 * MiB), [sheetPath]: sheet });
    const inflate = vi.spyOn(UnzipInflate.prototype, "push");
    try {
      expect(read(bytes).rows[0].cells.A).toBe("Schedule");
      expect(inflate).toHaveBeenCalled();
      const compressedSheetSize = new DataView(archive({ [sheetPath]: sheet }).buffer).getUint32(18, true);
      expect(inflate.mock.calls.reduce((size, [chunk]) => size + chunk.length, 0)).toBe(compressedSheetSize);
      expect(inflate.mock.calls.every(([chunk]) => chunk.length <= 1024)).toBe(true);
    } finally {
      inflate.mockRestore();
    }
  });

  it.each([false, true])("rejects required compressed bombs (dishonest size: %s)", (dishonest) => {
    const bytes = archive({ [sheetPath]: `${sheet}${" ".repeat(2 * MiB)}` });
    if (dishonest) declareSize(bytes, 1);
    expect(() => read(bytes)).toThrow(/exceeds.*limit/i);
  });

  it.each([-1, 1])("rejects original-size mismatches of %s bytes", (difference) => {
    const xml = `${sheet}  `;
    const bytes = archive({ [sheetPath]: xml });
    declareSize(bytes, strToU8(xml).length + difference);
    expect(() => read(bytes)).toThrow(/size mismatch/i);
  });

  it("bounds total actual output across worksheets", () => {
    const xml = `${sheet}${" ".repeat(1.5 * MiB)}`;
    expect(() =>
      read(archive({ [sheetPath]: xml, "xl/worksheets/sheet2.xml": xml, "xl/worksheets/sheet3.xml": xml })),
    ).toThrow(/exceeds.*limit/i);
  });

  it("accepts output exactly at the entry and total limits", () => {
    const xml = sheet.padEnd(2 * MiB, " ");
    expect(read(archive({ [sheetPath]: xml, "xl/worksheets/sheet2.xml": xml })).rows[0].cells.A).toBe("Schedule");
  });

  it("caps compressed input at the reader boundary", () => {
    expect(() => readXlsx(new ArrayBuffer(10 * MiB + 1))).toThrow(/compressed.*limit/i);
  });

  it("rejects excessive entries, including unused ones", () => {
    const files = Object.fromEntries(Array.from({ length: 128 }, (_, i) => [`unused-${i}`, ""]));
    expect(() => read(archive({ [sheetPath]: sheet, ...files }))).toThrow(/entries/i);
  });

  it("rejects duplicate relevant paths", () => {
    const bytes = archive({ [sheetPath]: sheet, "xl/worksheets/sheet2.xml": sheet });
    const name = strToU8("xl/worksheets/sheet2.xml");
    for (let i = 0; i <= bytes.length - name.length; i++) {
      if (name.every((value, j) => bytes[i + j] === value)) bytes[i + name.length - 5] = "1".charCodeAt(0);
    }
    expect(() => read(bytes)).toThrow(/duplicate/i);
  });

  it.each([1, 22, 40])("rejects a truncated archive missing %s trailing bytes", (missing) => {
    const bytes = archive({ [sheetPath]: sheet });
    expect(() => read(bytes.slice(0, -missing))).toThrow();
  });

  it.each(["local header", "directory header", "local size", "descriptor"])("rejects a malformed %s", (part) => {
    const bytes = part === "descriptor" ? streamedArchive() : archive({ [sheetPath]: sheet });
    const offset =
      part === "directory header"
        ? directoryOffset(bytes)
        : part === "local size"
          ? 18
          : part === "descriptor"
            ? directoryOffset(bytes) - 4
            : 0;
    bytes[offset] ^= 1;
    expect(() => read(bytes)).toThrow();
  });

  it("rejects a checksum mismatch in an extracted entry", () => {
    const bytes = archive({ [sheetPath]: sheet });
    bytes[14] ^= 1;
    bytes[directoryOffset(bytes) + 16] ^= 1;
    expect(() => read(bytes)).toThrow(/checksum mismatch/i);
  });

  it.each(["encryption", "split archive", "ZIP64"])("rejects unsupported %s", (kind) => {
    const bytes = archive({ [sheetPath]: sheet });
    const view = new DataView(bytes.buffer);
    if (kind === "encryption") {
      view.setUint16(6, 1, true);
      view.setUint16(directoryOffset(bytes) + 8, 1, true);
    } else if (kind === "split archive") {
      view.setUint16(bytes.length - 18, 1, true);
    } else {
      declareSize(bytes, 0xffffffff);
    }
    expect(() => read(bytes)).toThrow(/unsupported/i);
  });

  it("does not treat ZIP comment bytes as additional entries", () => {
    const bytes = zipSync({ [sheetPath]: strToU8(sheet) }, { comment: "PK\x03\x04".repeat(16) });
    expect(read(bytes).rows[0].cells.A).toBe("Schedule");
  });

  it("rejects corrupt deflate data", () => {
    const bytes = archive({ [sheetPath]: sheet });
    bytes[30 + strToU8(sheetPath).length] = 7;
    expect(() => read(bytes)).toThrow();
  });

  it.each([sheetPath, "xl/sharedStrings.xml"])("rejects declarations before parsing %s", (path) => {
    const xml = path === sheetPath ? sheet : "<sst><si><t>&custom;</t></si></sst>";
    for (const declaration of ['<!DOCTYPE worksheet [<!ENTITY custom "expanded">]>', '<!ENTITY custom "expanded">']) {
      expect(() => read(archive({ [sheetPath]: sheet, [path]: `${declaration}${xml}` }))).toThrow(/DTD|entity/i);
    }
  });

  it("rejects malformed selected XML", () => {
    expect(() => read(archive({ [sheetPath]: "<worksheet><sheetData>" }))).toThrow();
  });
});
