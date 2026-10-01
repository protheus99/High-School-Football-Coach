import { CollegeTier } from '../types/game';

/** A fictional college program that recruits Texas high school players. */
export interface College {
  id: string;
  name: string;
  tier: Exclude<CollegeTier, 'PWO'>; // walk-on spots are offered by Division I programs
  prestige: number; // 0-100: how attractive the program is to recruits
  academics: number; // 0-100: how selective admissions are
  national?: boolean; // national Power 4 brand: recruits only the very best
  inState?: boolean; // Texas school: a pull for players who want to stay close to home
}

const c = (
  name: string,
  tier: College['tier'],
  prestige: number,
  academics: number,
  extra: Partial<Pick<College, 'national' | 'inState'>> = {}
): College => ({
  id: `col_${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+$/, '')}`,
  name,
  tier,
  prestige,
  academics,
  ...extra
});

export const COLLEGES: College[] = [
  // Power 4: national brands
  c('Lakeshore University Admirals', 'POWER_4', 97, 86, { national: true }),
  c('Gulf Coast University Stingrays', 'POWER_4', 96, 62, { national: true, inState: true }),
  c('Great Plains State Thunder', 'POWER_4', 95, 58, { national: true }),
  c('Blue Ridge University Ravens', 'POWER_4', 94, 80, { national: true }),
  c('Pacific Crest University Condors', 'POWER_4', 93, 77, { national: true }),
  c('Bayou State Cypress Kings', 'POWER_4', 92, 52, { national: true }),
  // Power 4: regional programs
  c('Red River University Wranglers', 'POWER_4', 90, 64, { inState: true }),
  c('Panhandle State Twisters', 'POWER_4', 88, 55, { inState: true }),
  c('Hill Country University Pathfinders', 'POWER_4', 87, 78, { inState: true }),
  c('Ozark State Timberwolves', 'POWER_4', 86, 54),
  c('Prairie Tech Engineers', 'POWER_4', 85, 82),
  c('Cumberland University Generals', 'POWER_4', 84, 70),
  c('Mesa Verde State Coyotes', 'POWER_4', 83, 57),
  c('Tidewater University Sentinels', 'POWER_4', 82, 74),
  c('Northern Rivers University Huskies', 'POWER_4', 81, 66),
  c('Magnolia State Riverhawks', 'POWER_4', 80, 50),
  // Group of 5
  c('Coastal Bend University Sharks', 'GROUP_OF_5', 78, 55, { inState: true }),
  c('West Texas Tech Roughnecks', 'GROUP_OF_5', 76, 58, { inState: true }),
  c('Rio Grande State Javelinas', 'GROUP_OF_5', 75, 52, { inState: true }),
  c('Brazos Valley University Mustangs', 'GROUP_OF_5', 74, 72, { inState: true }),
  c('High Desert State Scorpions', 'GROUP_OF_5', 73, 50),
  c('Piney Woods University Loggers', 'GROUP_OF_5', 72, 54, { inState: true }),
  c('Permian State Drillers', 'GROUP_OF_5', 71, 48, { inState: true }),
  c('Sunbelt Tech Blaze', 'GROUP_OF_5', 70, 68),
  c('Big Thicket University Panthers', 'GROUP_OF_5', 69, 51, { inState: true }),
  c('Caprock University Eagles', 'GROUP_OF_5', 68, 60, { inState: true }),
  c('Arkoma State Miners', 'GROUP_OF_5', 67, 49),
  c('Gulf Plains University Herons', 'GROUP_OF_5', 66, 63),
  c('Sabine State Cottonmouths', 'GROUP_OF_5', 65, 47),
  c('Llano Estacado University Comets', 'GROUP_OF_5', 64, 56, { inState: true }),
  // FCS
  c('Cross Timbers University Pioneers', 'FCS', 62, 58, { inState: true }),
  c('Pecos State Lobos', 'FCS', 60, 46, { inState: true }),
  c('Neches University Bears', 'FCS', 59, 52, { inState: true }),
  c('Guadalupe State Rams', 'FCS', 58, 50, { inState: true }),
  c('Fairmont College Scholars', 'FCS', 57, 84),
  c('Red Rock State Falcons', 'FCS', 56, 45),
  c('Big Bend State Pumas', 'FCS', 55, 44, { inState: true }),
  c('Colorado River University Otters', 'FCS', 54, 55, { inState: true }),
  c('Palo Duro State Canyons', 'FCS', 52, 47, { inState: true }),
  c('Lavaca University Egrets', 'FCS', 51, 53, { inState: true }),
  c('Falls City University Rapids', 'FCS', 50, 49),
  c('Blackland State Plowmen', 'FCS', 48, 45, { inState: true }),
  // Division II
  c('Brush Country University Javelins', 'DIVISION_2', 46, 45, { inState: true }),
  c('Concho State Mavericks', 'DIVISION_2', 44, 48, { inState: true }),
  c('Medina College Vaqueros', 'DIVISION_2', 42, 44, { inState: true }),
  c('Bluebonnet College Owls', 'DIVISION_2', 41, 60, { inState: true }),
  c('Cypress Creek College Cardinals', 'DIVISION_2', 40, 50, { inState: true }),
  c('Uvalde State Hawks', 'DIVISION_2', 38, 42, { inState: true }),
  c('Lampasas College Lions', 'DIVISION_2', 37, 46, { inState: true }),
  c('Comanche Peak University Peaks', 'DIVISION_2', 36, 52),
  c('San Saba College Pecans', 'DIVISION_2', 34, 43, { inState: true }),
  c('Navasota State Rails', 'DIVISION_2', 32, 41, { inState: true }),
  // Division III
  c('Hillcrest Lutheran College Lions', 'DIVISION_3', 30, 78, { inState: true }),
  c('St. Brendan College Saints', 'DIVISION_3', 28, 82),
  c('Mission Hill College Friars', 'DIVISION_3', 27, 70, { inState: true }),
  c('Cedar Ridge College Rockets', 'DIVISION_3', 25, 62),
  c('Fairhaven College Quakers', 'DIVISION_3', 24, 88),
  c('Live Oak University Acorns', 'DIVISION_3', 22, 66, { inState: true }),
  c('Willow Bend College Bobwhites', 'DIVISION_3', 20, 58, { inState: true }),
  c('Hollow Oak College Foxes', 'DIVISION_3', 18, 55)
];

export const COLLEGES_BY_ID = new Map(COLLEGES.map((col) => [col.id, col]));
export const COLLEGES_BY_NAME = new Map(COLLEGES.map((col) => [col.name, col]));
