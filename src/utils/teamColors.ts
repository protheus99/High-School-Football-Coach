// Small color helpers for school badges and cards (New Game): readable text on a school's colors, and a neutral look for
// a school whose colors are not on file.

/** Relative luminance of a #RRGGBB color (0 black ... 1 white). */
export function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const v = [0, 2, 4].map((i) => {
    const c = parseInt(h.substr(i, 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}

export const contrastRatio = (a: string, b: string) => {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/** A color made darker (f < 0) or lighter (f > 0). */
export function shade(hex: string, f: number): string {
  const h = hex.replace('#', '');
  return (
    '#' +
    [0, 2, 4]
      .map((i) => {
        const c = parseInt(h.substr(i, 2), 16);
        return Math.round(f < 0 ? c * (1 + f) : c + (255 - c) * f)
          .toString(16)
          .padStart(2, '0');
      })
      .join('')
  );
}

const NEUTRAL_EDGE = '#64748B';

/** The badge's look: background, text and ring; undefined colors get the striped neutral badge. */
export function badgeColors(colors?: [string, string]): { background: string; color: string; ring: string } | null {
  if (!colors) return null;
  const [c1, c2] = colors;
  const color = contrastRatio(c1, c2) >= 2.2 ? c2 : luminance(c1) > 0.4 ? '#0F172A' : '#FFFFFF';
  const ring = contrastRatio(c1, '#FFFFFF') < 1.4 ? 'rgba(15,23,42,.25)' : 'rgba(255,255,255,.28)';
  return { background: c1, color, ring };
}

/** A card's colored edge: the school's main color, or its second when the main one is white on a white card. */
export const teamEdge = (colors?: [string, string]) => (!colors ? NEUTRAL_EDGE : contrastRatio(colors[0], '#FFFFFF') < 1.3 ? colors[1] : colors[0]);

/** The confirm card's header: the school's darker color, fading darker. */
export function heroBackground(colors?: [string, string]): string {
  if (!colors) return 'linear-gradient(135deg,#475569,#1E293B)';
  const base = colors.find((c) => luminance(c) < 0.5) ?? '#334155';
  return `linear-gradient(135deg, ${base}, ${shade(base, -0.45)})`;
}

/** Two letters for a badge: "Austin Westlake" → "AW", skipping words like High, School, St. */
export function schoolInitials(name: string): string {
  const w = name
    .replace(/[^A-Za-z0-9 \-']/g, ' ')
    .split(/[\s-]+/)
    .filter((x) => x && !/^(high|school|hs|of|the|st|academy)$/i.test(x));
  if (w.length >= 2) return (w[0][0] + w[1][0]).toUpperCase();
  return (w[0] || name || '?')[0].toUpperCase();
}
