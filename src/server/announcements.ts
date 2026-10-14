import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/** A developer-authored Markdown announcement and its feed metadata. */
export interface Announcement {
  slug: string;
  title: string;
  date: string;
  summary: string;
  author: string;
  content: string;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseAnnouncement(slug: string, source: string): Announcement {
  if (!SLUG.test(slug)) throw new Error("Use a lowercase, hyphenated filename");
  const normalized = source.replace(/^\uFEFF/, "").replaceAll("\r\n", "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/);
  if (!match) throw new Error("Start with JSON metadata between --- lines");
  const metadata: unknown = JSON.parse(match[1]);
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("Metadata must be a JSON object");
  }

  function text(field: string): string {
    const value = (metadata as Record<string, unknown>)[field];
    if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be a non-empty string`);
    return value.trim();
  }

  const date = text("date");
  const timestamp = Date.parse(date);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== date
  ) {
    throw new Error("date must be a valid YYYY-MM-DD calendar date");
  }
  const content = match[2].trim();
  if (!content) throw new Error("Add a Markdown body after the metadata");
  return { slug, title: text("title"), date, summary: text("summary"), author: text("author"), content };
}

/** Reads published Markdown newest first; invalid entries fail with their filename. */
export async function getAnnouncements(): Promise<Announcement[]> {
  const directory = join(process.cwd(), "content", "announcements");
  const filenames = await readdir(directory);
  const entries = await Promise.all(
    filenames
      .filter((name) => name.endsWith(".md"))
      .map(async (filename) => {
        try {
          return parseAnnouncement(filename.slice(0, -3), await readFile(join(directory, filename), "utf8"));
        } catch (error) {
          throw new Error(`Invalid announcement "${filename}": ${error instanceof Error ? error.message : error}`, {
            cause: error,
          });
        }
      }),
  );
  return entries.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

/** Finds a published entry without using route input as a filesystem path. */
export async function getAnnouncement(slug: string): Promise<Announcement | undefined> {
  if (!SLUG.test(slug)) return undefined;
  return (await getAnnouncements()).find((entry) => entry.slug === slug);
}
