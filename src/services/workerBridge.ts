import { GameSimulationState, PlayConcept, PlayEvent, LeverageType, DefensiveCall } from '../types/game';

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
      }
    };
  }

  public initGame(state: GameSimulationState, userTeamId?: string): void {
    this.worker?.postMessage({ type: 'INIT_GAME', payload: state, userTeamId });
  }

  public stepPlay(concept?: PlayConcept, defensiveCall?: DefensiveCall): void {
    this.worker?.postMessage({ type: 'SIMULATE_NEXT_PLAY', payload: { chosenConcept: concept, defensiveCall } });
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
  }): void {
    this.onPlayResolvedCb = callbacks.onPlayResolved;
    this.onLeveragePromptCb = callbacks.onLeveragePrompt;
    this.onGameOverCb = callbacks.onGameOver;
  }
}

export const simWorkerBridge = new WorkerBridge();
