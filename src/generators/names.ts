import { randomInt } from '../sim/math/variance';

// ============================================================================
// PLAYER & COACH NAMES
// Name pools reflect Texas high school rosters. A first and last name usually come from the same
// background (with some mixing), regional profiles shift the mix (border regions lean Hispanic),
// and a few players carry a generational suffix.
// ============================================================================

type NameGroup = 'HISPANIC' | 'BLACK' | 'WHITE' | 'ASIAN_PACIFIC';

const FIRST_NAMES: Record<NameGroup, string[]> = {
  HISPANIC: [
    'Mateo', 'Santiago', 'Diego', 'Adrian', 'Gabriel', 'Isaac', 'Julian', 'Andres', 'Marco', 'Carlos',
    'Luis', 'Jose', 'Juan', 'Miguel', 'Angel', 'Alejandro', 'Daniel', 'Javier', 'Ricardo', 'Fernando',
    'Eduardo', 'Emilio', 'Joaquin', 'Rafael', 'Roberto', 'Sergio', 'Victor', 'Xavier', 'Omar', 'Hector',
    'Ivan', 'Jesus', 'Manuel', 'Mario', 'Pablo', 'Ramon', 'Ruben', 'Tomas', 'Elias', 'Nicolas',
    'Lorenzo', 'Damian', 'Cristian', 'Leonardo', 'Josue', 'Alonzo', 'Armando', 'Esteban', 'Gilberto', 'Ezequiel'
  ],
  BLACK: [
    'Jalen', 'Malik', 'DeShawn', 'Jamal', 'Darius', 'Marcus', 'Terrell', 'Andre', 'Jaylen', 'Isaiah',
    'Elijah', 'Jeremiah', 'Xavier', 'Tyrell', 'Kendrick', 'Jamarcus', 'Trevon', 'Devonte', 'Keon', 'Rashad',
    'Cedric', 'Darnell', 'Lamar', 'Desmond', 'Quentin', 'Jaquan', 'Kamari', 'Zaire', 'Amari', 'Jaden',
    'Khalil', 'Tavion', 'Demetrius', 'Treyvon', 'Dontae', 'Jabari', 'Kevon', 'Marquise', 'Derrick', 'Reggie',
    'Tre', 'Ja\'Marr', 'DaQuan', 'Javion', 'Kyrie', 'Ahmad', 'Corey', 'Dominique', 'Montez', 'Bryce'
  ],
  WHITE: [
    'Colt', 'Brayden', 'Tanner', 'Hunter', 'Garrett', 'Cody', 'Wyatt', 'Austin', 'Brock', 'Ty',
    'Caleb', 'Mason', 'Logan', 'Carson', 'Jackson', 'Luke', 'Cole', 'Blake', 'Chase', 'Tucker',
    'Grant', 'Reid', 'Bryce', 'Dalton', 'Easton', 'Beau', 'Cooper', 'Ryder', 'Gunner', 'Hayden',
    'Jake', 'Brady', 'Connor', 'Drew', 'Ethan', 'Grayson', 'Holden', 'Landry', 'Parker', 'Riley',
    'Sawyer', 'Trent', 'Walker', 'Bennett', 'Camden', 'Davis', 'Kyle', 'Nolan', 'Owen', 'Shane'
  ],
  ASIAN_PACIFIC: [
    'Kai', 'Keanu', 'Malakai', 'Tevita', 'Sione', 'Tua', 'Kalani', 'Ethan', 'Ryan', 'Kevin',
    'Daniel', 'Brandon', 'Justin', 'Andrew', 'Jason', 'Noa', 'Isaia', 'Makoa', 'Peniel', 'Ikaika'
  ]
};

const LAST_NAMES: Record<NameGroup, string[]> = {
  HISPANIC: [
    'Garcia', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Perez', 'Sanchez', 'Ramirez', 'Torres',
    'Flores', 'Rivera', 'Gomez', 'Diaz', 'Reyes', 'Morales', 'Cruz', 'Ortiz', 'Gutierrez', 'Chavez',
    'Ramos', 'Ruiz', 'Alvarez', 'Mendoza', 'Castillo', 'Jimenez', 'Moreno', 'Romero', 'Herrera', 'Medina',
    'Aguilar', 'Vasquez', 'Castro', 'Vargas', 'Salinas', 'Guerrero', 'Cantu', 'Trevino', 'Villarreal', 'Garza',
    'Saenz', 'Benavides', 'Zamora', 'Cavazos', 'Pena', 'Rios', 'Soto', 'Delgado', 'Escobar', 'Ybarra'
  ],
  BLACK: [
    'Washington', 'Johnson', 'Williams', 'Jackson', 'Brown', 'Jones', 'Davis', 'Harris', 'Robinson', 'Thomas',
    'Walker', 'Coleman', 'Jefferson', 'Banks', 'Freeman', 'Holloway', 'Singleton', 'Battle', 'Mosley', 'Gaines',
    'Wiggins', 'Booker', 'Hairston', 'Dorsey', 'Owens', 'Simmons', 'Pruitt', 'Mayfield', 'Toliver', 'Whitfield',
    'Grant', 'Carter', 'Mitchell', 'Lewis', 'Hill', 'Moore', 'Taylor', 'Wright', 'Scott', 'Green',
    'Bryant', 'Hayes', 'Bell', 'Brooks', 'Jenkins', 'Perry', 'Fields', 'Hawkins', 'Mims', 'Odom'
  ],
  WHITE: [
    'Miller', 'Smith', 'Anderson', 'Wilson', 'Thompson', 'Clark', 'Allen', 'Young', 'King', 'Baker',
    'Nelson', 'Campbell', 'Parker', 'Evans', 'Edwards', 'Collins', 'Stewart', 'Morris', 'Murphy', 'Cook',
    'Rogers', 'Reed', 'Bailey', 'Cooper', 'Howard', 'Ward', 'Cox', 'Peterson', 'Gray', 'Kelly',
    'Sanders', 'Price', 'Wood', 'Barnes', 'Ross', 'Henderson', 'Fisher', 'McCoy', 'Bradford', 'Strickland',
    'Vance', 'Broussard', 'Landry', 'Beckham', 'Chambers', 'Whitaker', 'Pruett', 'Haskins', 'Dawson', 'Kincaid'
  ],
  ASIAN_PACIFIC: [
    'Nguyen', 'Tran', 'Le', 'Pham', 'Kim', 'Park', 'Lee', 'Chen', 'Wang', 'Patel',
    'Tuiasosopo', 'Fifita', 'Mauga', 'Faleolo', 'Vainikolo', 'Tupou', 'Kaufusi', 'Mahe', 'Tagovailoa', 'Sopoaga'
  ]
};

export type NameProfile = 'DEFAULT' | 'BORDER';

// Share of each background on a typical Texas roster, and in border regions (El Paso, Laredo, RGV)
const GROUP_WEIGHTS: Record<NameProfile, [NameGroup, number][]> = {
  DEFAULT: [['HISPANIC', 32], ['BLACK', 30], ['WHITE', 33], ['ASIAN_PACIFIC', 5]],
  BORDER: [['HISPANIC', 82], ['BLACK', 5], ['WHITE', 11], ['ASIAN_PACIFIC', 2]]
};

const MIXED_NAME_CHANCE = 0.15; // first name from one background, surname from another
const SUFFIXES: [string, number][] = [['Jr.', 0.03], ['II', 0.01], ['III', 0.012], ['IV', 0.003]];

const pick = <T,>(items: T[]): T => items[randomInt(0, items.length - 1)];

function pickGroup(profile: NameProfile): NameGroup {
  const weights = GROUP_WEIGHTS[profile];
  let roll = Math.random() * weights.reduce((s, [, w]) => s + w, 0);
  for (const [group, w] of weights) {
    roll -= w;
    if (roll <= 0) return group;
  }
  return 'WHITE';
}

/** Name profile for a district from its area description (border regions lean Hispanic). */
export function nameProfileForArea(area = ''): NameProfile {
  return /El Paso|Laredo|Rio Grande|Eagle Pass|Del Rio|Brownsville|McAllen|Harlingen/i.test(area) ? 'BORDER' : 'DEFAULT';
}

/** A realistic player name; `taken` avoids duplicate full names within a roster or pool. */
export function randomPlayerName(profile: NameProfile = 'DEFAULT', taken?: Set<string>): { firstName: string; lastName: string } {
  let name = { firstName: '', lastName: '' };
  for (let tries = 0; tries < 25; tries++) {
    const group = pickGroup(profile);
    const firstGroup = Math.random() < MIXED_NAME_CHANCE ? pickGroup(profile) : group;
    let lastName = pick(LAST_NAMES[group]);
    let roll = Math.random();
    for (const [suffix, chance] of SUFFIXES) {
      if (roll < chance) {
        lastName = `${lastName} ${suffix}`;
        break;
      }
      roll -= chance;
    }
    name = { firstName: pick(FIRST_NAMES[firstGroup]), lastName };
    if (!taken?.has(`${name.firstName} ${name.lastName}`)) break; // a rare repeat is fine if every try collides
  }
  taken?.add(`${name.firstName} ${name.lastName}`);
  return name;
}

/** A coach's surname. */
export function randomSurname(profile: NameProfile = 'DEFAULT'): string {
  return pick(LAST_NAMES[pickGroup(profile)]);
}
