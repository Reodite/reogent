"use client";

import { ChatPanel } from "@/src/components/chat/chat-panel";
import { use } from "react";

export default function SessionPage(props: PageProps<"/chat/[session_id]">) {
  const { session_id } = use(props.params);
  return <ChatPanel key={session_id} sessionId={session_id} />;
}
