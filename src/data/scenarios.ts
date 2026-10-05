// ---------------------------------------------------------------------------
// Career scenarios: every state offers two historic programs in each. "Reclaiming the Crown" hands the coach a
// fallen giant (its prestige has slipped and the roster with it); "Powerhouses" hands over a program at the top.
// The leaderboards are grouped by the program a career started with.
// ---------------------------------------------------------------------------

export type ScenarioId = 'RECLAIM' | 'POWERHOUSE';

export interface ScenarioProgram {
  state: string;
  school: string; // the school's name in the state's world data
  displayName: string; // how the program is known
  legacy: string;
}

export interface Scenario {
  id: ScenarioId;
  title: string;
  tagline: string;
  difficulty: 'EASY' | 'HARD';
  /** The program's starting prestige (its roster is generated to match). */
  startingPrestige: (dataPrestige: number) => number;
  programs: ScenarioProgram[];
}

const RECLAIM_PRESTIGE = 72; // a fallen giant: the name still carries weight, the roster doesn't
const POWERHOUSE_PRESTIGE = 96; // at the top of the state

export const SCENARIOS: Scenario[] = [
  {
    id: 'RECLAIM',
    title: 'Reclaiming the Crown',
    tagline: 'Take over a fallen giant and bring it back to the top.',
    difficulty: 'HARD',
    startingPrestige: (p) => Math.min(p, RECLAIM_PRESTIGE),
    programs: [
      { state: 'Texas', school: 'Odessa Permian', displayName: 'Odessa Permian', legacy: 'The Panthers made "Mojo" famous, winning multiple Texas championships and becoming one of the state’s most iconic football programs.' },
      { state: 'Texas', school: 'Converse Judson', displayName: 'Converse Judson', legacy: 'The Rockets became a Texas powerhouse, winning six state championships from 1983 onward, including three in four seasons during the 1990s.' },
      { state: 'Georgia', school: 'Valdosta', displayName: 'Valdosta', legacy: 'The Wildcats built a record-setting legacy, winning 22 Georgia state titles across several decades.' },
      { state: 'Georgia', school: 'Clarke Central', displayName: 'Clarke Central', legacy: 'Under coach Billy Henderson, the Gladiators won three state championships and reached the playoffs 18 straight seasons.' },
      { state: 'Florida', school: 'Miami Carol City', displayName: 'Miami Carol City', legacy: 'The Chiefs won five Florida state championships, with title seasons stretching from 1977 to 2016.' },
      { state: 'Florida', school: 'Miami Northwestern', displayName: 'Miami Northwestern', legacy: 'The Bulls’ 2007 team went undefeated, won the Florida title and earned national championship recognition.' },
      { state: 'Maryland', school: 'DeMatha Catholic', displayName: 'DeMatha', legacy: 'The Stags became a nationally respected Washington-area program, known for consistently competing among Maryland’s best.' },
      { state: 'Maryland', school: 'Dunbar', displayName: 'Dunbar', legacy: 'Baltimore’s Poets have won 14 state championships, with title-winning eras spanning the 1990s through the 2020s.' },
      { state: 'North Carolina', school: 'Shelby', displayName: 'Shelby', legacy: 'The Golden Lions won seven North Carolina championships between 1970 and 1987, including four during the 1970s.' },
      { state: 'North Carolina', school: 'Pisgah', displayName: 'Pisgah', legacy: 'The Bears won four state titles, highlighted by back-to-back North Carolina 3A championships in 1975 and 1976.' },
      { state: 'Alabama', school: 'Hoover', displayName: 'Hoover', legacy: 'The Buccaneers became one of Alabama’s defining modern dynasties, winning 13 state titles, including a run of championships from 2002 to 2005.' },
      { state: 'Alabama', school: 'Vigor', displayName: 'Vigor', legacy: 'The Wolves won consecutive Alabama titles in 1987 and 1988; their 1988 team also earned national recognition.' },
      { state: 'Tennessee', school: 'Brentwood Academy', displayName: 'Brentwood Academy', legacy: 'The Eagles captured 14 Tennessee state championships, including four in a row from 2015 to 2018.' },
      { state: 'Tennessee', school: 'Maryville', displayName: 'Maryville', legacy: 'The Red Rebels won 17 Tennessee state titles from 1970 to 2019, sustaining success across multiple generations.' },
      { state: 'Ohio', school: 'Cincinnati Archbishop Moeller', displayName: 'Archbishop Moeller', legacy: 'The Crusaders’ teams under Gerry Faust produced nine undefeated seasons and four nationally recognized championship seasons.' },
      { state: 'Ohio', school: 'Cleveland St. Ignatius', displayName: 'St. Ignatius', legacy: 'Cleveland’s Wildcats won five consecutive Ohio state titles from 1991 to 1995 and appeared in six straight finals.' },
      { state: 'Pennsylvania', school: 'Berwick', displayName: 'Berwick', legacy: 'The Bulldogs’ celebrated 1980s and ’90s dynasty won six Pennsylvania titles, including four straight from 1994 to 1997.' },
      { state: 'Pennsylvania', school: 'Central Bucks West', displayName: 'Central Bucks West', legacy: 'The Bucks ruled Pennsylvania in the late 1990s, winning state championships in 1997, 1998 and 1999.' },
      { state: 'New Jersey', school: 'Don Bosco Prep', displayName: 'Don Bosco Prep', legacy: 'The Ironmen became one of New Jersey’s top programs, winning a string of state championships and earning national champion recognition in 2009.' },
      { state: 'New Jersey', school: "St. Peter's Prep", displayName: "St. Peter's Prep", legacy: 'The Marauders made a national statement in 1994, upsetting top-ranked Bergen Catholic and finishing sixth in the national rankings.' },
      { state: 'Louisiana', school: 'Evangel Christian', displayName: 'Evangel Christian', legacy: 'Shreveport’s Eagles won 14 Louisiana state titles, establishing a long-running dynasty across the 1990s, 2000s and 2010s.' },
      { state: 'Louisiana', school: 'West Monroe', displayName: 'West Monroe', legacy: 'The Rebels won seven state titles in Louisiana’s largest class and went 40 games unbeaten from 1996 to 1999.' },
      { state: 'California', school: 'Long Beach Poly', displayName: 'Long Beach Poly', legacy: 'The Jackrabbits paired championship success with a remarkable pipeline of talent to college football and the NFL.' },
      { state: 'California', school: 'De La Salle', displayName: 'De La Salle', legacy: 'The Spartans set a national record with 151 straight wins from 1992 to 2004, spanning 12 consecutive undefeated seasons.' }
    ]
  },
  {
    id: 'POWERHOUSE',
    title: 'Powerhouses',
    tagline: 'Take the keys to a dynasty. Anything less than a title is a letdown.',
    difficulty: 'EASY',
    startingPrestige: (p) => Math.max(p, POWERHOUSE_PRESTIGE),
    programs: [
      { state: 'Texas', school: 'Galena Park North Shore', displayName: 'North Shore', legacy: 'The Mustangs became one of Texas’s defining powers of the late 2010s, winning state titles in 2015, 2018, 2019, and 2021. Their 2018 comeback win over Duncanville remains a signature moment.' },
      { state: 'Texas', school: 'Duncanville', displayName: 'Duncanville', legacy: 'The Panthers turned years of deep playoff runs into back-to-back Texas state championships in 2022 and 2023.' },
      { state: 'Georgia', school: 'Buford', displayName: 'Buford', legacy: 'The Wolves have built a championship tradition that spans generations, reaching their 15th Georgia state title in 2025.' },
      { state: 'Georgia', school: 'Colquitt County', displayName: 'Colquitt County', legacy: 'The Packers’ 2014 and 2015 teams went a combined 30–0, delivering consecutive state championships and national recognition.' },
      { state: 'Florida', school: 'St. Thomas Aquinas', displayName: 'St. Thomas Aquinas', legacy: 'The Raiders are among Florida’s most decorated programs, with state championships stretching from the 1990s into the 2020s and several championship runs along the way.' },
      { state: 'Florida', school: 'Miami Central', displayName: 'Miami Central', legacy: 'The Rockets became one of Florida’s premier programs, winning four straight state titles from 2012 through 2015 and returning to the top with another championship in 2023.' },
      { state: 'Maryland', school: 'Quince Orchard', displayName: 'Quince Orchard', legacy: 'The Cougars turned Montgomery County success into a sustained statewide presence, winning seven Maryland championships, including four from 2021 through 2025.' },
      { state: 'Maryland', school: 'Dr. Henry A. Wise', displayName: 'Wise', legacy: 'The Pumas built a Prince George’s County dynasty, winning six state championships and capturing four titles across the 2015–2019 stretch.' },
      { state: 'North Carolina', school: 'Reidsville', displayName: 'Reidsville', legacy: 'The Rams are a title-rich North Carolina program, claiming their 10th state championship in 2023 and adding to a tradition that began decades earlier.' },
      { state: 'North Carolina', school: 'Weddington', displayName: 'Weddington', legacy: 'The Warriors made a rapid rise to prominence, winning their first state title in 2017 and following it with championships in 2018 and 2019.' },
      { state: 'Alabama', school: 'Thompson', displayName: 'Thompson', legacy: 'The Warriors established a modern Alabama dynasty, winning six state titles in seven seasons through 2025.' },
      { state: 'Alabama', school: 'Saraland', displayName: 'Saraland', legacy: 'The Spartans broke through for the first state championship in school history in 2022, establishing themselves among Alabama’s rising programs.' },
      { state: 'Tennessee', school: 'Oakland', displayName: 'Oakland', legacy: 'The Patriots have become a dominant force in Tennessee’s largest classification, collecting five state titles from 2020 through 2025.' },
      { state: 'Tennessee', school: 'Alcoa', displayName: 'Alcoa', legacy: 'The Tornadoes are one of Tennessee’s most decorated programs, highlighted by ten consecutive Class 3A championships from 2015 through 2024.' },
      { state: 'Ohio', school: 'Lakewood St. Edward', displayName: 'St. Edward', legacy: 'The Eagles have been a major Ohio power since 2010, winning seven Division I state titles, including three in a row from 2021 through 2023.' },
      { state: 'Ohio', school: 'Archbishop Hoban', displayName: 'Archbishop Hoban', legacy: 'The Knights became a statewide powerhouse in the mid-to-late 2010s, winning five Ohio championships between 2015 and 2020.' },
      { state: 'Pennsylvania', school: "St. Joseph's Prep", displayName: "St. Joseph's Prep", legacy: 'The Hawks ruled Pennsylvania football through much of the 2010s and early 2020s, winning eight state titles in eleven seasons through 2023, including a three-peat from 2018 to 2020.' },
      { state: 'Pennsylvania', school: 'Southern Columbia', displayName: 'Southern Columbia', legacy: 'The Tigers set the state standard for small-school dominance, winning a Pennsylvania-record seven consecutive championships from 2017 through 2023.' },
      { state: 'New Jersey', school: 'Bergen Catholic', displayName: 'Bergen Catholic', legacy: 'The Crusaders paired a long history of state success with a recent run of four straight championships from 2021 through 2024.' },
      { state: 'New Jersey', school: 'St. Joseph Regional', displayName: 'St. Joseph Regional', legacy: 'The Green Knights have been a fixture in New Jersey’s championship picture for decades, including a remarkable run of seven consecutive state titles from 1999 through 2005.' },
      { state: 'Louisiana', school: 'Catholic-Baton Rouge', displayName: 'Catholic (Baton Rouge)', legacy: 'The Bears rose into Louisiana’s top tier with five state championships between 2015 and 2023, including back-to-back titles in 2020 and 2021.' },
      { state: 'Louisiana', school: 'John Curtis Christian', displayName: 'John Curtis', legacy: 'The Patriots built one of the nation’s most enduring high school dynasties, winning a state-record 28 Louisiana championships, including five in a row from 2004 through 2008.' },
      { state: 'California', school: 'Mater Dei', displayName: 'Mater Dei', legacy: 'The Monarchs became a national powerhouse, winning five California titles since 2017 and earning national No. 1 recognition in multiple seasons.' },
      { state: 'California', school: 'St. John Bosco', displayName: 'St. John Bosco', legacy: 'The Braves emerged as a national power and Mater Dei’s chief rival, winning California state titles in 2013, 2016, 2019, and 2022.' }
    ]
  }
];

export const scenarioById = (id: ScenarioId) => SCENARIOS.find((s) => s.id === id)!;
