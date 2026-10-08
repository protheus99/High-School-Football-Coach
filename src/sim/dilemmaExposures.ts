import { DilemmaRecord } from '../types/game';

/**
 * Whistleblowers (design spec 12.1): when a risky or corrupt choice comes out a few weeks later, the Town Journal runs
 * the story of that decision. {team} is the coach's school and {player} the player the dilemma was about.
 */
export const EXPOSURES: Record<string, { headline: string; story: string }> = {
  // Academics & eligibility
  GRADE_CRISIS: { headline: 'Grade Changes Questioned at {team}', story: "Teachers say {player}'s grades were handled outside the normal rules to keep him eligible. The district has opened an audit of athletic eligibility records." },
  TEAM_GRADES: { headline: 'Athlete Grades Under Review at {team}', story: 'A parent group says football players got academic help no other students received. The state association is reviewing the program\'s eligibility reports.' },
  PLAGIARISM: { headline: 'Plagiarism Case Quietly Dropped, Teachers Say', story: 'English teachers say a plagiarism case involving {player} disappeared once the football office got involved. The principal has been asked to explain.' },
  TRUANCY: { headline: 'Attendance Records Altered for {team} Player', story: "The attendance office found {player}'s absences were excused without cause. State truancy rules require the district to investigate." },
  SAT_CONFLICT: { headline: 'Special Travel for {team} Player Questioned', story: 'Parents report {player} got special arrangements around a road game and a test date. The state association is asking who paid.' },
  ELIGIBILITY_PAPERWORK: { headline: 'Physical Forms Questioned at {team}', story: "A district audit found {player} practiced without valid physical paperwork. Every athlete's form is now being rechecked." },
  // Boosters & money
  BOOSTER_HEADSETS: { headline: 'Playing Time for Donations? Parents Ask', story: "Parents say a booster's son moved up the {team} depth chart after a funding threat. The school board wants to see the donation records." },
  FILM_ROOM_GIFT: { headline: 'Off-the-Books Gifts Found in {team} Film Room', story: "New equipment in the football facility never went through the school's donation process. Auditors are tracing the money." },
  BOOSTER_PLAYCALLING: { headline: 'Booster Calling Plays at {team}?', story: 'Assistant coaches say the booster club president has a say in the game plan. The athletic director calls it improper influence.' },
  ENERGY_DRINK_SPONSOR: { headline: 'Energy Drink Deal Draws Parent Complaints', story: 'Parents and the school nurse say {team} players were handed energy drinks at practice. The school board is reviewing the sponsorship.' },
  SUPPLEMENT_SPONSOR: { headline: 'Watch-List Supplements Found in {team} Weight Room', story: 'Products on the state watch list were supplied through a sponsorship. The state association may order testing.' },
  BOOSTER_CASH_HANDSHAKE: { headline: 'Video Shows Cash for {team} Players', story: "A parent's video of a booster handing cash to {player} and other starters is now public. The state association has opened an improper-benefits case." },
  // Player conduct
  TRASH_TALK: { headline: 'Sportsmanship Complaint Filed Against {team}', story: "The rival school sent the state association a file of {team}'s online taunts, starting with {player}'s video. A sportsmanship review is underway." },
  PARTY_PHOTOS: { headline: 'Team Rule Ignored for {team} Starter, Parents Say', story: "Parents say {player} played despite clear photos from a weekend party. The school board wants to know why the rule wasn't enforced." },
  HALLWAY_FIGHT: { headline: 'Fight Discipline Delayed for Football Player', story: "The other student's family says discipline for {player} was put off until after the season. Their lawyer has filed a complaint with the district." },
  HAZING_REPORT: { headline: 'Hazing Report Was Never Filed, Family Says', story: "A freshman's family says the football staff talked them out of reporting a locker-room initiation led by {player}. The district has opened a hazing investigation." },
  MASCOT_PRANK: { headline: 'Mascot Vandalism Case Reopened', story: 'The rival school says {team} never answered for the damage to its mascot statue. The district is reviewing the security footage again.' },
  SHOPLIFTING_ARREST: { headline: "Booster's Help in Player's Case Questioned", story: 'Court records show special help for {player} after a shoplifting citation. The state association calls it a possible improper benefit.' },
  SKIPPED_PRACTICE: { headline: "Star's Absences Covered Up, Players Say", story: 'Teammates say {player} skipped practice without consequence and the staff covered for him. The athletic director is reviewing team discipline.' },
  RECRUITING_TAMPERING: { headline: 'Recruiting Messages Surface at Rival Schools', story: "Middle school parents shared messages promising their sons would be \"taken care of\" at {team}. The state association is investigating athletic recruiting." },
  // Health & safety
  CONCUSSION_PROTOCOL: { headline: 'Concussion Protocol Ignored, Trainer Says', story: "The athletic trainer says {player} was cleared to play against medical advice. The district has ordered a review of the program's health protocols." },
  HEAT_ADVISORY: { headline: 'Heat Guidelines Broken at {team} Practice', story: "Parents and the heat log show a full-pads practice during a heat advisory. The state association is reviewing the program's safety records." },
  PAINKILLERS: { headline: 'Prescription Pills in the {team} Locker Room', story: "The trainer's report about {player}'s painkillers reached the district. Administrators want to know why his family was never told." },
  STEROID_RUMOR: { headline: 'Drug Test Questions Follow {team} Star', story: 'Opposing coaches have asked the state association to test {player}. Questions about how the rumors were handled are growing.' },
  HIDDEN_INJURY: { headline: 'Injured Player Kept on the Field, Parents Say', story: "{player}'s parents say they were never told about his injury. The district is reviewing the team's injury reports." },
  MENTAL_HEALTH: { headline: 'Duty-to-Report Policy Ignored, Family Says', story: "{player}'s family says the staff knew he was struggling and kept it from them. The district is reviewing its student wellness policy." },
  UNSAFE_FIELD: { headline: '{team} Practice Field Never Inspected', story: "After more ankle injuries, a parent learned the field's \"inspection\" never happened. The district facilities office has closed the field." },
  // Gamesmanship
  STOLEN_SIGNALS: { headline: 'Rival Says {team} Used Its Lost Play Sheet', story: "The opponent's coach says his play calls showed up in {team}'s game plan. The state association is reviewing the game film." },
  FILM_EXCHANGE: { headline: 'Film Exchange Complaint Filed Against {team}', story: 'The opponent says {team} broke the required film exchange. A district rules committee will decide on penalties.' },
  PRACTICE_DRONE: { headline: 'Drone Spying Complaint Lands on {team}', story: 'A rival school traced interference with its practice to a {team} booster. The district has opened a gamesmanship review.' },
  REF_CONNECTION: { headline: "Referee's Family Tie to {team} Revealed", story: "The officials' association learned a referee in a {team} game is related to a {team} coach. Past game assignments are being reviewed." },
  // Coaching staff
  ASSISTANT_CONTACT: { headline: 'Undue Influence Complaint Against {team} Coach', story: 'Middle school parents say a {team} assistant pitched "opportunities" to their sons. The state association is investigating.' },
  COORDINATOR_POACHED: { headline: 'Coaching Pay Questions at {team}', story: "How the staff handled the coordinator's job offer has reached the rival athletic director and the school board. Payroll records are under review." },
  ASSISTANT_DUI: { headline: 'Arrested Coach Kept His Duties at {team}', story: 'The administration learned a {team} assistant was never reported after a DUI arrest. The district has ordered an investigation.' },
  STAFF_STIPEND: { headline: 'Unreported Booster Bonuses for {team} Coaches', story: 'Records show assistants were paid by the booster club outside the district payroll. The school board and the state association are reviewing it.' },
  // Community, media & families
  RESIDENCY_TRANSFER: { headline: "Transfer's Address Questioned at {team}", story: "A rival school challenged a {team} transfer's residency. The district is checking leases and utility bills." },
  HELICOPTER_PARENT: { headline: 'Playing Time for Perks, Parents Charge', story: 'Parents say a starting job at {team} came with family perks attached. The athletic director is reviewing depth chart decisions.' },
  REPORTER_LEAK: { headline: '{team} Leak Story Takes a Turn', story: "The Town Journal reports on how the {team} staff handled its locker-room leak. The school board has questions." },
  CHARITY_GAME: { headline: 'Awareness Night Money Questioned', story: "The family behind the awareness night says the fundraiser's money never reached them. The district is auditing the event." },
  YOUTH_CAMP_FEES: { headline: 'Youth Camp Money Missing From District Books', story: "Auditors found camp profits in an account outside the district's control. The athletic department is under review." },
  STAR_TRANSFER_REQUEST: { headline: 'Promises Made to Keep {team} Star, Rival Says', story: 'The rival school says {team} made promises to keep {player}. The state association is looking into recruiting violations.' },
  COLLEGE_COACH_VISIT: { headline: 'Dead-Period Contact Reported at {team}', story: "A college coach's visit during an NCAA dead period has been reported. {player}'s eligibility may be reviewed." },
  FAMILY_HARDSHIP: { headline: 'Improper Benefits for {team} Player?', story: "The state association is reviewing arrangements made for {player}'s family. Help through boosters or team families can be an improper benefit." },
  PLAYOFF_TICKET_SCALPING: { headline: 'Playoff Ticket Markup Breaks District Policy', story: 'Students say donors resold {team} playoff seats at a markup. The district is reviewing ticket sales.' },
  PLAYOFF_PRACTICE_HOURS: { headline: 'Extra Practice Reported at {team}', story: "Players' parents say {team} practiced beyond the state's weekly limit. The state association is reviewing the schedule." },
  // Roster battles
  QB_CONTROVERSY: { headline: 'Starting QB Decision Questioned', story: 'Parents say the quarterback change at {team} followed a donation. The athletic director is reviewing it.' },
  FRESHMAN_PHENOM: { headline: 'Booster Perks for Freshman Family Reported', story: "Parents say {player}'s family received booster perks around his promotion. The state association is reviewing it." },
  SENIOR_NIGHT_WALKON: { headline: 'Senior Night Promise Broken', story: "{player}'s family says {team} promised him a Senior Night start, then quietly changed the plan. The story has the town talking." },
  TEAM_CAPTAIN_VOTE: { headline: 'Captain Vote Overruled at {team}', story: "Players say the captain vote was overruled after {player}'s family made a donation. The athletic director is reviewing the decision." },
  // New in v1.1: the town, families, and the program (their "Future Reckoning")
  WATER_CRISIS: { headline: 'District Reviews Game-Night Water Decision', story: 'The district is investigating how {team} handled the boil-water notice on game night. The outcome decides whether the school keeps hosting community events.' },
  RIVAL_BAND_BUS: { headline: 'Band Parents Speak Out About Bus Night', story: "Band families say their students were left to find their own way, or blamed for staying home. The schools' joint concert invitation is now in doubt." },
  NEWSPAPER_CORRECTION: { headline: 'Press Access Dispute at {team}', story: "The student paper says the football staff pressured it over a story about {player}. The paper's championship feature is on hold." },
  STADIUM_RENAMING: { headline: 'Players Say They Were Pressured at Board Meeting', story: 'Current and former players say the team was used to push the stadium renaming. The alumni reunion planned for the new name is turning divisive.' },
  RIVAL_LOST_DOG: { headline: 'Lost Dog Night Turns Into a Rivalry Story', story: 'The family whose dog went missing at the {team} game shared their side. The towns\' joint service day is now awkward.' },
  SCHOLARSHIP_CEREMONY: { headline: "Scholarship Committee Questions {team}'s No-Show", story: "The committee asked the school to explain the team's absence at {player}'s ceremony. The school's standing with the group has suffered." },
  EMPTY_TROPHY_CASE: { headline: 'Trophy Case History Challenged', story: "Former players compared the {team} trophy case with their own photos ahead of the centennial exhibit. The school's history is now in question." },
  RIVAL_MEMORIAL: { headline: "Rival Town Remembers {team}'s Response", story: 'The rival community says {team} turned away from its memorial. Cooperation on the next town event is in doubt.' },
  COACH_JOB_OFFER: { headline: "Coach's College Offer Becomes Public", story: "News of the college job broke before the final home game. {team} players and families feel misled about the coach's plans." },
  SISTER_HARASSMENT: { headline: 'Family Says {team} Silenced Them', story: "{player}'s family says the staff told them to stay quiet about his sister's harassment. The school has opened a review." },
  ALUMNUS_ACCUSED: { headline: '{team} Accused of Shielding a Booster', story: "Records show the football staff tried to settle an assault allegation privately. The district has opened an investigation, and the alumnus's homecoming honor is canceled." },
  TRIP_FEE: { headline: 'Team Travel Audit Finds Misused Accounts', story: "The school's review of playoff trip costs found fees covered from the wrong accounts. {player}'s private situation is now part of the story." },
  OLD_INJURY_COACH: { headline: "Former Star's Family Speaks Out", story: "The injured former star's family says {team} used his story without asking. He has declined to take part in championship week." },
  PARENT_TRUTH: { headline: 'A College Promise Comes Due', story: "{player}'s family met the real admissions requirements and says {team} promised recruiting that never came. The story has spread among parents." },
  TOWN_WANTS_WINNER: { headline: "Sponsors Question {team}'s Promises", story: 'Local businesses say the coach guaranteed a winning season to keep their money. Sponsor renewal night is going to be uncomfortable.' },
  LEAKED_PLAYBOOK: { headline: "Rival Coach Reveals {team}'s Fake Playbook", story: "The opponent's coach publicly revealed the playbook {team} fed through a player's friend. The program's reputation takes a hit." },
  WRONG_JERSEY: { headline: 'Jersey Number Went to the Bigger Donor?', story: 'A student article says a jersey number at {team} went to the family that donated more. Teammates are talking.' },
  BUS_BREAKDOWN: { headline: 'Transportation Audit After Bus Breakdown', story: 'A player reported an unsafe ride and the opponent disputed the delay. The school is reviewing who traveled, when officials were told, and what was reported.' },
  ANONYMOUS_TIP: { headline: "League Reviews the Age Allegation's Source", story: "The league traced how the age allegation against a rival player spread, and it leads to {team}. The eligibility hearing is now about {team}." },
  MISSING_EQUIPMENT: { headline: 'Damaged Helmets Found in Inspection', story: 'An equipment inspection found {team} played in damaged helmets, including {player}\'s. The state association has ordered a safety review.' },
  ASSISTANTS_SON: { headline: 'Players Question Fairness of Playing Time', story: "An anonymous player survey says playing time at {team} follows family ties, starting with an assistant's son. The athletic director is reviewing the depth chart." },
  SIDELINE_VIDEO: { headline: 'Student Paper Follows Up on Sideline Video', story: 'A student journalist interviewed {player} and his family after the next home game. The story is growing into an investigation.' },
  INJURED_RIVAL: { headline: 'Rival School Remembers How {team} Left', story: "The rival's players and families say {team} left an injured player alone. Pregame cooperation and sportsmanship are strained." },
  WRONGFUL_EJECTION: { headline: "League Reviews {team}'s Ejection Appeal", story: "The league found problems with how {team} handled {player}'s ejection. A disciplinary review is underway." },
  RIVALRY_BANNER: { headline: 'Rivalry Banner Leads to Crowd Trouble', story: 'The teams met again and the crowds arrived angry. School discipline followed, and the banner is part of the story.' },
  LATE_HIT: { headline: 'League Reviews Late Hit After Family Complaint', story: "The injured player's family filed a complaint about {player}'s late hit. Suspensions and penalties are on the table." },
  EMPTY_CLASSROOM: { headline: 'Attendance Records Reviewed Before Playoffs', story: "Teachers flagged {team} athletes' missed work and attendance before eligibility was finalized. The district is checking the records." },
  MISPRINTED_PROGRAM: { headline: 'College Asks {team} to Verify a Roster Claim', story: "A college asked the school to confirm a student manager's football role. The program and the reference don't match." },
  PARENT_ON_FIELD: { headline: 'Field Confrontation Back in the News', story: 'The parent who confronted {player} returned to a home game. How the staff responded the first time is now under review.' }
};

/** Older saves can hold decisions from dilemmas that have since been retired. */
const GENERIC = {
  headline: 'State Association Opens Inquiry Into {team} Football',
  story: 'A whistleblower has come forward about how the program handled "{title}". Compliance officials are reviewing the decision.'
};

/** The Town Journal's story when a decision comes out: the dilemma's own headline and story, then the call that was made. */
export function exposureNews(record: DilemmaRecord, teamName: string): { headline: string; content: string } {
  const text = EXPOSURES[record.templateId] ?? GENERIC;
  const fill = (s: string) =>
    s
      .split('{team}')
      .join(teamName)
      .split('{player}')
      .join(record.playerName ?? 'a player')
      .split('{title}')
      .join(record.title);
  const decision = record.choiceLabel ? ` The Week ${record.week} decision: ${record.choiceLabel}.` : '';
  return { headline: fill(text.headline), content: `${fill(text.story)}${decision}` };
}
