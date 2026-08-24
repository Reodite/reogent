import { redirect } from "next/navigation";

// /tools with no slug lands on the first tool (map). An index isn't a useful
// destination — the sidebar is the entry point, not a tools landing page.
export default function ToolsIndex() {
  redirect("/tools/map");
}
