import { ReplayController } from "./ReplayController.js";
import type { ReplayLikeClient } from "./types.js";

class FakeReplayClient implements ReplayLikeClient {
  private stateValue = { playing: false, cursor_ts: null as number | null };

  replayPlay(): void { this.stateValue.playing = true; }
  replayPause(): void { this.stateValue.playing = false; }
  replayStop(): void { this.stateValue = { playing: false, cursor_ts: null }; }
  replayStepBar(): number | null {
    this.stateValue.cursor_ts = (this.stateValue.cursor_ts ?? 0) + 60;
    return this.stateValue.cursor_ts;
  }
  replayStepEvent(): number | null {
    this.stateValue.cursor_ts = (this.stateValue.cursor_ts ?? 0) + 120;
    return this.stateValue.cursor_ts;
  }
  replaySeekTs(ts: number): void { this.stateValue.cursor_ts = ts; }
  replayTick(): number | null {
    if (!this.stateValue.playing) return this.stateValue.cursor_ts;
    return this.replayStepBar();
  }
  replayState() { return { ...this.stateValue }; }
}

function testReplayControllerBasics() {
  const client = new FakeReplayClient();
  const replay = new ReplayController(client, { tickMs: 100 });

  replay.stepBar();
  if (replay.state().cursor_ts !== 60) throw new Error("stepBar should move cursor by one bar");

  replay.stepEvent();
  if (replay.state().cursor_ts !== 180) throw new Error("stepEvent should move cursor by one event");

  replay.seekTs(999);
  if (replay.state().cursor_ts !== 999) throw new Error("seekTs should set cursor");

  replay.destroy();
}

testReplayControllerBasics();
