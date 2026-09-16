import { courseSlugToCode } from "@/src/lib/pane-route";
import { notFound } from "next/navigation";

// AppShell resolves course detail from the displayed pathname. This route
// validates the code and returns 404 before malformed input reaches the shell.
export default async function CourseDetailPage(props: PageProps<"/tools/courses/[code]">) {
  const { code } = await props.params;
  if (!courseSlugToCode(code)) notFound();
  return null;
}
