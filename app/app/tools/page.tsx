import { redirect } from "next/navigation";

// Open the map when no tool slug appears in the URL.
export default function ToolsIndex() {
  redirect("/app/tools/map");
}
