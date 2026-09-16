/** Keeps post-login destinations on this site and outside the authentication flow. */
export function safeAuthRedirect(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/chat";
  const url = new URL(value, "https://reodite.local");
  if (url.origin !== "https://reodite.local" || /^\/(login|signup|onboarding)(\/|$)/.test(url.pathname)) return "/chat";
  return `${url.pathname}${url.search}${url.hash}`;
}
