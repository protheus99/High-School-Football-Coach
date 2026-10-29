import React from 'react';
import type { Player } from '../../types/game';
import { fatigueLevel } from '../../sim/training';
import { formatPercent } from '../../utils/format';
import { CLASS_SHORT, PlayerTrouble, STRING_LABELS, fullName, playerTrouble, ratingColor, starsLabel } from '../../utils/playerFormat';

/** The rating as a colored tile (green 80+, blue 70s, amber 60s, gray below). */
export const OvrTile: React.FC<{ ovr: number; large?: boolean }> = ({ ovr, large }) => (
  <span className={`pl-ovr${large ? ' pl-ovr-lg' : ''}`} style={{ background: ratingColor(ovr) }} aria-label={`Overall ${ovr}`}>
    {ovr}
  </span>
);

/** The locked tile in the rating's spot on another team's player card. */
export const LockedTile: React.FC = () => (
  <span className="pl-ovr pl-ovr-lg pl-ovr-locked" aria-label="Rating private">
    🔒
  </span>
);

export const PosChip: React.FC<{ pos: string }> = ({ pos }) => <span className="pl-pos">{pos}</span>;

/** The potential grade: a bold letter. */
export const PotentialGrade: React.FC<{ grade: string }> = ({ grade }) => (
  <b className="pl-pot" title={`Potential ${grade}`}>
    {grade}
  </b>
);

/** Trouble as a chip: red when he can't play, amber for a warning. */
export const TroubleChip: React.FC<{ trouble: PlayerTrouble }> = ({ trouble }) => (
  <span className={`pl-chip ${trouble.tone === 'out' ? 'pl-chip-out' : 'pl-chip-warn'}`}>
    <span aria-hidden="true">{trouble.icon}</span> {trouble.label}
  </span>
);

/** Fatigue in gray ("Good 35%") until it's a problem: Tired and Exhausted are the amber warning chip. */
export const FatigueNote: React.FC<{ fatigue: number }> = ({ fatigue }) => {
  const level = fatigueLevel(fatigue);
  const text = `${level} ${formatPercent(fatigue)}`;
  return level === 'Tired' || level === 'Exhausted' ? <span className="pl-chip pl-chip-warn">{text}</span> : <span className="pl-muted">{text}</span>;
};

export interface PlayerRowProps {
  name: string;
  pos?: string;
  /** His rating when he is yours; other teams' ratings are private (no tile). */
  ovr?: number;
  /** A leaderboard rank, before everything else. */
  rank?: number;
  stars?: number;
  isNew?: boolean;
  trouble?: PlayerTrouble | null;
  /** Chips after the trouble chip (a Tired fatigue warning). */
  chips?: React.ReactNode;
  /** The gray details line, in order: class · string · potential · the screen's extras. Empty items are skipped. */
  details?: React.ReactNode[];
  /** The screen's own value or buttons: a stat, weeks out, ▼▲. */
  right?: React.ReactNode;
  onClick?: () => void;
  /** A pickable row (the game ball): aria-pressed on the button. */
  pressed?: boolean;
  ariaLabel?: string;
  /** Your team on a list of many (blue), or the picked row. */
  tone?: 'mine' | 'selected';
  className?: string;
}

/**
 * A player in a list: [rating] [POS] Full Name (3★) NEW, then one line: the trouble chip and gray details. Never more
 * than two lines. The left edge turns red when he can't play and amber for a warning.
 */
export const PlayerRow: React.FC<PlayerRowProps> = ({ name, pos, ovr, rank, stars = 0, isNew, trouble, chips, details = [], right, onClick, pressed, ariaLabel, tone, className }) => {
  const shown = details.filter((d) => d !== null && d !== undefined && d !== false && d !== '');
  const main = (
    <>
      {rank !== undefined && <span className={`pl-rank${rank <= 3 ? ' pl-rank-top' : ''}`}>#{rank}</span>}
      {ovr !== undefined && <OvrTile ovr={ovr} />}
      <span className="pl-text">
        <span className="pl-line1">
          {pos && <PosChip pos={pos} />}
          <span className="pl-name">{name}</span>
          {stars > 0 && <span className="pl-stars">{starsLabel(stars)}</span>}
          {isNew && <span className="pl-new">NEW</span>}
        </span>
        {(trouble || chips || shown.length > 0) && (
          <span className="pl-line2">
            {trouble && <TroubleChip trouble={trouble} />}
            {chips}
            {shown.length > 0 && (
              <span className="pl-details">
                {shown.map((d, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && ' · '}
                    {d}
                  </React.Fragment>
                ))}
              </span>
            )}
          </span>
        )}
      </span>
    </>
  );
  const classes = ['pl-row', trouble?.tone === 'out' ? 'pl-row-out' : trouble?.tone === 'warn' ? 'pl-row-warn' : '', tone ? `pl-row-${tone}` : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <div className={classes}>
      {onClick ? (
        <button type="button" className="pl-main" onClick={onClick} aria-pressed={pressed} aria-label={ariaLabel}>
          {main}
        </button>
      ) : (
        <span className="pl-main">{main}</span>
      )}
      {right !== undefined && right !== null && <span className="pl-right">{right}</span>}
    </div>
  );
};

/**
 * The standard row for a Player: rating when he is yours, position, full name, stars, NEW, his trouble, then class ·
 * string · potential (yours only) and any extras.
 */
export function playerRowProps(
  p: Player,
  opts: {
    own?: boolean;
    atRiskGpa?: number;
    isNew?: boolean;
    noPos?: boolean;
    noString?: boolean;
    noPotential?: boolean;
    extra?: React.ReactNode[];
  } = {}
): PlayerRowProps {
  const own = opts.own ?? true;
  return {
    name: fullName(p),
    pos: opts.noPos ? undefined : p.position,
    ovr: own ? p.overallRating : undefined,
    stars: p.recruiting.starRating,
    isNew: opts.isNew,
    trouble: own ? playerTrouble(p, opts.atRiskGpa) : null,
    details: [
      CLASS_SHORT[p.classYear],
      own && !opts.noString ? STRING_LABELS[p.depthChartTier] : null,
      own && !opts.noPotential ? <PotentialGrade grade={p.potential} /> : null,
      ...(opts.extra ?? [])
    ]
  };
}
