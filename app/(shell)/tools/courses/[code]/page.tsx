import { courseSlugToCode } from "@/src/lib/pane-route";
import { notFound } from "next/navigation";

// /tools/courses/<code>: route placeholder for a single course's detail view.
// Workspace activation is handled by ToolRouteActivator; this page exists so the
// URL reflects the active course and returns 404 for malformed codes.
export default async function CourseDetailPage(props: PageProps<"/tools/courses/[code]">) {
  const { code } = await props.params;
  if (!courseSlugToCode(code)) notFound();
  return null;
}
