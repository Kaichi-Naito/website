import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RhythmEngine } from './engine.mjs';
const chart = JSON.parse(readFileSync(new URL('./rolling-chart.json', import.meta.url)));
test('chart is a one-minute, playable four-lane arrangement with no overlapping inputs', () => {
  assert.equal(chart.duration, 60);
  assert(chart.notes.length > 70);
  assert(chart.notes.some(n => n.end));
  const last = [-1,-1,-1,-1];
  for (const n of chart.notes) {
    assert(Number.isFinite(n.t) && n.t >= 0 && n.t < 59.6);
    assert(Number.isInteger(n.lane) && n.lane >= 0 && n.lane < 4);
    assert(n.t > last[n.lane] + .05, `unplayable overlap at ${n.t}`);
    if (n.end) assert(n.end > n.t && n.end < 59.6);
    last[n.lane] = n.end || n.t;
  }
});
test('perfect full-chart play reaches 1,000,000 with every head and hold tail resolved', () => {
  const engine = new RhythmEngine(chart);
  const events = chart.notes.flatMap(n => [
    { t: n.t, lane: n.lane, down: true },
    { t: n.end || n.t + .03, lane: n.lane, down: false }
  ]).sort((a,b) => a.t-b.t || Number(a.down)-Number(b.down));
  for (const e of events) engine[e.down ? 'press' : 'release'](e.lane, e.t);
  engine.tick(61);
  assert.equal(engine.score, 1000000);
  assert.equal(engine.counts.MISS, 0);
  assert.equal(engine.counts.PERFECT, engine.units);
  assert.equal(engine.maxCombo, engine.units);
});
test('hands-off play finishes with misses, never a stuck active hold', () => {
  const engine = new RhythmEngine(chart); engine.tick(61);
  assert.equal(engine.resolved, engine.units); assert.equal(engine.score, 0);
  assert.equal(engine.counts.MISS, engine.units);
});
test('wrong keys, auto-repeat and presses outside the window cannot score', () => {
  const e = new RhythmEngine({ notes: [{ t: 1, lane: 0 }, { t: 1.4, lane: 0 }] });
  e.press(1,1); assert.equal(e.resolved,0);
  e.press(0,.7); e.press(0,1); assert.equal(e.resolved,0);
  e.release(0,1.05); e.press(0,1.06); assert.equal(e.counts.GREAT,1);
  e.press(0,1.4); assert.equal(e.resolved,1);
  e.release(0,1.4); e.tick(2); assert.equal(e.counts.MISS,1);
});
test('early hold release misses the tail; a release inside tail grace succeeds', () => {
  for (const [release, label] of [[1.5,'MISS'],[1.95,'PERFECT']]) {
    const e = new RhythmEngine({ notes: [{ t: 1, end: 2, lane: 0 }] });
    e.press(0,1); e.release(0,release); e.tick(3);
    assert.equal(e.resolved,2); assert.equal(e.counts[label],label==='MISS'?1:2);
  }
});
test('simultaneous notes and pause/resume re-grip preserve independent holds', () => {
  const e = new RhythmEngine({ notes: [{ t: 1, end: 3, lane: 0 },{ t: 1,lane: 3 }] });
  e.press(0,1); e.press(3,1); e.release(3,1.03);
  // Pause freezes timeline; re-grip restores the key before resuming the same time.
  e.held.fill(false); e.held[0] = true; e.tick(3);
  assert.equal(e.score,1000000); assert.equal(e.counts.MISS,0);
});
