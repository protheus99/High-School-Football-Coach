import React, { useState } from 'react';
import { GameSimulationState, OffensiveScheme } from '../types/game';
import { Sheet } from './ui/Sheet';
import { GamePlanBar } from './GamePlanSheet';
import { DefensiveFocus } from '../sim/gamePlan';
import { useGameStore } from '../store/gameStore';
import {
  TalkOption,
  firstHalfLines,
  gameStakes,
  halftimeSituation,
  pickTalks,
  pregameSituation,
  stakesFromGame,
  talkCount
} from '../sim/talkPicker';
import { RECOMMENDS, SectionNote, SheetSection, SpeechList } from './SpeechPicker';

interface HalftimeSpeechModalProps {
  gameState: GameSimulationState;
  userTeamId: string;
  onApplySpeech: (given: TalkOption, offered: TalkOption[]) => void;
  plan?: { offense: OffensiveScheme; focus: DefensiveFocus; bench: number | null }; // the game plan, adjustable for the second half
  onUpdatePlan?: () => void;
}

/**
 * The halftime locker room: what stood out in the first half, the speeches that fit it (the assistant's pick
 * first), and the game plan. Return to the Field waits until a speech is picked.
 */
export const HalftimeSpeechModal: React.FC<HalftimeSpeechModalProps> = ({ gameState, userTeamId, onApplySpeech, plan, onUpdatePlan }) => {
  const isUserHome = gameState.homeTeam.id === userTeamId;
  const userScore = isUserHome ? gameState.homeScore : gameState.awayScore;
  const oppScore = isUserHome ? gameState.awayScore : gameState.homeScore;
  const margin = userScore - oppScore;

  // The first half is read once, when the locker room opens (a reopened game offers the same speeches)
  const [{ options, lines }] = useState(() => {
    const s = useGameStore.getState();
    const stakes = gameStakes(s) ?? stakesFromGame(gameState, userTeamId);
    const situation = halftimeSituation(pregameSituation(s, stakes, gameState.weather), gameState, userTeamId);
    return {
      options: pickTalks(situation, { seed: `${gameState.gameId}:HALF`, count: talkCount('HALF', s.coachingStaff), recent: s.recentTalks }),
      lines: firstHalfLines(situation, stakes)
    };
  });
  const [speech, setSpeech] = useState<string | null>(null);
  const given = options.find((o) => o.talk.id === speech);

  return (
    <Sheet
      title="⏱️ Halftime Locker Room"
      subtitle={`${userScore}-${oppScore} · ${margin > 0 ? `Leading by ${margin}` : margin < 0 ? `Trailing by ${Math.abs(margin)}` : 'Tied'}`}
      dismissible={false}
      footer={
        <button
          className="ui-btn ui-btn-block"
          disabled={!given}
          style={{ ...(given && { background: '#047857', borderColor: '#047857', color: '#fff' }), minHeight: '50px', fontSize: '15px' }}
          onClick={() => given && onApplySpeech(given, options)}
        >
          🏈 Return to the Field
        </button>
      }
    >
      <SheetSection title="The first half" first>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '6px', fontSize: '14px', color: '#1E293B' }}>
          {lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      </SheetSection>

      <SheetSection title="Halftime speech" keyText={RECOMMENDS}>
        <SpeechList options={options} selected={speech} onSelect={setSpeech} />
        <SectionNote>{given ? 'It lasts the rest of the game.' : 'Pick one to return to the field. It lasts the rest of the game.'}</SectionNote>
      </SheetSection>

      {plan && onUpdatePlan && (
        <SheetSection title="Game plan">
          <div style={{ marginTop: '8px' }}>
            <GamePlanBar offense={plan.offense} focus={plan.focus} bench={plan.bench} onUpdate={onUpdatePlan} />
          </div>
        </SheetSection>
      )}
    </Sheet>
  );
};
