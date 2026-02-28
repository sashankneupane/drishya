import type { ReplayState } from "../../wasm/contracts.js";

export interface ReplayLikeClient {
  replayPlay(): void;
  replayPause(): void;
  replayStop(): void;
  replayStepBar(): number | null;
  replayStepEvent(): number | null;
  replaySeekTs(ts: number): void;
  replayTick(): number | null;
  replayState(): ReplayState;
}

export type ReplayListener = (state: ReplayState) => void;
