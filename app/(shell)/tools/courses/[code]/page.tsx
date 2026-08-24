import { notFound } from "next/navigation";

// /tools/courses/<code>: route placeholder for a single course's detail view.
// Workspace activation is handled by ToolRouteActivator; this page exists so the
// URL reflects the active course and returns 404 for malformed codes.
export default async function CourseDetailPage(props: PageProps<"/tools/courses/[code]">) {
  const { code } = await props.params;
  if (!/^[A-Za-z]{2,4}[0-9]{3}[A-Za-z]?$/.test(code)) notFound();
  return null;
}
