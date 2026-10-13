import { AnnouncementDetails } from "@/src/components/unity/announcements";
import { getAnnouncement, getAnnouncements } from "@/src/server/announcements";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return (await getAnnouncements()).map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const announcement = await getAnnouncement((await params).slug);
  if (!announcement) notFound();
  return { title: `${announcement.title} | Reodite`, description: announcement.summary };
}

export default async function AnnouncementPage({ params }: Props) {
  const announcement = await getAnnouncement((await params).slug);
  if (!announcement) notFound();
  return <AnnouncementDetails announcement={announcement} />;
}
