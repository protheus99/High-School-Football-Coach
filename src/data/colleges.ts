import { CollegeTier } from '../types/game';

// ---------------------------------------------------------------------------
// The college world: fictional programs in fictional conferences, organized the way the NCAA is. Division I
// FBS has four Power 4 conferences, six Group of 5 conferences and the Independents; FCS, Division II and
// Division III have their own conferences. Every college has a home state, so each scenario state has schools
// that pull its players close to home. Names are invented; none is a real school.
// ---------------------------------------------------------------------------

export type CollegeDivision = 'FBS' | 'FCS' | 'DIVISION_2' | 'DIVISION_3';

export interface Conference {
  id: string;
  name: string;
  short: string; // the abbreviation shown next to a college ("SNE")
  division: CollegeDivision;
}

/** A fictional college program that recruits high school players. */
export interface College {
  id: string;
  name: string;
  tier: Exclude<CollegeTier, 'PWO'>; // walk-on spots are offered by Division I programs
  prestige: number; // 0-100: how attractive the program is to recruits
  academics: number; // 0-100: how selective admissions are
  national?: boolean; // national Power 4 brand: recruits only the very best
  state: string; // home state: a pull for that state's players who want to stay close to home
  conference: string; // Conference id
}

export const DIVISION_LABELS: Record<CollegeDivision, string> = {
  FBS: 'Division I FBS',
  FCS: 'Division I FCS',
  DIVISION_2: 'Division II',
  DIVISION_3: 'Division III'
};

export const CONFERENCES: Conference[] = [
  // Division I FBS: Power 4
  { id: 'SNE', name: 'South and East Conference', short: 'SNE', division: 'FBS' },
  { id: 'TEN', name: 'Teners', short: 'TEN', division: 'FBS' },
  { id: 'DOZ', name: 'Dozens', short: 'DOZ', division: 'FBS' },
  { id: 'ASC', name: 'Atlantic Shore Conference', short: 'ASC', division: 'FBS' },
  // Division I FBS: Group of 5
  { id: 'AMR', name: 'America', short: 'AMR', division: 'FBS' },
  { id: 'UNC', name: 'United Conference', short: 'UNC', division: 'FBS' },
  { id: 'MID', name: 'Mid West', short: 'MID', division: 'FBS' },
  { id: 'MTN', name: 'Mountain', short: 'MTN', division: 'FBS' },
  { id: 'PAC', name: 'Pacific', short: 'PAC', division: 'FBS' },
  { id: 'BBC', name: 'Bible Belt', short: 'BBC', division: 'FBS' },
  { id: 'IND', name: 'Independents', short: 'IND', division: 'FBS' },
  // Division I FCS
  { id: 'BSK', name: 'Big Skies Conference', short: 'BSK', division: 'FCS' },
  { id: 'CCA', name: 'Coastal Colonial Association', short: 'CCA', division: 'FCS' },
  { id: 'IVL', name: 'Ivory League', short: 'IVL', division: 'FCS' },
  { id: 'MEA', name: 'Mid-Eastern Alliance', short: 'MEA', division: 'FCS' },
  { id: 'RVC', name: 'River Valley Conference', short: 'RVC', division: 'FCS' },
  { id: 'SHC', name: 'Southern Hills Conference', short: 'SHC', division: 'FCS' },
  { id: 'SLD', name: 'Southlands Conference', short: 'SLD', division: 'FCS' },
  { id: 'SWA', name: 'Southwest Alliance', short: 'SWA', division: 'FCS' },
  // Division II
  { id: 'LSC', name: 'Lone Steer Conference', short: 'LSC', division: 'DIVISION_2' },
  { id: 'GSC', name: 'Gulf Shores Conference', short: 'GSC', division: 'DIVISION_2' },
  { id: 'KAC', name: 'Keystone Athletic Conference', short: 'KAC', division: 'DIVISION_2' },
  { id: 'SSC', name: 'South Seaboard Conference', short: 'SSC', division: 'DIVISION_2' },
  { id: 'SICA', name: 'Southern Inter-College Alliance', short: 'SICA', division: 'DIVISION_2' },
  { id: 'CICA', name: 'Central Inter-College Alliance', short: 'CICA', division: 'DIVISION_2' },
  { id: 'GLA', name: 'Great Lakes Alliance', short: 'GLA', division: 'DIVISION_2' },
  { id: 'GMC', name: 'Great Middle Conference', short: 'GMC', division: 'DIVISION_2' },
  { id: 'GAC', name: 'Grand American Conference', short: 'GAC', division: 'DIVISION_2' },
  { id: 'MPA', name: 'Mid-Plains Alliance', short: 'MPA', division: 'DIVISION_2' },
  { id: 'NSC', name: 'Northern Star Conference', short: 'NSC', division: 'DIVISION_2' },
  { id: 'RPC', name: 'Rocky Peaks Conference', short: 'RPC', division: 'DIVISION_2' },
  { id: 'ERC', name: 'East Ridge Conference', short: 'ERC', division: 'DIVISION_2' },
  { id: 'NE9', name: 'Northeast Nine', short: 'NE9', division: 'DIVISION_2' },
  // Division III
  { id: 'SWF', name: 'Southwest Frontier Conference', short: 'SWF', division: 'DIVISION_3' },
  { id: 'SSN', name: 'Southern Scholars Conference', short: 'SSN', division: 'DIVISION_3' },
  { id: 'GDN', name: 'Garden State Conference', short: 'GDN', division: 'DIVISION_3' },
  { id: 'BAC', name: 'Buckeye Athletic Conference', short: 'BAC', division: 'DIVISION_3' },
  { id: 'MAA', name: 'Mid-Atlantic Alliance', short: 'MAA', division: 'DIVISION_3' },
  { id: 'BIC', name: 'Bicentennial Conference', short: 'BIC', division: 'DIVISION_3' },
  { id: 'SCC', name: 'SoCal Collegiate Conference', short: 'SCC', division: 'DIVISION_3' },
  { id: 'PIE', name: 'Piedmont Conference', short: 'PIE', division: 'DIVISION_3' }
];

export const CONFERENCES_BY_ID = new Map(CONFERENCES.map((conf) => [conf.id, conf]));

const collegeId = (name: string) =>
  `col_${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+$/, '')}`;

/** [name, prestige, academics, home state, 'N' for a national brand or a tier for an Independent] */
type Row = [string, number, number, string, ('N' | College['tier'])?];

const members = (conference: string, tier: College['tier'], rows: Row[]): College[] =>
  rows.map(([name, prestige, academics, state, extra]) => ({
    id: collegeId(name),
    name,
    tier: extra && extra !== 'N' ? extra : tier,
    prestige,
    academics,
    ...(extra === 'N' ? { national: true } : {}),
    state,
    conference
  }));

export const COLLEGES: College[] = [
  // ---------------- Division I FBS: Power 4 ----------------
  ...members('SNE', 'POWER_4', [
    ['Gulf Coast University Stingrays', 96, 62, 'Texas', 'N'],
    ['Bayou State Cypress Kings', 92, 52, 'Louisiana', 'N'],
    ['Black Belt University Crimson Hawks', 91, 58, 'Alabama'],
    ['Red River University Wranglers', 90, 64, 'Texas'],
    ['Chattahoochee University Redbones', 90, 66, 'Georgia'],
    ['Suwannee State Gladiators', 89, 60, 'Florida'],
    ['Ozark State Timberwolves', 86, 54, 'Arkansas'],
    ['Tombigbee State Rams', 85, 55, 'Alabama'],
    ['Cumberland University Generals', 84, 70, 'Tennessee'],
    ['Palmetto University Marsh Tigers', 83, 62, 'South Carolina'],
    ['Bluegrass University Thoroughbreds', 81, 64, 'Kentucky'],
    ['Magnolia State Riverhawks', 80, 50, 'Mississippi']
  ]),
  ...members('TEN', 'POWER_4', [
    ['Lakeshore University Admirals', 97, 86, 'Michigan', 'N'],
    ['Olentangy State Stallions', 95, 70, 'Ohio', 'N'],
    ['Pacific Crest University Condors', 93, 77, 'California', 'N'],
    ['Laurel Highlands University Lumberjacks', 89, 72, 'Pennsylvania'],
    ['Bay City University Sea Lions', 87, 80, 'California'],
    ['Prairie Tech Engineers', 85, 82, 'Indiana'],
    ['Driftless University Muskies', 84, 74, 'Wisconsin'],
    ['Cascade University Steelheads', 83, 72, 'Washington'],
    ['Chesapeake University Watermen', 82, 72, 'Maryland'],
    ['Northern Rivers University Huskies', 81, 66, 'Minnesota'],
    ['Raritan University Redcoats', 80, 74, 'New Jersey'],
    ['Cedar Prairie University Hawks', 79, 70, 'Iowa']
  ]),
  ...members('DOZ', 'POWER_4', [
    ['Great Plains State Thunder', 95, 58, 'Oklahoma', 'N'],
    ['Panhandle State Twisters', 88, 55, 'Texas'],
    ['Hill Country University Pathfinders', 87, 78, 'Texas'],
    ['Trinity River University Longriders', 86, 76, 'Texas'],
    ['Wasatch University Peregrines', 85, 72, 'Utah'],
    ['Sonoran University Gila Monsters', 84, 66, 'Arizona'],
    ['Mesa Verde State Coyotes', 83, 57, 'Colorado'],
    ['Big Country State Stampede', 82, 56, 'Texas'],
    ['Cimarron State Outlaws', 82, 54, 'Oklahoma'],
    ['Front Range University Elk', 81, 68, 'Colorado'],
    ['Flint Hills State Bison', 80, 58, 'Kansas'],
    ['Kanawha University Coal Barons', 79, 54, 'West Virginia']
  ]),
  ...members('ASC', 'POWER_4', [
    ['Blue Ridge University Ravens', 94, 80, 'Virginia', 'N'],
    ['Biscayne University Barracudas', 90, 68, 'Florida'],
    ['Yadkin University Red Foxes', 88, 70, 'North Carolina'],
    ['Apalachee State Firebirds', 87, 60, 'Florida'],
    ['Upcountry University Bengals', 86, 60, 'South Carolina'],
    ['Tar River State Raptors', 84, 58, 'North Carolina'],
    ['Peachtree Tech Machinists', 83, 84, 'Georgia'],
    ['Tidewater University Sentinels', 82, 74, 'Virginia'],
    ['Three Rivers University Steelmen', 81, 72, 'Pennsylvania'],
    ['Cape Fear University Mariners', 80, 66, 'North Carolina'],
    ['Bay Colony College Patriots', 79, 82, 'Massachusetts'],
    ['Finger Lakes University Lakers', 78, 72, 'New York']
  ]),
  ...members('IND', 'POWER_4', [
    ['St. Columba University Crusaders', 93, 88, 'Indiana', 'N'],
    ['Garrison Academy Sentries', 72, 85, 'New York', 'GROUP_OF_5'],
    ['Pioneer Valley University Colonials', 62, 70, 'Massachusetts', 'GROUP_OF_5']
  ]),
  // ---------------- Division I FBS: Group of 5 ----------------
  ...members('AMR', 'GROUP_OF_5', [
    ['Coastal Bend University Sharks', 78, 55, 'Texas'],
    ['Bayside University Bulls', 76, 62, 'Florida'],
    ['Bluff City University Tigers', 75, 56, 'Tennessee'],
    ['Brazos Valley University Mustangs', 74, 72, 'Texas'],
    ['Liberty Bell University Patriots', 72, 64, 'Pennsylvania'],
    ['Gold Coast University Sailfish', 70, 58, 'Florida'],
    ['Caprock University Eagles', 68, 60, 'Texas'],
    ['Crown City University Foxhounds', 67, 60, 'North Carolina'],
    ['Gulf Plains University Herons', 66, 63, 'Louisiana']
  ]),
  ...members('UNC', 'GROUP_OF_5', [
    ['West Texas Tech Roughnecks', 76, 58, 'Texas'],
    ['Piney Woods University Loggers', 72, 54, 'Texas'],
    ['Permian State Drillers', 71, 48, 'Texas'],
    ['Cotton State Boll Weevils', 69, 50, 'Louisiana'],
    ['Pond River State Hawks', 66, 52, 'Kentucky'],
    ['Duck River State Lightning', 65, 54, 'Tennessee'],
    ['Llano Estacado University Comets', 64, 56, 'Texas'],
    ['Emerald Coast University Marlins', 63, 56, 'Florida'],
    ['Chickasaw State Bobcats', 62, 50, 'Alabama']
  ]),
  ...members('MID', 'GROUP_OF_5', [
    ['Great Miami University Trailblazers', 72, 74, 'Ohio'],
    ['Cuyahoga State Ironworkers', 70, 58, 'Ohio'],
    ['Maumee University Freighters', 68, 60, 'Ohio'],
    ['Thornapple University Voyagers', 67, 60, 'Michigan'],
    ['Hocking Hills University Redtails', 66, 62, 'Ohio'],
    ['Tippecanoe State Warriors', 65, 58, 'Indiana'],
    ['Presque Isle University Storm', 64, 56, 'Pennsylvania'],
    ['Mohawk Ridge University Iron', 63, 60, 'New York'],
    ['Rock River University Kingfishers', 62, 58, 'Illinois']
  ]),
  ...members('MTN', 'GROUP_OF_5', [
    ['Snake River State Lancers', 78, 54, 'Idaho'],
    ['Central Valley State Harvesters', 74, 54, 'California'],
    ['High Desert State Scorpions', 73, 50, 'Nevada'],
    ['Inland Empire University Sundogs', 70, 60, 'California'],
    ['Medicine Bow University Cowpokes', 69, 56, 'Wyoming'],
    ['Cheyenne Mountain University Prospectors', 68, 58, 'Colorado'],
    ['Cache Valley State Ramblers', 67, 56, 'Utah'],
    ['Sangre de Cristo University Aggies', 66, 52, 'New Mexico'],
    ['Tamalpais State Redwoods', 65, 64, 'California']
  ]),
  ...members('PAC', 'GROUP_OF_5', [
    ['Cascadia State Timberjacks', 79, 64, 'Oregon'],
    ['Palouse State Plainsmen', 77, 62, 'Washington'],
    ['Mother Lode University Panners', 71, 60, 'California'],
    ['Mission Bay University Dolphins', 70, 66, 'California'],
    ['Kona Coast University Navigators', 68, 58, 'Hawaii'],
    ['Olympic Peninsula University Orcas', 66, 66, 'Washington'],
    ['Redwood Coast University Sasquatch', 64, 62, 'California'],
    ['Rogue Valley State Raiders', 63, 54, 'Oregon']
  ]),
  ...members('BBC', 'GROUP_OF_5', [
    ['Rio Grande State Javelinas', 75, 52, 'Texas'],
    ['High Country State Mountain Lions', 73, 60, 'North Carolina'],
    ['Golden Isles University Marsh Hens', 72, 56, 'Georgia'],
    ['Sunbelt Tech Blaze', 70, 68, 'Georgia'],
    ['Acadiana State Crawdads', 70, 52, 'Louisiana'],
    ['Big Thicket University Panthers', 69, 51, 'Texas'],
    ['Mobile Bay University Pelicans', 68, 54, 'Alabama'],
    ['Arkoma State Miners', 67, 49, 'Arkansas'],
    ['Grand Strand University Sandsharks', 66, 55, 'South Carolina'],
    ['Sabine State Cottonmouths', 65, 47, 'Louisiana']
  ]),
  // ---------------- Division I FCS ----------------
  ...members('BSK', 'FCS', [
    ['Bitterroot State Bighorns', 62, 52, 'Montana'],
    ['Gallatin State Pronghorns', 60, 50, 'Montana'],
    ['Gold Country State Gold Rush', 58, 54, 'California'],
    ['Red Rock State Falcons', 56, 45, 'Arizona'],
    ['Yolo University Oaks', 55, 70, 'California'],
    ['Klamath University Salmon', 54, 56, 'Oregon'],
    ['Wasatch Front State Wildcats', 53, 52, 'Utah']
  ]),
  ...members('CCA', 'FCS', [
    ['James River University Rivermen', 60, 62, 'Virginia'],
    ['Main Line University Wildcats', 59, 74, 'Pennsylvania'],
    ['Delmarva University Sandpipers', 58, 60, 'Delaware'],
    ['Patapsco University Tigers', 56, 56, 'Maryland'],
    ['Fall Line University Wrens', 55, 72, 'Virginia'],
    ['Haw River University Kestrels', 54, 64, 'North Carolina'],
    ['Barnegat University Keepers', 52, 58, 'New Jersey']
  ]),
  ...members('IVL', 'FCS', [
    ['Charles River College Pilgrims', 58, 96, 'Massachusetts'],
    ['Fairmont College Scholars', 57, 84, 'Connecticut'],
    ['Millstone University Gryphons', 56, 94, 'New Jersey'],
    ['Old Elm College Elms', 55, 92, 'Connecticut'],
    ['Schuylkill University Franklins', 54, 92, 'Pennsylvania'],
    ['Cayuga Lake University Harriers', 52, 90, 'New York'],
    ['Hudson Heights University Gothams', 50, 92, 'New York']
  ]),
  ...members('MEA', 'FCS', [
    ['Gate City Tech Aggies', 58, 50, 'North Carolina'],
    ['Gwynns Falls University Lynx', 56, 52, 'Maryland'],
    ['Severn State Clippers', 54, 48, 'Maryland'],
    ['Bull City University Monarchs', 53, 50, 'North Carolina'],
    ['Elizabeth River State Spartans', 52, 48, 'Virginia'],
    ['Edisto State Thunderbolts', 51, 46, 'South Carolina'],
    ['Pocomoke State Ospreys', 50, 46, 'Maryland']
  ]),
  ...members('RVC', 'FCS', [
    ['Prairie Pothole University Mallards', 66, 56, 'North Dakota'],
    ['Dakota Plains State Pheasants', 64, 54, 'South Dakota'],
    ['Mahoning State Steelhawks', 59, 50, 'Ohio'],
    ['Big Muddy State Catfish', 58, 52, 'Illinois'],
    ['Gasconade State Bushwhackers', 57, 52, 'Missouri'],
    ['Corn Belt State Kernels', 55, 54, 'Illinois'],
    ['Falls City University Rapids', 50, 49, 'Kentucky']
  ]),
  ...members('SHC', 'FCS', [
    ['Lookout Mountain University Rangers', 58, 56, 'Tennessee'],
    ['Ocmulgee University Wolves', 57, 64, 'Georgia'],
    ['Reedy River University Pilots', 56, 72, 'South Carolina'],
    ['Watauga State Highlanders', 55, 54, 'Tennessee'],
    ['Shades Mountain University Bulldogs', 54, 66, 'Alabama'],
    ['Nantahala State Rafters', 52, 52, 'North Carolina'],
    ['Valley Military Institute Cadets', 48, 60, 'Virginia']
  ]),
  ...members('SLD', 'FCS', [
    ['Cross Timbers University Pioneers', 62, 58, 'Texas'],
    ['Pecos State Lobos', 60, 46, 'Texas'],
    ['Neches University Bears', 59, 52, 'Texas'],
    ['Guadalupe State Rams', 58, 50, 'Texas'],
    ['Atchafalaya State Swamp Cats', 55, 48, 'Louisiana'],
    ['Big Bend State Pumas', 55, 44, 'Texas'],
    ['Colorado River University Otters', 54, 55, 'Texas'],
    ['Calcasieu State Buccaneers', 53, 46, 'Louisiana'],
    ['Palo Duro State Canyons', 52, 47, 'Texas'],
    ['Lavaca University Egrets', 51, 53, 'Texas'],
    ['Blackland State Plowmen', 48, 45, 'Texas']
  ]),
  ...members('SWA', 'FCS', [
    ['Piney Hills State Tigers', 60, 46, 'Louisiana'],
    ['Riverbend State Blue Tigers', 59, 47, 'Mississippi'],
    ['Capitol Bluff University Jaguars', 58, 48, 'Louisiana'],
    ['Seven Hills A&M Diamondbacks', 57, 48, 'Florida'],
    ['Dexter Avenue State Hornets', 56, 48, 'Alabama'],
    ['Tennessee Valley A&M Bulldogs', 55, 46, 'Alabama'],
    ['Brazos Prairie A&M Stallions', 54, 48, 'Texas'],
    ['Third Ward University Tigers', 52, 46, 'Texas'],
    ['Halifax University Wildcats', 50, 50, 'Florida']
  ]),
  // ---------------- Division II ----------------
  ...members('LSC', 'DIVISION_2', [
    ['Brush Country University Javelins', 46, 45, 'Texas'],
    ['Concho State Mavericks', 44, 48, 'Texas'],
    ['Medina College Vaqueros', 42, 44, 'Texas'],
    ['Bluebonnet College Owls', 41, 60, 'Texas'],
    ['Cypress Creek College Cardinals', 40, 50, 'Texas'],
    ['Red Earth State Rustlers', 39, 44, 'Oklahoma'],
    ['Uvalde State Hawks', 38, 42, 'Texas'],
    ['Lampasas College Lions', 37, 46, 'Texas'],
    ['San Saba College Pecans', 34, 43, 'Texas'],
    ['Navasota State Rails', 32, 41, 'Texas']
  ]),
  ...members('GSC', 'DIVISION_2', [
    ['Perdido University Corsairs', 45, 50, 'Florida'],
    ['Wiregrass University Bulldogs', 44, 46, 'Alabama'],
    ['Okefenokee State Cranes', 43, 44, 'Georgia'],
    ['Shoals University Riverkings', 41, 48, 'Alabama'],
    ['Yazoo State Bluesmen', 40, 42, 'Mississippi'],
    ['Natchez Trace University Travelers', 38, 46, 'Tennessee']
  ]),
  ...members('KAC', 'DIVISION_2', [
    ['Conemaugh University Crimson', 46, 50, 'Pennsylvania'],
    ['Kittatinny State Raiders', 44, 48, 'Pennsylvania'],
    ['Brandywine University Minutemen', 43, 52, 'Pennsylvania'],
    ['Monongahela State Coal Kings', 42, 46, 'Pennsylvania'],
    ['Lackawanna Valley State Breakers', 40, 48, 'Pennsylvania'],
    ['Conestoga State Wagonmasters', 39, 46, 'Pennsylvania']
  ]),
  ...members('SSC', 'DIVISION_2', [
    ['Uwharrie University Ridgebacks', 41, 48, 'North Carolina'],
    ['Clinch River University Mountaineers', 39, 48, 'Tennessee'],
    ['Pee Dee University Swamp Foxes', 38, 46, 'South Carolina'],
    ['Saluda University Badgers', 37, 50, 'South Carolina'],
    ['Holston University Hawks', 36, 46, 'Tennessee'],
    ['New River Gorge College Riverhounds', 35, 52, 'Virginia']
  ]),
  ...members('SICA', 'DIVISION_2', [
    ['Alabama River Institute Golden Eagles', 40, 46, 'Alabama'],
    ['Flint River State Golden Rams', 39, 44, 'Georgia'],
    ['Sweet Auburn College Maroons', 38, 58, 'Georgia'],
    ['Peach County State Wildcats', 36, 44, 'Georgia'],
    ['Congaree College Tigers', 35, 44, 'South Carolina'],
    ['Birmingham Hills College Golden Bears', 34, 44, 'Alabama'],
    ['Forked Deer College Dragons', 33, 42, 'Tennessee']
  ]),
  ...members('CICA', 'DIVISION_2', [
    ['Twin City State Steeds', 41, 46, 'North Carolina'],
    ['Patuxent State Bulldogs', 40, 46, 'Maryland'],
    ['Appomattox State Trojans', 39, 44, 'Virginia'],
    ['Cross Creek State Broncos', 38, 44, 'North Carolina'],
    ['Union Hill University Panthers', 37, 46, 'Virginia'],
    ['Biddleville University Golden Bulls', 36, 48, 'North Carolina'],
    ['Capital Oaks University Bears', 34, 44, 'North Carolina']
  ]),
  ...members('GLA', 'DIVISION_2', [
    ['Muskegon State Shipwrights', 46, 52, 'Michigan'],
    ['Pere Marquette State Bulldogs', 44, 48, 'Michigan'],
    ['Mohican University Eagles', 41, 50, 'Ohio'],
    ['Saginaw Bay University Snowbirds', 40, 48, 'Michigan'],
    ['Superior Shores University Wildcats', 39, 50, 'Michigan'],
    ['Keweenaw Tech Copper', 37, 70, 'Michigan']
  ]),
  ...members('GMC', 'DIVISION_2', [
    ['Blanchard River University Oilers', 38, 50, 'Ohio'],
    ['Sandusky Bay University Dragons', 36, 46, 'Ohio'],
    ['Tuscarawas University Cavaliers', 35, 48, 'Ohio'],
    ['Grand River College Gales', 34, 50, 'Ohio'],
    ['Rough River University Ponies', 33, 46, 'Kentucky'],
    ['Ohio River College Skippers', 32, 48, 'Indiana']
  ]),
  ...members('GAC', 'DIVISION_2', [
    ['Little Red River University Buffalo', 41, 52, 'Arkansas'],
    ['Caddo Gap University Tigers', 39, 50, 'Arkansas'],
    ['Saline River State Hawks', 37, 44, 'Arkansas'],
    ['Kiamichi State Timber Hawks', 36, 44, 'Oklahoma'],
    ['Canadian River State Tigers', 35, 44, 'Oklahoma'],
    ['Bodcau State Riverhogs', 34, 42, 'Arkansas']
  ]),
  ...members('MPA', 'DIVISION_2', [
    ['Nodaway State Prairie Dogs', 46, 48, 'Missouri'],
    ['Neosho State Grizzlies', 45, 46, 'Kansas'],
    ['Blackwater State Mules', 43, 48, 'Missouri'],
    ['Kaw Valley University Railsplitters', 40, 50, 'Kansas'],
    ['Cottonwood State Yellowjackets', 39, 46, 'Kansas'],
    ['Platte River University Sandhill Cranes', 38, 48, 'Nebraska']
  ]),
  ...members('NSC', 'DIVISION_2', [
    ['Blue Earth State Northstars', 44, 50, 'Minnesota'],
    ['Arrowhead University Bulldogs', 42, 52, 'Minnesota'],
    ['Big Sioux College Norsemen', 40, 54, 'South Dakota'],
    ['Granite City State Quarrymen', 38, 48, 'Minnesota'],
    ['Souris Valley State Badlanders', 36, 46, 'North Dakota'],
    ['Headwaters State Beavers', 35, 48, 'Minnesota']
  ]),
  ...members('RPC', 'DIVISION_2', [
    ['Clear Creek School of Mines Assayers', 44, 76, 'Colorado'],
    ['Arkansas Valley State Pack', 42, 46, 'Colorado'],
    ['Black Canyon State Marmots', 38, 48, 'Colorado'],
    ['Comanche Peak University Peaks', 36, 52, 'Colorado'],
    ['Animas River College Skyhawks', 35, 50, 'Colorado'],
    ['Mora Valley University Cowboys', 34, 44, 'New Mexico']
  ]),
  ...members('ERC', 'DIVISION_2', [
    ['Potomac Highlands University Rams', 43, 46, 'West Virginia'],
    ['Savage River State Foresters', 39, 48, 'Maryland'],
    ['Tygart Valley State Falcons', 37, 44, 'West Virginia'],
    ['Elk River University Sternwheelers', 36, 46, 'West Virginia'],
    ['Bluestone University Coalers', 35, 44, 'West Virginia'],
    ['Powell Valley College Ridgerunners', 33, 48, 'Virginia']
  ]),
  ...members('NE9', 'DIVISION_2', [
    ['Palisades University Cliffhangers', 40, 54, 'New Jersey'],
    ['Passaic Falls University Pride', 39, 50, 'New Jersey'],
    ['Blackstone River College Greyhounds', 38, 56, 'Massachusetts'],
    ['Long Wharf University Chargers', 37, 52, 'Connecticut'],
    ['Mystic River College Seawolves', 36, 58, 'Massachusetts'],
    ['Housatonic Valley University Owls', 35, 54, 'Connecticut'],
    ['Taunton River College Whalers', 34, 56, 'Massachusetts']
  ]),
  // ---------------- Division III ----------------
  ...members('SWF', 'DIVISION_3', [
    ['Salado College Stagecoach', 31, 60, 'Texas'],
    ['Hillcrest Lutheran College Lions', 30, 78, 'Texas'],
    ['Mission Hill College Friars', 27, 70, 'Texas'],
    ['Buffalo Gap College Cowboys', 26, 62, 'Texas'],
    ['Live Oak University Acorns', 22, 66, 'Texas'],
    ['Willow Bend College Bobwhites', 20, 58, 'Texas'],
    ['Davis Mountains College Antelopes', 19, 52, 'Texas']
  ]),
  ...members('SSN', 'DIVISION_3', [
    ['Herrington Lake College Bluebirds', 25, 84, 'Kentucky'],
    ['Cumberland Plateau College Owls', 24, 86, 'Tennessee'],
    ['Overton Park College Lanterns', 23, 84, 'Tennessee'],
    ['Lavender Mountain College Stags', 22, 70, 'Georgia'],
    ['Fondren College Colonels', 21, 76, 'Mississippi'],
    ['Lake Texoma College Kangaroos', 20, 72, 'Texas'],
    ['Cloverdale College Hawks', 19, 60, 'Alabama'],
    ['Lake Wales College Tortoises', 17, 64, 'Florida']
  ]),
  ...members('GDN', 'DIVISION_3', [
    ['Pine Barrens State Owls', 28, 60, 'New Jersey'],
    ['Assunpink College Merlins', 26, 72, 'New Jersey'],
    ['First Mountain State Red Hawks', 25, 58, 'New Jersey'],
    ['Elizabethport State Cougars', 22, 52, 'New Jersey'],
    ['Great Falls State Millers', 21, 54, 'New Jersey'],
    ['Mullica River College Pinelanders', 18, 56, 'New Jersey'],
    ['Hollow Oak College Foxes', 18, 55, 'New Jersey']
  ]),
  ...members('BAC', 'DIVISION_3', [
    ['Stark County College Purple Knights', 32, 62, 'Ohio'],
    ['Chagrin Falls College Lakesmen', 29, 74, 'Ohio'],
    ['Cedar Ridge College Rockets', 25, 62, 'Ohio'],
    ['Rocky River College Bees', 24, 66, 'Ohio'],
    ['Alum Creek College Larks', 23, 64, 'Ohio'],
    ['Sandusky River College Princes', 21, 60, 'Ohio'],
    ['Licking River College Muskrats', 20, 58, 'Ohio']
  ]),
  ...members('MAA', 'DIVISION_3', [
    ['St. Brendan College Saints', 28, 82, 'Pennsylvania'],
    ['Neshaminy College Aggies', 26, 58, 'Pennsylvania'],
    ['Chester Creek College Pride', 24, 62, 'Pennsylvania'],
    ['Green Spring College Colts', 23, 62, 'Maryland'],
    ['Swatara College Riflemen', 22, 64, 'Pennsylvania'],
    ['Tulpehocken College Grenadiers', 21, 60, 'Pennsylvania'],
    ['Wyoming Valley College Royals', 19, 56, 'Pennsylvania']
  ]),
  ...members('BIC', 'DIVISION_3', [
    ['Homewood University Jays', 30, 94, 'Maryland'],
    ['Letort College Red Devils', 27, 88, 'Pennsylvania'],
    ['Seminary Ridge College Battalion', 26, 86, 'Pennsylvania'],
    ['Long Lane College Ambassadors', 25, 90, 'Pennsylvania'],
    ['Fairhaven College Quakers', 24, 88, 'Pennsylvania'],
    ['Perkiomen College Black Bears', 22, 80, 'Pennsylvania'],
    ['Carroll Hills College Green Herons', 20, 76, 'Maryland']
  ]),
  ...members('SCC', 'DIVISION_3', [
    ['San Gabriel College Quail', 24, 90, 'California'],
    ['Arroyo Seco College Hawks', 22, 86, 'California'],
    ['Conejo Valley College Thunderbirds', 21, 72, 'California'],
    ['Cajon Pass College Railroaders', 19, 62, 'California'],
    ['Rose City College Paragons', 18, 66, 'California'],
    ['Laguna Coast College Tidepoolers', 16, 60, 'California']
  ]),
  ...members('PIE', 'DIVISION_3', [
    ['Dan River College Riverdogs', 23, 60, 'Virginia'],
    ['Smith Mountain College Striders', 21, 64, 'Virginia'],
    ['Peaks of Otter College Summit', 20, 66, 'Virginia'],
    ['Lake Lanier College Sailors', 19, 62, 'Georgia'],
    ['Pilot Mountain College Kites', 18, 58, 'North Carolina'],
    ['Brushy Mountain College Boomers', 17, 56, 'North Carolina']
  ])
];

export const COLLEGES_BY_ID = new Map(COLLEGES.map((col) => [col.id, col]));
export const COLLEGES_BY_NAME = new Map(COLLEGES.map((col) => [col.name, col]));

/** The conference a college plays in. */
export const conferenceOf = (college: College): Conference => CONFERENCES_BY_ID.get(college.conference)!;

/** "Gulf Coast University Stingrays · SNE" (or the bare name for a school not in the list). */
export function collegeWithConference(name: string, id?: string): string {
  const college = (id && COLLEGES_BY_ID.get(id)) || COLLEGES_BY_NAME.get(name);
  return college ? `${college.name} · ${conferenceOf(college).short}` : name;
}
