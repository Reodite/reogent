import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { getAnnouncement, getAnnouncements } from "@/src/server/announcements";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fs = vi.hoisted(() => ({ readdir: vi.fn(), readFile: vi.fn() }));
vi.mock("node:fs/promises", () => fs);

const metadata = {
  title: "A campus update",
  date: "2026-10-13",
  summary: "A short description for the feed.",
  author: "Reodite team",
};
const body = "## The details\n\nRead **the full update**.";
const markdown = (fields: unknown = metadata, content = body) =>
  `---\n${JSON.stringify(fields, null, 2)}\n---\n\n${content}\n`;
const files = new Map<string, string>();

beforeEach(() => {
  files.clear();
  fs.readdir.mockReset().mockImplementation(async () => [...files.keys()]);
  fs.readFile.mockReset().mockImplementation(async (path: string) => files.get(basename(path)));
});

describe("announcement publishing", () => {
  it("validates the repository's published entries", async () => {
    const directory = join(process.cwd(), "content", "announcements");
    const filenames = readdirSync(directory).filter((filename) => filename.endsWith(".md"));
    for (const filename of filenames) files.set(filename, readFileSync(join(directory, filename), "utf8"));
    expect(await getAnnouncements()).toHaveLength(filenames.length);
  });

  it("loads Markdown entries newest first with stable ordering on the same date", async () => {
    files.set("older.md", markdown({ ...metadata, date: "2026-10-01" }));
    files.set("z-update.md", markdown());
    files.set("a-update.md", markdown());
    files.set("notes.txt", "Not published");

    const entries = await getAnnouncements();
    expect(entries.map(({ slug }) => slug)).toEqual(["a-update", "z-update", "older"]);
    expect(entries[0]).toEqual({ ...metadata, slug: "a-update", content: body });
    expect(fs.readFile).toHaveBeenCalledTimes(3);
  });

  it("accepts Windows line endings and a UTF-8 BOM without changing Markdown", async () => {
    files.set("update.md", `\uFEFF${markdown().replaceAll("\n", "\r\n")}`);
    expect(await getAnnouncement("update")).toEqual({ ...metadata, slug: "update", content: body });
  });

  it("returns an empty feed when there are no published Markdown files", async () => {
    expect(await getAnnouncements()).toEqual([]);
  });

  it("looks up an entry by its exact filename slug", async () => {
    files.set("update.md", markdown());
    expect((await getAnnouncement("update"))?.title).toBe(metadata.title);
    expect(await getAnnouncement("missing")).toBeUndefined();
  });

  it.each(["../update", "..", "a/b", "a\\b", "%2e%2e", "", "Update", "update.md"])(
    "rejects unsafe or noncanonical lookup %s without reading files",
    async (slug) => {
      expect(await getAnnouncement(slug)).toBeUndefined();
      expect(fs.readdir).not.toHaveBeenCalled();
      expect(fs.readFile).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["missing frontmatter", body],
    ["invalid JSON", "---\n{broken}\n---\nDetails"],
    ["null metadata", markdown(null)],
    ["array metadata", markdown([])],
    ["missing title", markdown({ ...metadata, title: undefined })],
    ["blank summary", markdown({ ...metadata, summary: "  " })],
    ["invalid author", markdown({ ...metadata, author: 4 })],
    ["invalid date format", markdown({ ...metadata, date: "October 13, 2026" })],
    ["impossible date", markdown({ ...metadata, date: "2026-02-30" })],
    ["empty body", markdown(metadata, "  ")],
  ])("reports the filename for %s instead of dropping an entry", async (_label, source) => {
    files.set("bad-entry.md", source);
    await expect(getAnnouncements()).rejects.toThrow('Invalid announcement "bad-entry.md"');
  });

  it("requires lowercase hyphenated filenames for stable URLs", async () => {
    files.set("Bad Entry.md", markdown());
    await expect(getAnnouncements()).rejects.toThrow('Invalid announcement "Bad Entry.md"');
  });

  it("surfaces file read failures instead of publishing a partial feed", async () => {
    files.set("update.md", markdown());
    fs.readFile.mockRejectedValueOnce(new Error("Permission denied"));
    await expect(getAnnouncements()).rejects.toThrow('Invalid announcement "update.md": Permission denied');
  });
});
