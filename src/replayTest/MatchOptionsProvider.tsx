// The match page's options (Plays shown, Play-by-play, Scoreboard, the field's look, the card delays), kept in this
// browser only. The game and the playtest pages each keep their own; the playtest adds its injury and flag switches.
import React, { useEffect, useState } from 'react';
import { DEFAULT_REPLAY_OPTIONS, ReplayOptions, ReplayOptionsContext, ReplayOptionsSetContext } from './matchOptions';

const SCOREBOARDS: ReplayOptions['scoreboard'][] = ['stadium', 'simple', 'score'];

function load(key: string, playtest: boolean): ReplayOptions {
  try {
    const o = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!o) return { ...DEFAULT_REPLAY_OPTIONS, playtest };
    const opts: ReplayOptions = { ...DEFAULT_REPLAY_OPTIONS, ...o, look: { ...DEFAULT_REPLAY_OPTIONS.look, ...o.look }, playtest };
    // (the old match card, "As now", is gone: an old choice of it gets the stadium board)
    if (!SCOREBOARDS.includes(opts.scoreboard)) opts.scoreboard = 'stadium';
    return opts;
  } catch {
    return { ...DEFAULT_REPLAY_OPTIONS, playtest };
  }
}

export const MatchOptionsProvider: React.FC<{ storageKey: string; playtest?: boolean; children: React.ReactNode }> = ({ storageKey, playtest = false, children }) => {
  const [opts, setOpts] = useState<ReplayOptions>(() => load(storageKey, playtest));
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ ...opts, playtest: undefined }));
    } catch {
      // storage unavailable: the options hold for this visit
    }
  }, [opts, storageKey]);
  return (
    <ReplayOptionsSetContext.Provider value={(o) => setOpts({ ...o, playtest })}>
      <ReplayOptionsContext.Provider value={opts}>{children}</ReplayOptionsContext.Provider>
    </ReplayOptionsSetContext.Provider>
  );
};
