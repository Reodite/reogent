import { ScheduleApp } from "@/src/components/schedule/schedule-app";

export default async function SharedSchedulePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <ScheduleApp groupCode={code} />;
}
