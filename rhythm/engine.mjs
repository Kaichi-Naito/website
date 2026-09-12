// All judgment times are seconds on the audio timeline. Rendering never scores notes.
export const WINDOWS = Object.freeze({ perfect: .045, great: .09, good: .14 });
export const HOLD_RATIO = .8;
export class RhythmEngine {
  constructor(chart, onJudge = () => {}) {
    this.notes = chart.notes.map(n => ({ ...n, state: 'pending' }));
    this.onJudge = onJudge;
    this.duration = chart.duration ?? Infinity;
    this.emptyPresses = 0;
    this.held = [false, false, false, false];
    this.counts = { PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 };
    this.combo = 0; this.maxCombo = 0; this.earned = 0; this.resolved = 0;
    this.units = this.notes.reduce((sum, n) => sum + (n.end ? 2 : 1), 0);
    this.lanes = [0, 1, 2, 3].map(lane => this.notes.filter(n => n.lane === lane));
  }
  judge(label, note, delta = 0) {
    this.counts[label]++; this.resolved++;
    this.earned += { PERFECT: 1, GREAT: .8, GOOD: .5, MISS: 0 }[label];
    this.combo = label === 'MISS' ? 0 : this.combo + 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.onJudge({ label, lane: note.lane, delta, combo: this.combo });
  }
  tick(time) {
    for (const n of this.notes) {
      if (n.state === 'pending' && time - n.t > WINDOWS.good) {
        n.state = 'miss'; this.judge('MISS', n);
        if (n.end) this.judge('MISS', n);
      } else if (n.state === 'holding') {
        // Completion measures sustained input, never the timing of key-up.
        if (!this.held[n.lane]) {
          n.state = 'done'; this.judge('MISS', n);
        } else if (time >= n.completeAt - 1e-9) {
          n.state = 'done'; this.judge('PERFECT', n);
        }
      }
    }
  }
  press(lane, time) {
    if (this.held[lane]) return;
    this.tick(time); this.held[lane] = true;
    const n = this.lanes[lane].find(n => n.state === 'pending');
    if (!n || Math.abs(time - n.t) > WINDOWS.good) {
      // Keep penalty debt even at zero score; countdown/repeat inputs are exempt.
      if (time >= 0 && time < this.duration) {
        this.emptyPresses++; this.combo = 0;
        this.onJudge({label:'EMPTY',lane,delta:0,combo:0});
      }
      return;
    }
    const delta = time - n.t;
    const label = Math.abs(delta) <= WINDOWS.perfect ? 'PERFECT' : Math.abs(delta) <= WINDOWS.great ? 'GREAT' : 'GOOD';
    n.state = n.end ? 'holding' : 'done';
    if (n.end) n.completeAt = Math.max(time, n.t) + (n.end - n.t) * HOLD_RATIO;
    this.judge(label, n, delta);
  }
  release(lane, time) {
    this.tick(time); this.held[lane] = false;
    const n = this.lanes[lane].find(n => n.state === 'holding');
    if (!n) return;
    n.state = 'done';
    this.judge('MISS', n);
  }
  get weightedHits() { return this.counts.PERFECT + this.counts.GREAT * .8 + this.counts.GOOD * .5; }
  get netHits() { return Math.max(0, this.weightedHits - this.emptyPresses); }
  get score() { return this.units ? Math.round(this.netHits / this.units * 1000000) : 0; }
  get accuracy() { return this.resolved ? this.netHits / this.resolved * 100 : this.emptyPresses ? 0 : 100; }
}
