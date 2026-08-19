import { parseToolSlug } from "@/src/lib/pane-route";
import { notFound } from "next/navigation";

// /tools/<slug>: route placeholder. Workspace activation by URL is handled in
// ChatShellProvider (ToolRouteActivator). This page exists so the URL reflects
// the active tool and returns 404 for unknown slugs.
export default async function ToolPage(props: PageProps<"/tools/[tool]">) {
  const { tool } = await props.params;
  if (!parseToolSlug(tool)) notFound();
  return null;
}
