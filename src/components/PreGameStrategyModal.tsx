import React, { useState } from 'react';
import { Team, OffensiveScheme, DefensiveScheme, WeatherType } from '../types/game';
import { Sheet } from './ui/Sheet';
import { GamePlanPicker, SecondStringPicker } from './GamePlanPicker';
import { DEFENSE_NAMES, DEFENSE_STYLES, DefensiveFocus, OFFENSE_NAMES, OFFENSE_STYLES } from '../sim/gamePlan';
import { useGameStore } from '../store/gameStore';
import { usePlayoffRecords } from '../hooks/usePlayoffRecords';
import { recordText } from '../sim/seasonRecord';
import { GameStakes, TalkOption, gameStakes, pickTalks, pregameSituation, talkCount } from '../sim/talkPicker';
import { RECOMMENDS, SectionNote, SheetSection, SpeechList } from './SpeechPicker';

/** The speech picked before kickoff and the ones that were offered (the next game's offer avoids repeating them). */
export interface PregameSpeech {
  given: TalkOption;
  offered: TalkOption[];
}
import { isTrophyName, rivalryFor } from '../sim/rivalryEngine';

interface PreGameStrategyModalProps {
  userTeam: Team;
  opponentTeam: Team;
  forecast: { weather: WeatherType; temp: number; wind: number };
  onKickoff: (strategy: { selectedOffScheme: OffensiveScheme; selectedDefScheme: DefensiveScheme; focusTarget: DefensiveFocus; speech?: PregameSpeech }) => void;
  onCancel: () => void;
}

const WEATHER_NAMES: Record<WeatherType, string> = { CLEAR: 'Clear', HEAVY_RAIN: 'Heavy rain', HIGH_WIND: 'High wind', EXTREME_HEAT: 'Extreme heat', FREEZING_SNOW: 'Snow' };

/**
 * The game plan, on one phone screen, in four parts: the game (its banner on a big night, the opponent and the
 * weather), the strategy (four offenses and four defenses with arrows for how each matches up, a star on the best
 * fit), when the second string goes in, and the pre-game speech. Take the Field waits until a speech is picked.
 */
export const PreGameStrategyModal: React.FC<PreGameStrategyModalProps> = ({ userTeam, opponentTeam, forecast, onKickoff, onCancel }) => {
  const [offScheme, setOffScheme] = useState<OffensiveScheme>(userTeam.schemeOffense);
  const playoffs = usePlayoffRecords();
  const [focus, setFocus] = useState<DefensiveFocus>('BALANCED');
  // The bench line is the coach's standing choice: it carries over from game to game
  const [bench, setBench] = useState<number | null>(() => useGameStore.getState().secondStringLead);
  // The speeches are read once, when the room opens (the same game always offers the same ones)
  const [{ stakes, options }] = useState<{ stakes: GameStakes | undefined; options: TalkOption[] }>(() => {
    const s = useGameStore.getState();
    const found = gameStakes(s);
    if (!found) return { stakes: undefined, options: [] };
    const situation = pregameSituation(s, found, forecast.weather);
    return { stakes: found, options: pickTalks(situation, { seed: `${found.gameId}:PRE`, count: talkCount('PRE', s.coachingStaff), recent: s.recentTalks }) };
  });
  const [speech, setSpeech] = useState<string | null>(null);
  const ready = options.length === 0 || speech !== null;

  const theirDefense = opponentTeam.schemeDefense;
  const passFirst = OFFENSE_STYLES[opponentTeam.schemeOffense].toLowerCase();
  const rivalry = rivalryFor(userTeam, opponentTeam, useGameStore((s) => s.rivalryLog));

  return (
    <Sheet
      title="Game Night Strategy Room"
      subtitle={`vs. ${opponentTeam.name} ${opponentTeam.mascot} (${recordText(opponentTeam, playoffs)})`}
      onClose={onCancel}
      footer={
        <button
          className="ui-btn ui-btn-block"
          disabled={!ready}
          style={{ ...(ready && { background: '#047857', borderColor: '#047857', color: '#fff' }), minHeight: '50px', fontSize: '15px' }}
          onClick={() => {
            useGameStore.getState().setSecondStringLead(bench);
            const given = options.find((o) => o.talk.id === speech);
            onKickoff({
              selectedOffScheme: offScheme,
              selectedDefScheme: userTeam.schemeDefense,
              focusTarget: focus,
              ...(given && { speech: { given, offered: options } })
            });
          }}
        >
          🏈 Take the Field
        </button>
      }
    >
      <SheetSection title="Game information" first>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
          {/* A rivalry game's banner names it: "⚔️ Rivalry game: Jubilee Cup" */}
          {stakes?.banner && <div style={banner}>{rivalry ? stakes.banner.replace('Rivalry game', `Rivalry game: ${rivalry.name}`) : stakes.banner}</div>}
          {rivalry && (
            <div style={{ display: 'flex', gap: '8px', padding: '8px 10px', borderRadius: '10px', border: '1px solid #FECACA', background: '#FFF5F5', fontSize: '12.5px', color: '#7F1D1D' }}>
              <span aria-hidden="true">⚔️</span>
              <span>
                {rivalry.theirs
                  ? `${opponentTeam.name}'s rivalry game: they'll be fired up.`
                  : rivalry.series.wins + rivalry.series.losses === 0
                    ? `Your first ${rivalry.name}.`
                    : `Your record in it: ${rivalry.series.wins}-${rivalry.series.losses}.`}{' '}
                {isTrophyName(rivalry.name) ? 'The winner keeps the trophy for a year.' : 'Win it for the boosters and the bragging rights.'}
              </span>
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            <span style={chip}>
              Offense: <b>{OFFENSE_NAMES[opponentTeam.schemeOffense]}</b> · {passFirst}
            </span>
            <span style={chip}>
              Defense: <b>{DEFENSE_NAMES[theirDefense]}</b> · {DEFENSE_STYLES[theirDefense]}
            </span>
            <span style={chip}>
              Weather: <b>{WEATHER_NAMES[forecast.weather]} {forecast.temp}°</b> · {forecast.wind} mph
            </span>
          </div>
        </div>
      </SheetSection>

      <SheetSection title="Game Strategy" sub={`Arrows show how each option matches up against ${opponentTeam.name}.`}>
        <GamePlanPicker
          offense={offScheme}
          onOffense={setOffScheme}
          focus={focus}
          onFocus={setFocus}
          opponent={opponentTeam}
          usualOffense={userTeam.schemeOffense}
          weather={forecast.weather}
          bench={bench}
          onBench={setBench}
          showBench={false}
        />
      </SheetSection>

      <SheetSection title="When to play 2nd string" sub="Play second string when leading by">
        <div style={{ marginTop: '6px' }}>
          <SecondStringPicker bench={bench} onBench={setBench} label={false} />
        </div>
      </SheetSection>

      {options.length > 0 && (
        <SheetSection title="Pre-game speech" keyText={RECOMMENDS}>
          <SpeechList options={options} selected={speech} onSelect={setSpeech} />
          <SectionNote>{speech ? 'It lasts until halftime.' : 'Pick one to take the field. It lasts until halftime.'}</SectionNote>
        </SheetSection>
      )}
    </Sheet>
  );
};

const chip: React.CSSProperties = { fontSize: '12px', background: '#F1F5F9', color: '#334155', borderRadius: '999px', padding: '3px 8px', whiteSpace: 'nowrap' };
const banner: React.CSSProperties = {
  background: 'linear-gradient(90deg, #FEF3C7, #FFFBEB)',
  border: '1px solid #F59E0B',
  borderRadius: '10px',
  padding: '8px 10px',
  fontSize: '14px',
  fontWeight: 800,
  color: '#78350F'
};
