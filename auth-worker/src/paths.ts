// Where a player may be sent back to after signing in.

/** Only a path on the game's own site (no other sites: "//evil.example" is refused). */
export function safeReturn(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\') || value.length > 200) return '/';
  return value;
}
