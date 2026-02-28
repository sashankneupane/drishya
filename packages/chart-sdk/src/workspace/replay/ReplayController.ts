import type { ReplayState } from "../../wasm/contracts.js";
import type { ReplayLikeClient, ReplayListener } from "./types.js";

export class ReplayController {
  private listeners: Set<ReplayListener> = new Set();
  private timerId: number | null = null;
  private readonly tickMs: number;

  constructor(private readonly client: ReplayLikeClient, options: { tickMs?: number } = {}) {
    this.tickMs = Math.max(16, options.tickMs ?? 250);
  }

  state(): ReplayState {
    return this.client.replayState();
  }

  subscribe(listener: ReplayListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  play(): void {
    this.client.replayPlay();
    this.startLoop();
    this.emit();
  }

  pause(): void {
    this.client.replayPause();
    this.stopLoop();
    this.emit();
  }

  stop(): void {
    this.client.replayStop();
    this.stopLoop();
    this.emit();
  }

  stepBar(): number | null {
    const ts = this.client.replayStepBar();
    this.emit();
    return ts;
  }

  stepEvent(): number | null {
    const ts = this.client.replayStepEvent();
    this.emit();
    return ts;
  }

  seekTs(ts: number): void {
    this.client.replaySeekTs(ts);
    this.emit();
  }

  destroy(): void {
    this.stopLoop();
    this.listeners.clear();
  }

  private startLoop(): void {
    if (this.timerId !== null) return;
    this.timerId = window.setInterval(() => {
      const state = this.client.replayState();
      if (!state.playing) {
        this.stopLoop();
        this.emit();
        return;
      }
      this.client.replayTick();
      this.emit();
    }, this.tickMs);
  }

  private stopLoop(): void {
    if (this.timerId === null) return;
    window.clearInterval(this.timerId);
    this.timerId = null;
  }

  private emit(): void {
    const state = this.client.replayState();
    this.listeners.forEach((listener) => listener(state));
  }
}
