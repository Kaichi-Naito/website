import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RhythmEngine } from './engine.mjs';
import { midiToChart } from './midi.mjs';
const base = JSON.parse(readFileSync(new URL('./rolling-chart.json', import.meta.url)));
const chart = midiToChart(readFileSync(new URL('./charts/Rolling_Game.mid', import.meta.url)), base);
test('chart is a two-minute, playable four-lane arrangement with no overlapping inputs', () => {
  assert.equal(chart.duration, 120);
  assert(chart.notes.length > 70);
  assert(chart.notes.some(n => n.t > 60));
  assert(chart.notes.some(n => n.end));
  const last = [-1,-1,-1,-1];
  for (const n of chart.notes) {
    assert(Number.isFinite(n.t) && n.t >= 0 && n.t < 120);
    assert(Number.isInteger(n.lane) && n.lane >= 0 && n.lane < 4);
    assert(n.t >= last[n.lane] + .02, `unplayable overlap at ${n.t}`);
    if (n.end) assert(n.end > n.t && n.end <= 120);
    last[n.lane] = n.end || n.t;
  }
});
test('perfect full-chart play reaches 1,000,000 with every head and sustained hold resolved', () => {
  const engine = new RhythmEngine(chart);
  const events = chart.notes.flatMap(n => [
    { t: n.t, lane: n.lane, down: true },
    { t: n.end || n.t + .03, lane: n.lane, down: false }
  ]).sort((a,b) => a.t-b.t || Number(a.down)-Number(b.down));
  for (const e of events) engine[e.down ? 'press' : 'release'](e.lane, e.t);
  engine.tick(121);
  assert.equal(engine.score, 1000000);
  assert.equal(engine.counts.MISS, 0);
  assert.equal(engine.counts.PERFECT, engine.units);
  assert.equal(engine.maxCombo, engine.units);
});
test('hands-off play finishes with misses, never a stuck active hold', () => {
  const engine = new RhythmEngine(chart); engine.tick(121);
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
test('holds succeed at 80 percent, regardless of release timing afterward', () => {
  for (const [release, label] of [[1.5,'MISS'],[1.799,'MISS'],[1.8,'PERFECT'],[1.9,'PERFECT'],[2,'PERFECT'],[10,'PERFECT']]) {
    const e = new RhythmEngine({ notes: [{ t: 1, end: 2, lane: 0 }] });
    e.press(0,1); e.release(0,release); e.tick(3);
    assert.equal(e.resolved,2); assert.equal(e.counts[label],label==='MISS'?1:2);
  }
});
test('hold completion is automatic and cannot score twice on release', () => {
  const e = new RhythmEngine({ notes: [{ t: 1, end: 6, lane: 0 }] });
  e.press(0,1); e.tick(4.999); assert.equal(e.resolved,1);
  e.tick(5); assert.equal(e.score,1000000); assert.equal(e.resolved,2);
  e.tick(8); e.release(0,9); assert.equal(e.resolved,2);
});
test('hold duration uses actual press time; early input does not shorten the hold', () => {
  for (const press of [.9,1.1]) {
    const e = new RhythmEngine({ notes: [{ t: 1, end: 3, lane: 0 }] });
    e.press(0,press);
    const completion=Math.max(press,1)+1.6;
    e.tick(completion-.001); assert.equal(e.resolved,1);
    e.tick(completion); assert.equal(e.resolved,2); assert.equal(e.counts.MISS,0);
  }
});
test('releasing too soon cannot be repaired by tapping repeatedly', () => {
  const e = new RhythmEngine({ notes: [{ t: 1, end: 3, lane: 0 }] });
  e.press(0,1); e.release(0,1.1); e.press(0,1.2); e.tick(3);
  assert.equal(e.counts.MISS,1); assert.equal(e.resolved,2);
});
test('a hold without a re-grip after pause cannot earn sustain credit', () => {
  const e = new RhythmEngine({ notes: [{ t: 1, end: 3, lane: 0 }] });
  e.press(0,1); e.tick(1.5); e.held.fill(false); e.tick(1.5);
  assert.equal(e.counts.MISS,1); assert.equal(e.resolved,2);
});
test('simultaneous notes and pause/resume re-grip preserve independent holds', () => {
  const e = new RhythmEngine({ notes: [{ t: 1, end: 3, lane: 0 },{ t: 1,lane: 3 }] });
  e.press(0,1); e.press(3,1); e.release(3,1.03);
  // Pause freezes timeline; re-grip restores the key before resuming the same time.
  e.held.fill(false); e.held[0] = true; e.tick(3);
  assert.equal(e.score,1000000); assert.equal(e.counts.MISS,0);
});

test('empty presses subtract one perfect unit and break the combo without resolving a note', () => {
  const events=[];
  const e=new RhythmEngine({duration:4,notes:[{t:1,lane:0},{t:2,lane:1}]},n=>events.push(n));
  e.press(0,1);e.release(0,1.05);
  assert.equal(e.score,500000);assert.equal(e.combo,1);
  e.press(3,1.2);
  assert.equal(e.score,0);assert.equal(e.accuracy,0);assert.equal(e.combo,0);
  assert.equal(e.resolved,1);assert.equal(e.emptyPresses,1);assert.equal(events.at(-1).label,'EMPTY');
  e.press(1,2);e.release(1,2.05);e.tick(4);
  assert.equal(e.score,500000);assert.equal(e.accuracy,50);
});
test('mashing accumulates penalty debt at zero; held repeats and countdown do not', () => {
  const e=new RhythmEngine({duration:4,notes:[{t:1,lane:0},{t:2,lane:1}]});
  e.press(3,-1);e.release(3,-.9);assert.equal(e.emptyPresses,0);
  e.press(3,.1);e.press(3,.15);assert.equal(e.emptyPresses,1);
  e.release(3,.2);e.press(3,.3);e.release(3,.4);
  e.press(0,1);e.release(0,1.01);e.press(1,2);e.release(1,2.01);
  assert.equal(e.counts.PERFECT,2);assert.equal(e.emptyPresses,2);
  assert.equal(e.score,0);assert.equal(e.accuracy,0);
  e.press(3,4);assert.equal(e.emptyPresses,2);
});
test('empty input on another lane leaves a sustained hold intact', () => {
  const e=new RhythmEngine({duration:5,notes:[{t:1,end:3,lane:0}]});
  e.press(0,1);e.press(1,1.5);e.release(1,1.6);e.tick(2.6);e.release(0,4);
  assert.equal(e.counts.PERFECT,2);assert.equal(e.counts.MISS,0);
  assert.equal(e.emptyPresses,1);assert.equal(e.score,500000);
});
