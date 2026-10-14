/** Keeps post-login destinations on this site and outside the authentication flow. */
export function safeAuthRedirect(value: string | null): string {
  if (
    !value?.startsWith("/") ||
    value.startsWith("//") ||
    Array.from(value).some((char) => char === "\\" || char.charCodeAt(0) <= 31 || char.charCodeAt(0) === 127)
  ) {
    return "/app";
  }
  const origin = "https://reodite.invalid";
  try {
    const url = new URL(value, origin);
    if (url.origin === origin && !/^\/(login|signup|onboarding)(\/|$)/.test(url.pathname)) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
  } catch {}
  return "/app";
}
