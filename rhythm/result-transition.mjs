// Result controls appear only after the animation and the last input settle.
export class ResultTransition {
  constructor({duration = 1100, quietTime = 350} = {}) {
    this.duration = duration; this.quietTime = quietTime; this.cancel();
  }
  cancel() { this.pending = false; this.held = new Set(); this.lastInput = -Infinity; }
  press(id, now) { this.held.add(id); this.lastInput = now; }
  release(id, now) { if (this.held.delete(id)) this.lastInput = now; }
  releaseAll(now) { this.held.clear(); this.lastInput = now; }
  begin(now) { this.pending = true; this.started = now; }
  progress(now) { return Math.min(1, Math.max(0, (now - this.started) / this.duration)); }
  ready(now) {
    return this.pending && this.progress(now) === 1 && !this.held.size && now - this.lastInput >= this.quietTime;
  }
}
