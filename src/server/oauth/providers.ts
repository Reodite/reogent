import { googleOAuthProvider } from "../google";
import type { OAuthProvider } from "./types";

const providers: Record<string, OAuthProvider> = {
  [googleOAuthProvider.id]: googleOAuthProvider,
};

export function getOAuthProvider(id: string): OAuthProvider | undefined {
  return providers[id];
}
