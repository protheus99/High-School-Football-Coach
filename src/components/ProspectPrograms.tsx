import React, { useState } from 'react';
import { FEEDER_EVENTS, FeederEventType, ONCE_A_YEAR, TRYOUT_SPORTS, TryoutSport } from '../sim/feederEngine';
import type { ProgramResult } from '../store/gameStore';
import type { FeederProspect } from '../types/game';
import { Sheet } from './ui/Sheet';

/*
 * Prospects › Programs: every program does one thing. Camps find new players, the Combine reveals potential, and
 * the Position Program and Family Night raise interest. Running one opens a pop-up with exactly what it changed.
 */

const CAMPS: FeederEventType[] = ['YOUTH_CLINIC', 'SEVEN_ON_SEVEN_LEAGUE', 'LOCKDOWN_LEAGUE', 'BIG_MAN_CAMP', 'SPECIAL_TEAMS_CAMP'];
/** The Position Program's choices: one program per position group, each with its own cooldown. */
const POSITION_PROGRAMS: FeederEventType[] = ['QB_ACADEMY', 'BALL_CARRIER_CLINIC', 'ROUTE_RUNNERS_SCHOOL', 'THE_TRENCHES', 'WAR_ZONE', 'LINEBACKER_U', 'THE_NICKEL'];
const SPORTS = Object.keys(TRYOUT_SPORTS) as TryoutSport[];
const COLORS = { camp: '#0F766E', scout: '#2563EB', interest: '#EA580C' };

const positionsTag = (type: FeederEventType) => FEEDER_EVENTS[type].tag ?? FEEDER_EVENTS[type].positions?.join(' ');
const weeks = (n: number) => `${n} wk${n === 1 ? '' : 's'}`;

export const ProspectPrograms: React.FC<{
  coachPoints: number;
  cost: (type: FeederEventType) => number;
  cooldowns: Partial<Record<FeederEventType, number>>;
  open: boolean; // programs are closed in the post season
  familyCount: number; // prospects on the coach's list that Family Night can still warm
  onRun: (type: FeederEventType, sport?: TryoutSport) => void;
}> = ({ coachPoints, cost, cooldowns, open, familyCount, onRun }) => {
  const [sport, setSport] = useState<TryoutSport>('BASKETBALL');
  const [position, setPosition] = useState<FeederEventType>('QB_ACADEMY');
  const wait = (type: FeederEventType) => cooldowns[type] ?? 0;

  const runButton = (type: FeederEventType, color: string, sportPicked?: TryoutSport) => {
    const price = cost(type);
    const left = wait(type);
    // Family Night warms the list only: nothing to do until it holds someone below 100 interest
    const emptyList = type === 'FAMILY_NIGHT' && familyCount === 0;
    const blocked = !open || left > 0 || coachPoints < price || emptyList;
    const label = !open
      ? 'After the banquet'
      : emptyList && left === 0
        ? 'Add prospects to your list first'
        : left > 0
        ? FEEDER_EVENTS[type].oncePerYear || left >= ONCE_A_YEAR
          ? 'Next season'
          : `Back in ${weeks(left)}`
        : coachPoints < price
          ? `₡${price}: not enough`
          : `Host ₡${price}`;
    return (
      <button className="program-run" style={{ '--program-color': color } as React.CSSProperties} disabled={blocked} onClick={() => onRun(type, sportPicked)}>
        {label}
      </button>
    );
  };

  const card = (type: FeederEventType, color: string, options: { title?: string; description?: string; tag?: string; picker?: React.ReactNode; runAs?: FeederEventType; sport?: TryoutSport } = {}) => {
    const program = FEEDER_EVENTS[type];
    const tag = options.tag ?? positionsTag(type);
    return (
      <div key={type} className="program-card" style={{ borderLeftColor: color }}>
        <div className="program-card-name">
          <b>{options.title ?? program.label}</b>
          <span className="program-card-tags">
            {tag && <span className="program-tag">{tag}</span>}
            {program.oncePerYear && <span className="program-once">ONCE A YEAR</span>}
          </span>
        </div>
        <div className="program-card-desc">{options.description ?? program.description}</div>
        {options.picker}
        {runButton(options.runAs ?? type, color, options.sport)}
      </div>
    );
  };

  const heading = (label: string, sub: string, color: string, note?: string) => (
    <div className="program-group-head">
      <span className="program-group-label">
        <b style={{ color }}>{label}</b> - {sub}
      </span>
      {note && <span className="program-group-note">{note}</span>}
    </div>
  );

  const sportPicker = (
    <div className="program-picks" role="radiogroup" aria-label="Sport">
      {SPORTS.map((s) => (
        <button
          key={s}
          role="radio"
          aria-checked={s === sport}
          className={`program-pick${s === sport ? ' is-picked' : ''}`}
          style={{ '--program-color': COLORS.camp } as React.CSSProperties}
          disabled={wait('TRYOUT_DAY') > 0}
          onClick={() => setSport(s)}
        >
          <span>
            {TRYOUT_SPORTS[s].emoji} {TRYOUT_SPORTS[s].label}
          </span>
          <small>{TRYOUT_SPORTS[s].tag}</small>
        </button>
      ))}
    </div>
  );

  const positionPicker = (
    <div className="program-picks" role="radiogroup" aria-label="Position">
      {POSITION_PROGRAMS.map((type) => {
        const left = wait(type);
        return (
          <button
            key={type}
            role="radio"
            aria-checked={type === position}
            className={`program-pick${type === position ? ' is-picked' : ''}`}
            style={{ '--program-color': COLORS.interest } as React.CSSProperties}
            onClick={() => setPosition(type)}
          >
            <span>{FEEDER_EVENTS[type].label}</span>
            <small>{left > 0 ? `Back in ${weeks(left)}` : positionsTag(type)}</small>
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      <section className="program-group">
        {heading('Camps', 'Find new players', COLORS.camp, 'every 6 weeks')}
        {CAMPS.map((type) => card(type, COLORS.camp))}
        {card('TRYOUT_DAY', COLORS.camp, { tag: '', picker: sportPicker, sport })}
      </section>
      <section className="program-group">
        {heading('Scouting', 'Reveal potential', COLORS.scout, 'every 8 weeks')}
        {card('COMBINE', COLORS.scout)}
      </section>
      <section className="program-group">
        {heading('Interest', 'Win prospects over', COLORS.interest)}
        {card(position, COLORS.interest, {
          title: 'Position Program',
          tag: '',
          description: '+6–10 interest for every prospect at the position you pick. Each position comes back in 8 weeks.',
          picker: positionPicker
        })}
        {card('FAMILY_NIGHT', COLORS.interest, {
          description: `+10 interest for every prospect on your list (${familyCount} now).`
        })}
      </section>
    </>
  );
};

/** What a program did: new prospects, interest gained (before → after), or potential revealed. */
export const ProgramResultSheet: React.FC<{
  result: ProgramResult;
  poolFull: boolean;
  listed: Set<string>;
  onToggleList: (prospectId: string) => void;
  onSeeStudents: () => void;
  onClose: () => void;
}> = ({ result, poolFull, listed, onToggleList, onSeeStudents, onClose }) => {
  const program = FEEDER_EVENTS[result.type];
  const color = program.group === 'DISCOVER' ? COLORS.camp : program.group === 'SCOUT' ? COLORS.scout : COLORS.interest;
  const isFamily = result.type === 'FAMILY_NIGHT';
  const finds = program.group === 'DISCOVER';
  const scouts = program.group === 'SCOUT';
  const some = (finds && result.discovered.length > 0) || (scouts && result.scouted.length > 0);

  const addButton = (p: FeederProspect) => {
    const on = listed.has(p.id);
    return (
      <button className={`program-list-add${on ? ' is-on' : ''}`} aria-label={on ? `${p.name} is on your list` : `Add ${p.name} to your list`} title={on ? 'On your list' : 'Add to your list'} onClick={() => onToggleList(p.id)}>
        {on ? '✓' : '+'}
      </button>
    );
  };
  const row = (p: FeederProspect, right: React.ReactNode, sub?: string) => (
    <div key={p.id} className="program-result-row">
      <span className="program-result-pos">{p.projectedPosition}</span>
      <div className="program-result-who">
        <div className="program-result-name">{p.name}</div>
        {sub && <div className="program-result-sub">{sub}</div>}
      </div>
      {right}
      {addButton(p)}
    </div>
  );
  const summary = (big: React.ReactNode, what: React.ReactNode, pill?: string) => (
    <div className="program-result-summary" style={{ borderLeftColor: color }}>
      {big !== null && <span className="program-result-big" style={{ color: scouts ? COLORS.scout : '#15803D' }}>{big}</span>}
      <span className="program-result-what">{what}</span>
      {pill && <span className="program-result-pill">{pill}</span>}
    </div>
  );

  let body: React.ReactNode;
  if (finds) {
    const athlete = result.type === 'TRYOUT_DAY';
    const miss = poolFull
      ? `Your pool is full: remove some prospects to make room.`
      : result.type === 'SPECIAL_TEAMS_CAMP'
        ? 'No new kicker or punter came out this time.'
        : 'No one new came out this time.';
    body = (
      <>
        {summary(`+${result.discovered.length}`, athlete ? 'New in your pool: he always signs' : 'New in your pool')}
        {result.discovered.length > 0 ? (
          <>
            <div className="program-result-head">Who joined</div>
            {result.discovered.map((p) => row(p, null, p.middleSchool))}
          </>
        ) : (
          <p className="program-result-none">{miss}</p>
        )}
      </>
    );
  } else if (scouts) {
    body = (
      <>
        {summary(result.scouted.length, 'Potential revealed')}
        {result.scouted.length > 0 ? (
          <>
            <div className="program-result-head">Scouted</div>
            {result.scouted.map((p) => row(p, <span className="program-result-grade">{p.revealedPotential}</span>, p.middleSchool))}
          </>
        ) : (
          <p className="program-result-none">Every prospect in your pool has already been scouted.</p>
        )}
      </>
    );
  } else {
    const who = isFamily ? `${result.warmed.length} on your list` : `${result.warmed.length} ${result.warmed.length === 1 ? 'prospect' : 'prospects'} at ${positionsTag(result.type)}`;
    body = (
      <>
        {summary(null, who, `${isFamily ? '+10' : '+6–10'} interest`)}
        {result.warmed.length > 0 ? (
          <>
            <div className="program-result-head">Interest</div>
            {result.warmed.map(({ prospect, before, after }) =>
              row(
                prospect,
                <span className="program-result-gain">
                  {before} → <b>{after}</b>
                </span>
              )
            )}
          </>
        ) : (
          <p className="program-result-none">{isFamily ? 'Nobody on your list could gain interest.' : 'No prospects at these positions in your pool yet.'}</p>
        )}
      </>
    );
  }

  return (
    <Sheet
      title={`${program.label} held`}
      onClose={onClose}
      footer={
        <div className="program-result-buttons">
          {some && (
            <button className="ui-btn" onClick={onSeeStudents}>
              See on Students
            </button>
          )}
          <button className="ui-btn ui-btn-dark" style={some ? undefined : { gridColumn: '1 / -1' }} onClick={onClose}>
            Got it
          </button>
        </div>
      }
    >
      {body}
    </Sheet>
  );
};
