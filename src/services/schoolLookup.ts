// ---------------------------------------------------------------------------
// A school's missing mascot and colors, looked up while the coach fills in Coach Information. The lookup service (a
// Worker) is not deployed yet: until VITE_SCHOOL_LOOKUP_URL points at one, lookupAvailable is false and New Game only
// says the facts are not on file. The service answers GET <url>?state=<state>&school=<name>&city=<city> with
// { mascot?: string, primary?: '#RRGGBB', secondary?: '#RRGGBB' } (anything missing stays not on file).
// ---------------------------------------------------------------------------

export interface SchoolFacts {
  mascot?: string;
  colors?: [string, string];
}

const LOOKUP_URL = (import.meta.env.VITE_SCHOOL_LOOKUP_URL as string | undefined) ?? '';

export const lookupAvailable = LOOKUP_URL !== '';

/** The longest a coach waits for the lookup before the game starts without it. */
export const LOOKUP_TIMEOUT_MS = 6000;

const HEX = /^#[0-9A-Fa-f]{6}$/;
const clean = (v: unknown, max: number) => (typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : undefined);

/** The facts found, or null (nothing found, no service, offline, or too slow). Never throws. */
export async function lookupSchoolFacts(school: { state: string; name: string; city?: string }): Promise<SchoolFacts | null> {
  if (!lookupAvailable) return null;
  const params = new URLSearchParams({ state: school.state, school: school.name, ...(school.city && { city: school.city }) });
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const res = await fetch(`${LOOKUP_URL}?${params}`, { signal: abort.signal });
    if (!res.ok) return null;
    const body = (await res.json()) as Record<string, unknown>;
    const mascot = clean(body.mascot, 30);
    const primary = typeof body.primary === 'string' && HEX.test(body.primary) ? body.primary : undefined;
    const secondary = typeof body.secondary === 'string' && HEX.test(body.secondary) ? body.secondary : undefined;
    const facts: SchoolFacts = { ...(mascot && { mascot }), ...(primary && secondary && { colors: [primary, secondary] as [string, string] }) };
    return facts.mascot || facts.colors ? facts : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
