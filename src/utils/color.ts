/** Relative luminance (0 = black, 1 = white) of a #RGB or #RRGGBB color; undefined if unparseable. */
export function luminance(hex: string): number | undefined {
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return undefined;
  const full = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * A school color that stays readable as text on a white background: very light colors (white, gold,
 * silver…) fall back to the secondary color if that is dark enough, otherwise to slate.
 */
export function readableOnWhite(primary: string, secondary?: string): string {
  const ok = (c?: string) => {
    const l = c ? luminance(c) : undefined;
    return l !== undefined && l < 0.3; // at least 3:1 contrast against white (bold team names)
  };
  if (ok(primary)) return primary;
  if (ok(secondary)) return secondary!;
  return '#0F172A';
}
