import { parseToolSlug } from "@/src/lib/pane-route";
import { notFound } from "next/navigation";

// AppShell resolves the workspace from the displayed pathname. This route
// validates the slug and returns 404 before an unknown tool reaches the shell.
export default async function ToolPage(props: PageProps<"/tools/[tool]">) {
  const { tool } = await props.params;
  if (!parseToolSlug(tool)) notFound();
  return null;
}
