// Validates the `?next=…` redirect target after sign-in: only same-origin
// paths survive. Rejects absolute URLs, protocol-relative "//host", anything
// containing a backslash (WHATWG URLs treat "\" as "/", so "/\host" would
// resolve off-site) and control characters that could poison the Location
// header. Anything unsafe lands on /schedule.
function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function safeNext(value: string | null | undefined): string {
  if (!value) return "/schedule";
  const unsafe =
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    hasControlChars(value);
  return unsafe ? "/schedule" : value;
}
