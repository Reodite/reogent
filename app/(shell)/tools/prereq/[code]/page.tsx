import { courseSlugToCode } from "@/src/lib/pane-route";
import { notFound } from "next/navigation";

/** Validates a rooted prerequisite-tree URL; the shell activates its pane state. */
export default async function PrereqDetailPage(props: PageProps<"/tools/prereq/[code]">) {
  const { code } = await props.params;
  if (!courseSlugToCode(code)) notFound();
  return null;
}
