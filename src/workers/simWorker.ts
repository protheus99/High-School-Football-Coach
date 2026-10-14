import { GameSimulationState, PlayConcept, DefensiveCall, OffensiveScheme, HalftimeTalk } from '../types/game';
import { simulateSnap, evaluateLeverageTrigger } from '../sim/matchEngine';

let activeGameState: GameSimulationState | null = null;
let userTeamId: string | undefined;

self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data;

  switch (type) {
    case 'INIT_GAME': {
      activeGameState = payload as GameSimulationState;
      userTeamId = e.data.userTeamId;
      self.postMessage({ type: 'GAME_INITIALIZED', payload: activeGameState });
      break;
    }

    // The coach changes the game plan mid-game: it applies from the next snap (Balanced clears the fixed call)
    case 'SET_GAME_PLAN': {
      if (!activeGameState) return;
      const { teamId, offense, defensiveCall } = payload as { teamId: string; offense: OffensiveScheme; defensiveCall?: DefensiveCall };
      activeGameState.offensiveGamePlan = { ...activeGameState.offensiveGamePlan, [teamId]: offense };
      const defense = { ...activeGameState.defensiveGamePlan };
      if (defensiveCall) defense[teamId] = defensiveCall;
      else delete defense[teamId];
      activeGameState.defensiveGamePlan = defense;
      break;
    }

    // The halftime message: it shapes the team's plays for the rest of the game
    case 'SET_HALFTIME_TALK': {
      if (!activeGameState) return;
      const { teamId, talk } = payload as { teamId: string; talk: HalftimeTalk };
      activeGameState.halftimeTalks = { ...activeGameState.halftimeTalks, [teamId]: talk };
      break;
    }

    case 'SIMULATE_NEXT_PLAY': {
      if (!activeGameState || activeGameState.isGameOver) return;

      const chosenConcept = payload?.chosenConcept as PlayConcept | undefined;
      const defensiveCall = payload?.defensiveCall as DefensiveCall | undefined;
      const { state, event } = simulateSnap(activeGameState, chosenConcept, defensiveCall);
      activeGameState = state;

      // Check if next snap hits a leverage prompt
      const leveragePrompt = evaluateLeverageTrigger(activeGameState, userTeamId);
      if (leveragePrompt && !activeGameState.isGameOver) {
        self.postMessage({
          type: 'LEVERAGE_MOMENT_PROMPT',
          payload: { state: activeGameState, lastEvent: event, leverageType: leveragePrompt }
        });
      } else {
        self.postMessage({
          type: 'PLAY_RESOLVED',
          payload: { state: activeGameState, event }
        });
      }
      break;
    }

    // Sim Quarter: the rest of this quarter (all of overtime), decisions made by the staff
    case 'SIMULATE_QUARTER': {
      if (!activeGameState) return;
      const quarter = activeGameState.currentQuarter;
      while (!activeGameState.isGameOver && activeGameState.currentQuarter === quarter) {
        const { state } = simulateSnap(activeGameState);
        activeGameState = state;
      }
      self.postMessage({
        type: activeGameState.isGameOver ? 'GAME_COMPLETED' : 'PLAY_RESOLVED',
        payload: { state: activeGameState }
      });
      break;
    }

    // Sim to Half: the rest of the first half, decisions made by the staff; the locker room opens next
    case 'SIMULATE_TO_HALFTIME': {
      if (!activeGameState) return;

      while (!activeGameState.isGameOver && (activeGameState.currentQuarter === 1 || activeGameState.currentQuarter === 2)) {
        const { state } = simulateSnap(activeGameState);
        activeGameState = state;
      }

      self.postMessage({
        type: activeGameState.isGameOver ? 'GAME_COMPLETED' : 'PLAY_RESOLVED',
        payload: { state: activeGameState }
      });
      break;
    }

    case 'SIMULATE_ENTIRE_GAME': {
      if (!activeGameState) return;

      while (!activeGameState.isGameOver) {
        const { state } = simulateSnap(activeGameState);
        activeGameState = state;
      }

      self.postMessage({
        type: 'GAME_COMPLETED',
        payload: { state: activeGameState }
      });
      break;
    }

    default:
      break;
  }
};
