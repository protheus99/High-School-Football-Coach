import React, { useEffect, useRef, useState } from 'react';
import { Player, Position, Team } from '../types/game';
import { DESKTOP_QUERY, useMediaQuery } from '../hooks/useMediaQuery';
import { DEPTH_TEMPLATE, SLOT_LABELS, depthGroup, starterRatings } from '../sim/depthChart';
import { fatigueLevel } from '../sim/training';
import { rulesForState } from '../sim/stateRules';
import { formatPercent } from '../utils/format';
import { scroller } from '../utils/pageScroll';
import { CLASS_SHORT, fullName, playerTrouble, ratingColor, showNewTag, starsLabel } from '../utils/playerFormat';
import { FatigueNote, PlayerRow, PotentialGrade, TroubleChip, playerRowProps } from './ui/PlayerRow';

/** A slot on the depth chart: a position and which starter column it is (e.g. OT column 0 = LT). */
type Slot = [Position, number];
type UnitId = 'offense' | 'defense' | 'special';

// One table per slot, in the order a depth chart is read: offense, defense, then special teams
const UNITS: { id: UnitId; title: string; short: string; slots: Slot[] }[] = [
  {
    id: 'offense',
    title: 'Offense',
    short: 'Offense',
    slots: [
      ['QB', 0],
      ['RB', 0],
      ['WR', 0],
      ['WR', 1],
      ['WR', 2],
      ['TE', 0],
      ['OT', 0],
      ['OG', 0],
      ['C', 0],
      ['OG', 1],
      ['OT', 1]
    ]
  },
  {
    id: 'defense',
    title: 'Defense',
    short: 'Defense',
    slots: [
      ['DE', 0],
      ['DT', 0],
      ['DT', 1],
      ['DE', 1],
      ['LB', 0],
      ['LB', 1],
      ['LB', 2],
      ['CB', 0],
      ['CB', 1],
      ['S', 0],
      ['S', 1]
    ]
  },
  {
    id: 'special',
    title: 'Special Teams',
    short: 'Special',
    slots: [
      ['K', 0],
      ['P', 0]
    ]
  }
];

const tired = (p: Player) => ['Tired', 'Exhausted'].includes(fatigueLevel(p.condition.seasonWear));
/** Phones show fatigue only once it matters: Worn in gray, Tired and Exhausted as the amber chip. */
const worn = (p: Player) => fatigueLevel(p.condition.seasonWear) === 'Worn';

/** Where a unit heading lands after a jump, and the line it has to pass to count as the unit on screen. */
const NAV_OFFSET = 'calc(var(--topbar-h) + 76px)';

/**
 * The depth chart: one table per slot (QB, RB, WR, … K, P), players in depth order with the starter on top. Each
 * player shows his rating, name and stars, potential, class, fatigue and college offers, with ▼▲ to move him at his
 * position. Desktop shows columns; phones put the details in a line of tags under the name. A sticky bar jumps
 * between offense, defense and special teams and shows each unit's rating.
 */
export const DepthChartBoard: React.FC<{
  team: Team;
  onMove: (playerId: string, direction: -1 | 1) => void;
  onSelect?: (player: Player) => void;
  currentYear?: number; // newcomers get a NEW tag from signing day through training camp
  currentWeek?: number;
}> = ({ team, onMove, onSelect, currentYear, currentWeek }) => {
  const isPhone = !useMediaQuery(DESKTOP_QUERY);
  const ratings = starterRatings(team.roster);
  const groups = new Map((Object.keys(DEPTH_TEMPLATE) as Position[]).map((pos) => [pos, depthGroup(team.roster, pos)]));
  const headings = useRef<Partial<Record<UnitId, HTMLElement | null>>>({});
  const nav = useRef<HTMLElement | null>(null);
  const [active, setActive] = useState<UnitId>('offense');

  // The unit on screen: the last one whose heading has scrolled up to the sticky bar
  useEffect(() => {
    const el = scroller();
    const onScroll = () => {
      const line = (nav.current?.getBoundingClientRect().bottom ?? 0) + 24;
      let on: UnitId = 'offense';
      UNITS.forEach((u) => {
        const h = headings.current[u.id];
        if (h && h.getBoundingClientRect().top <= line) on = u.id;
      });
      setActive(on);
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  /** Every player in a slot, in depth order (the starter first, then 2nd, 3rd and the reserves). */
  const slotPlayers = ([position, column]: Slot) => {
    const group = groups.get(position)!;
    const k = DEPTH_TEMPLATE[position].starters;
    return group.flatMap((p, i) => (i % k === column ? [{ p, i, k, last: i + k >= group.length }] : []));
  };

  const atRiskGpa = rulesForState(team.state).academics.atRiskGpa;
  const isNew = (p: Player) => showNewTag(p, currentYear, currentWeek);

  /** Desktop: the name, his stars and NEW, then his trouble chip (injured, suspended, ineligible, grades). */
  const nameCell = (p: Player, starter: boolean) => {
    const trouble = playerTrouble(p, atRiskGpa);
    return (
      <span className="depth-name">
        <button onClick={() => onSelect?.(p)} title={`${fullName(p)} · ${p.classYear}`} style={{ fontWeight: starter ? 'bold' : 'normal' }}>
          {fullName(p)}
        </button>
        {p.recruiting.starRating > 0 && <span className="pl-stars">{starsLabel(p.recruiting.starRating)}</span>}
        {isNew(p) && <span className="pl-new">NEW</span>}
        {trouble && <TroubleChip trouble={trouble} />}
      </span>
    );
  };

  const offersText = (p: Player) => {
    const offers = p.recruiting.offers.length;
    return offers === 0 ? null : offers === 1 ? '1 offer' : `${offers} offers`;
  };

  // No ▲ for the starter and no ▼ for the last man (an empty space keeps the buttons lined up)
  const moveButton = (p: Player, direction: -1 | 1, show: boolean) =>
    show ? (
      <button className="depth-move" onClick={() => onMove(p.id, direction)} aria-label={`Move ${p.lastName} ${direction < 0 ? 'up' : 'down'}`}>
        {direction < 0 ? '▲' : '▼'}
      </button>
    ) : (
      <span className="depth-move-space" />
    );

  const table = (slot: Slot) => {
    const rows = slotPlayers(slot);
    const label = SLOT_LABELS[slot[0]][slot[1]];
    return (
      <table key={`${slot[0]}_${slot[1]}`} className="depth-table">
        <colgroup>
          <col style={{ width: '64px' }} />
          <col />
          <col style={{ width: '82px' }} />
          <col style={{ width: '52px' }} />
          <col style={{ width: '112px' }} />
          <col style={{ width: '88px' }} />
          <col style={{ width: '48px' }} />
          <col style={{ width: '48px' }} />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">{label}</th>
            <th scope="col" className="depth-th-name">
              Name
            </th>
            <th scope="col">Potential</th>
            <th scope="col">Year</th>
            <th scope="col">Fatigue</th>
            <th scope="col">Offers</th>
            <th scope="col">Down</th>
            <th scope="col">Up</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ p, i, k, last }, r) => (
            <tr key={p.id} className={r === 0 ? 'depth-starter' : r >= 3 ? 'depth-reserve' : undefined}>
              <td>
                <span className="depth-ovr" style={{ background: ratingColor(p.overallRating) }}>
                  {p.overallRating}
                </span>
              </td>
              <td className="depth-td-name">{nameCell(p, r === 0)}</td>
              <td>
                <PotentialGrade grade={p.potential} />
              </td>
              <td>{CLASS_SHORT[p.classYear]}</td>
              <td>
                <FatigueNote fatigue={p.condition.seasonWear} />
              </td>
              <td className="pl-muted">{offersText(p)}</td>
              <td>{moveButton(p, 1, !last)}</td>
              <td>{moveButton(p, -1, i - k >= 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  /** Phones: the standard player row; the slot heading says the position and the order says the string. */
  const card = (slot: Slot) => {
    const rows = slotPlayers(slot);
    return (
      <div key={`${slot[0]}_${slot[1]}`} className="depth-card">
        <div className="depth-card-head">{SLOT_LABELS[slot[0]][slot[1]]}</div>
        <div className="depth-card-rows">
          {rows.map(({ p, i, k, last }, r) => (
            <PlayerRow
              key={p.id}
              {...playerRowProps(p, {
                atRiskGpa,
                isNew: isNew(p),
                noPos: true,
                noString: true,
                extra: [worn(p) ? `Worn ${formatPercent(p.condition.seasonWear)}` : null, offersText(p)]
              })}
              chips={tired(p) ? <FatigueNote fatigue={p.condition.seasonWear} /> : undefined}
              onClick={() => onSelect?.(p)}
              className={r === 0 ? 'depth-row-starter' : r >= 3 ? 'depth-row-reserve' : undefined}
              right={
                <span className="depth-row-moves">
                  {moveButton(p, 1, !last)}
                  {moveButton(p, -1, i - k >= 0)}
                </span>
              }
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="depth-board">
      <nav ref={nav} className="depth-unit-nav" aria-label="Depth chart units">
        {UNITS.map((u) => (
          <button
            key={u.id}
            aria-current={active === u.id ? 'true' : undefined}
            onClick={() => headings.current[u.id]?.scrollIntoView()}
          >
            {isPhone ? u.short : u.title}
            <span className="depth-unit-badge" style={{ background: ratingColor(ratings[u.id].rating) }}>
              OVR {ratings[u.id].rating}
            </span>
          </button>
        ))}
      </nav>
      {UNITS.map((u) => (
        <section key={u.id} aria-label={u.title}>
          <h3
            ref={(el) => {
              headings.current[u.id] = el;
            }}
            className="depth-unit-title"
            style={{ scrollMarginTop: NAV_OFFSET }}
          >
            {u.title}
            <span className="depth-unit-badge" style={{ background: ratingColor(ratings[u.id].rating) }}>
              OVR {ratings[u.id].rating}
            </span>
          </h3>
          <div className="depth-list">{u.slots.map(isPhone ? card : table)}</div>
        </section>
      ))}
      <p className="depth-note">
        Players are listed in depth order: the top row (blue) starts. ▲▼ move a player up or down at his position. {isPhone ? 'Tap' : 'Click'} a name
        for his player card. <span className="depth-out">OUT</span> injured or ineligible: the next man up plays.
      </p>
    </div>
  );
};
