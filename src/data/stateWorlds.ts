import texas6A from './texas-6a.json';
import georgia7A from './georgia-7a.json';
import florida6A from './florida-6a.json';
import maryland4A from './maryland-4a.json';
import northCarolina8A from './north-carolina-8a.json';
import alabama6A from './alabama-6a.json';
import tennessee6A from './tennessee-6a.json';
import ohioD1 from './ohio-d1.json';
import pennsylvania6A from './pennsylvania-6a.json';
import newJerseyG5 from './new-jersey-g5.json';
import louisiana5A from './louisiana-5a.json';
import californiaOpen from './california-open.json';

/** A playable state's bundled top class: regions of districts of schools (built from the design spec / official alignments). */
export interface StateWorldData {
  regions: {
    name: string;
    area: string;
    districts: {
      number: number;
      name: string;
      area: string;
      schools: { name: string; city?: string; mascot: string; primaryColor: string; secondaryColor: string; prestige: number; offenseScheme: string; defenseScheme: string }[];
    }[];
  }[];
}

/** Every playable state's school data (also read by the Hall of Fame server to check a career's school). */
export const STATE_DATA: Record<string, StateWorldData> = {
  Texas: texas6A,
  Georgia: georgia7A,
  Florida: florida6A,
  Maryland: maryland4A,
  'North Carolina': northCarolina8A,
  Alabama: alabama6A,
  Tennessee: tennessee6A,
  Ohio: ohioD1,
  Pennsylvania: pennsylvania6A,
  'New Jersey': newJerseyG5,
  Louisiana: louisiana5A,
  California: californiaOpen
};

/** A school's prestige in the state's data, or undefined when the state has no such school. */
export function dataPrestige(state: string, school: string): number | undefined {
  for (const region of STATE_DATA[state]?.regions ?? []) {
    for (const district of region.districts) {
      const s = district.schools.find((x) => x.name === school);
      if (s) return s.prestige;
    }
  }
  return undefined;
}
