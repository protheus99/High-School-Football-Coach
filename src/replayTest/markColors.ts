import { Team } from '../types/game';

const nice = (c?: string) => (c && c.toUpperCase() !== '#FFFFFF' ? c : '#334155');

/** A school's two colors for its marks: the main one, and an edge that stands out from it (white when the second color
 * is white or missing) */
export const markColors = (t: Team) => {
  const main = nice(t.primaryColor);
  const sec = t.secondaryColor && t.secondaryColor.toUpperCase() !== '#FFFFFF' && t.secondaryColor.toUpperCase() !== main.toUpperCase() ? t.secondaryColor : '#FFFFFF';
  return { main, edge: sec };
};
