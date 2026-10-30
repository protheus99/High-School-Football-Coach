import React from 'react';
import type { Player } from '../../types/game';
import { CLASS_SHORT, STRING_LABELS, fullName, playerTrouble } from '../../utils/playerFormat';
import { PlayerRowProps, PotentialGrade } from './PlayerRow';

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
