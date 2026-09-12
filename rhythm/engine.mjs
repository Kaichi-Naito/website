// All judgment times are seconds on the audio timeline. Rendering never scores notes.
export const WINDOWS = Object.freeze({ perfect: .045, great: .09, good: .14, release: .10 });
export class RhythmEngine {
  constructor(chart, onJudge = () => {}) {
    this.notes = chart.notes.map(n => ({ ...n, state: 'pending' }));
    this.onJudge = onJudge;
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
      } else if (n.state === 'holding' && time >= n.end) {
        n.state = 'done'; this.judge(this.held[n.lane] ? 'PERFECT' : 'MISS', n);
      }
    }
  }
  press(lane, time) {
    if (this.held[lane]) return;
    this.tick(time); this.held[lane] = true;
    const n = this.lanes[lane].find(n => n.state === 'pending');
    if (!n || Math.abs(time - n.t) > WINDOWS.good) return;
    const delta = time - n.t;
    const label = Math.abs(delta) <= WINDOWS.perfect ? 'PERFECT' : Math.abs(delta) <= WINDOWS.great ? 'GREAT' : 'GOOD';
    n.state = n.end ? 'holding' : 'done'; this.judge(label, n, delta);
  }
  release(lane, time) {
    this.tick(time); this.held[lane] = false;
    const n = this.lanes[lane].find(n => n.state === 'holding');
    if (!n) return;
    n.state = 'done';
    this.judge(time >= n.end - WINDOWS.release ? 'PERFECT' : 'MISS', n, time - n.end);
  }
  get score() { return Math.round(this.earned / this.units * 1000000); }
  get accuracy() { return this.resolved ? this.earned / this.resolved * 100 : 100; }
}
