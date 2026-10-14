import { AnnouncementsFeed } from "@/src/components/unity/announcements";
import { getAnnouncements } from "@/src/server/announcements";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Announcements | Reodite",
  description: "Updates from the Reodite developers.",
};

export default async function AnnouncementsPage() {
  return <AnnouncementsFeed announcements={await getAnnouncements()} />;
}
