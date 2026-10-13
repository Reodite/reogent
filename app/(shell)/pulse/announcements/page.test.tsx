// @vitest-environment happy-dom
import { WorkspaceHostProvider } from "@/src/components/shell/workspace-host";
import type { Announcement } from "@/src/server/announcements";
import { cleanup, render, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AnnouncementNotFound from "./[slug]/not-found";
import AnnouncementPage, { generateMetadata, generateStaticParams } from "./[slug]/page";
import AnnouncementsPage from "./page";

const data = vi.hoisted(() => ({ getAnnouncements: vi.fn(), getAnnouncement: vi.fn() }));
vi.mock("@/src/server/announcements", () => data);
vi.mock("next/navigation", () => ({
  usePathname: () => "/pulse/announcements",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  notFound: () => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  },
}));

const announcement: Announcement = {
  slug: "campus-update",
  title: "A campus update",
  date: "2026-10-13",
  summary: "A short preview for the feed.",
  author: "Reodite team",
  content: [
    "## Full details",
    "Read **the full update** and [visit Pulse](/pulse).",
    "- A useful change",
    "| Change | Status |\n| --- | --- |\n| Announcements | Available |",
    "```text\nA code example\n```",
    "# A heading inside the post",
    "<script>alert('unsafe')</script>",
    "<iframe src='https://example.com'></iframe>",
    "[Unsafe link](javascript:alert%281%29)",
  ].join("\n\n"),
};

beforeEach(() => {
  data.getAnnouncements.mockReset().mockResolvedValue([announcement]);
  data.getAnnouncement.mockReset().mockResolvedValue(announcement);
});
afterEach(cleanup);

const params = (slug = announcement.slug) => ({ params: Promise.resolve({ slug }) });

describe("announcement routes", () => {
  it("renders linked preview cards in the feed's order inside the Unity workspace", async () => {
    data.getAnnouncements.mockResolvedValue([
      announcement,
      { ...announcement, slug: "older-update", title: "An older update", date: "2026-10-01" },
    ]);
    const view = render(
      <WorkspaceHostProvider host="unity" navigation={<button type="button">Unity menu</button>}>
        {await AnnouncementsPage()}
      </WorkspaceHostProvider>,
    );
    expect(view.getByRole("heading", { level: 1 }).textContent).toBe("Announcements");
    expect(view.getByRole("button", { name: "Unity menu" })).toBeTruthy();
    const feed = view.getByRole("region", { name: "Announcements feed" });
    expect(feed.tabIndex).toBe(0);
    expect(view.container.querySelector("[data-workspace-page]")?.getAttribute("data-workspace-host")).toBe("unity");
    expect(
      within(feed)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual(["/pulse/announcements/campus-update", "/pulse/announcements/older-update"]);
    const card = within(feed).getByRole("link", { name: announcement.title });
    expect(card.textContent).toContain(announcement.summary);
    expect(card.querySelector("time")?.getAttribute("datetime")).toBe(announcement.date);
    expect(card.textContent).toContain("October 13, 2026");
    expect(view.queryByText("Full details")).toBeNull();
  });

  it("shows an honest empty state when no entries exist", async () => {
    data.getAnnouncements.mockResolvedValue([]);
    const view = render(await AnnouncementsPage());
    expect(view.getByRole("heading", { name: "No announcements yet" })).toBeTruthy();
    expect(view.queryAllByRole("link")).toHaveLength(0);
  });

  it("renders a complete safe Markdown post with a 44px return link", async () => {
    const view = render(await AnnouncementPage(params()));
    expect(data.getAnnouncement).toHaveBeenCalledWith(announcement.slug);
    expect(view.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(view.getByRole("heading", { level: 1 }).textContent).toBe(announcement.title);
    const reader = view.getByRole("region", { name: "Announcement details" });
    expect(reader.tabIndex).toBe(0);
    expect(within(reader).getByRole("heading", { name: "Full details" })).toBeTruthy();
    expect(view.container.querySelector("strong")?.textContent).toBe("the full update");
    expect(within(reader).getByRole("link", { name: "visit Pulse" }).getAttribute("href")).toBe("/pulse");
    expect(within(reader).getByRole("table")).toBeTruthy();
    expect(within(reader).getByRole("region", { name: "Announcement table" }).tabIndex).toBe(0);
    expect(within(reader).getByRole("region", { name: "Code example" }).tabIndex).toBe(0);
    expect(view.container.querySelector("script, iframe, a[href^='javascript:']")).toBeNull();
    const back = view.getByRole("link", { name: "Back to Announcements" });
    expect(back.getAttribute("href")).toBe("/pulse/announcements");
    expect(back.classList.contains("size-11")).toBe(true);
    expect(back.classList.contains("neu-button")).toBe(false);
    expect(back.querySelector("svg")?.getAttribute("width")).toBe("20");
  });

  it("prebuilds published detail URLs and supplies each post's metadata", async () => {
    expect(await generateStaticParams()).toEqual([{ slug: announcement.slug }]);
    expect(await generateMetadata(params())).toEqual({
      title: `${announcement.title} | Reodite`,
      description: announcement.summary,
    });
  });

  it("uses the not-found boundary for unknown posts and their metadata", async () => {
    data.getAnnouncement.mockResolvedValue(undefined);
    await expect(AnnouncementPage(params("missing"))).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    await expect(generateMetadata(params("missing"))).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    const view = render(<AnnouncementNotFound />);
    expect(view.getByRole("heading", { name: "Announcement not found" })).toBeTruthy();
    expect(view.getByRole("link", { name: "View announcements" }).getAttribute("href")).toBe("/pulse/announcements");
  });
});
