import { GameSimulationState, PlayConcept, PlayEvent, LeverageType, DefensiveCall, OffensiveScheme, HalftimeTalk } from '../types/game';

export type WorkerEventCallback = (data: {
  state: GameSimulationState;
  event?: PlayEvent;
  leverageType?: LeverageType;
}) => void;

class WorkerBridge {
  private worker: Worker | null = null;
  private onPlayResolvedCb: WorkerEventCallback | null = null;
  private onLeveragePromptCb: WorkerEventCallback | null = null;
  private onGameOverCb: WorkerEventCallback | null = null;
  private onTimeoutCb: ((data: { state: GameSimulationState; timeout: PlayEvent['timeout'] | null }) => void) | null = null;

  public initialize(): void {
    if (typeof window === 'undefined') return;
    this.worker = new Worker(new URL('../workers/simWorker.ts', import.meta.url), { type: 'module' });

    this.worker.onmessage = (e: MessageEvent) => {
      const { type, payload } = e.data;
      if (type === 'PLAY_RESOLVED' && this.onPlayResolvedCb) {
        this.onPlayResolvedCb(payload);
      } else if (type === 'LEVERAGE_MOMENT_PROMPT' && this.onLeveragePromptCb) {
        // The worker names the play that set up the decision "lastEvent"; expose it as `event` like a resolved play
        this.onLeveragePromptCb({ ...payload, event: payload.event ?? payload.lastEvent });
      } else if (type === 'GAME_COMPLETED' && this.onGameOverCb) {
        this.onGameOverCb(payload);
      } else if (type === 'TIMEOUT_CALLED' && this.onTimeoutCb) {
        this.onTimeoutCb(payload);
      }
    };
  }

  public initGame(state: GameSimulationState, userTeamId?: string): void {
    this.worker?.postMessage({ type: 'INIT_GAME', payload: state, userTeamId });
  }

  /** PLAYTEST: how often players get hurt during the game, and a multiplier on the flags */
  public setTestRates(rates: { injuries: number; penalties: number }): void {
    this.worker?.postMessage({ type: 'SET_TEST_RATES', payload: rates });
  }

  /** PLAYTEST: the coach's timeout (the clock stops at the last whistle) */
  public callTimeout(teamId: string): void {
    this.worker?.postMessage({ type: 'CALL_TIMEOUT', payload: { teamId } });
  }

  /** One snap; `staff`: the coach's staff is calling the game (Begin), so it may call his timeouts too (playtest) */
  public stepPlay(concept?: PlayConcept, defensiveCall?: DefensiveCall, staff = false): void {
    this.worker?.postMessage({ type: 'SIMULATE_NEXT_PLAY', payload: { chosenConcept: concept, defensiveCall, staff } });
  }

  public setGamePlan(teamId: string, offense: OffensiveScheme, defensiveCall: DefensiveCall | undefined, secondStringLead: number | null): void {
    this.worker?.postMessage({ type: 'SET_GAME_PLAN', payload: { teamId, offense, defensiveCall, secondStringLead } });
  }

  public setHalftimeTalk(teamId: string, talk: HalftimeTalk): void {
    this.worker?.postMessage({ type: 'SET_HALFTIME_TALK', payload: { teamId, talk } });
  }

  public simQuarter(): void {
    this.worker?.postMessage({ type: 'SIMULATE_QUARTER' });
  }

  public simToHalftime(): void {
    this.worker?.postMessage({ type: 'SIMULATE_TO_HALFTIME' });
  }

  public simToEnd(): void {
    this.worker?.postMessage({ type: 'SIMULATE_ENTIRE_GAME' });
  }

  public subscribe(callbacks: {
    onPlayResolved: WorkerEventCallback;
    onLeveragePrompt: WorkerEventCallback;
    onGameOver: WorkerEventCallback;
    onTimeout?: (data: { state: GameSimulationState; timeout: PlayEvent['timeout'] | null }) => void;
  }): void {
    this.onPlayResolvedCb = callbacks.onPlayResolved;
    this.onLeveragePromptCb = callbacks.onLeveragePrompt;
    this.onGameOverCb = callbacks.onGameOver;
    this.onTimeoutCb = callbacks.onTimeout ?? null;
  }
}

export const simWorkerBridge = new WorkerBridge();
