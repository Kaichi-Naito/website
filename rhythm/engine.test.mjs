import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {RhythmEngine} from './engine.mjs';
import {midiToChart} from './midi.mjs';
const base=JSON.parse(readFileSync(new URL('./rolling-chart.json',import.meta.url)));
const chart=midiToChart(readFileSync(new URL('./charts/Rolling_Game.mid',import.meta.url)),base);
const hold=()=>new RhythmEngine({duration:6,bpm:60,notes:[{t:1,end:5,lane:0}]});
test('the actual two-minute MIDI has playable lanes, tempo-aware ticks, and notes after one minute',()=>{
  assert.equal(chart.duration,120);assert(chart.notes.some(n=>n.t>60));
  const last=[-1,-1,-1,-1];
  for(const n of chart.notes){assert(n.t>=0&&n.t<120);assert(n.t>=last[n.lane]+.02);last[n.lane]=n.end??n.t;if(n.end){assert(n.end<=120);assert(n.ticks.length>0);assert(n.ticks.every(t=>t>n.t&&t<=n.end));}}
});
test('perfect full-chart play resolves every beat and scores one million',()=>{
  const e=new RhythmEngine(chart);
  const events=chart.notes.flatMap(n=>[{t:n.t,lane:n.lane,down:true},{t:n.end??n.t+.01,lane:n.lane,down:false}]).sort((a,b)=>a.t-b.t||Number(a.down)-Number(b.down));
  for(const event of events)e[event.down?'press':'release'](event.lane,event.t);
  e.tick(121);assert.equal(e.score,1000000);assert.equal(e.counts.PERFECT,e.units);assert.equal(e.counts.MISS,0);assert.equal(e.emptyPresses,0);
});
test('hands-off play resolves all head and beat units as misses',()=>{const e=new RhythmEngine(chart);e.tick(121);assert.equal(e.resolved,e.units);assert.equal(e.score,0);assert.equal(e.counts.MISS,e.units);});
test('a four-beat hold earns one head and four separate sustain judgments',()=>{
  const e=hold();e.press(0,1);assert.equal(e.units,5);
  for(let beat=0;beat<4;beat++){e.tick(1.799+beat);assert.equal(e.resolved,beat+1);e.tick(1.8+beat);assert.equal(e.resolved,beat+2);}
  e.release(0,4.81);e.tick(6);assert.equal(e.score,1000000);assert.equal(e.counts.MISS,0);
});
test('key-up has no timing judgment after the final beat is sufficiently held',()=>{
  for(const release of [4.8,4.9,5,20]){const e=hold();e.press(0,1);e.release(0,release);e.tick(21);assert.equal(e.score,1000000);assert.equal(e.resolved,5);}
});
test('early release loses only insufficient beats and re-grip recovers later beats',()=>{
  const e=hold();e.press(0,1);e.release(0,1.1);e.tick(2);assert.equal(e.counts.MISS,1);
  e.press(0,2);e.tick(4.8);assert.equal(e.counts.PERFECT,4);assert.equal(e.resolved,5);assert.equal(e.emptyPresses,0);assert.equal(e.score,800000);
});
test('brief re-grips are accumulated within the beat; repeated quick taps cannot substitute for holding',()=>{
  const brief=new RhythmEngine({bpm:60,notes:[{t:1,end:2,lane:0}]});brief.press(0,1);brief.release(0,1.4);brief.press(0,1.5);brief.release(0,1.9);brief.tick(3);assert.equal(brief.score,1000000);
  const taps=hold();taps.press(0,1);taps.release(0,1.02);
  for(let t=1.2;t<5;t+=.2){taps.press(0,t);taps.release(0,t+.02);}taps.tick(6);assert.equal(taps.counts.PERFECT,1);assert.equal(taps.counts.MISS,4);
});
test('early input is not counted before the hold starts; valid late heads can sustain',()=>{
  const e=new RhythmEngine({bpm:120,notes:[{t:1,end:2,lane:0}]});e.press(0,.9);e.tick(1.399);assert.equal(e.resolved,1);e.tick(1.4);assert.equal(e.resolved,2);
  const late=new RhythmEngine({bpm:162,notes:[{t:1,end:1+60/162,lane:0}]});late.press(0,1.1);late.tick(2);assert.equal(late.counts.MISS,0);assert.equal(late.resolved,2);
});
test('irregular MIDI tempo beat intervals use their actual lengths',()=>{
  const e=new RhythmEngine({notes:[{t:.5,end:2,lane:0,ticks:[1,2]}]});e.press(0,.5);e.tick(.9);assert.equal(e.resolved,2);e.tick(1.799);assert.equal(e.resolved,2);e.tick(1.8);assert.equal(e.score,1000000);
});
test('pause and re-grip never credit time spent paused or create empty penalties',()=>{
  const e=hold();e.press(0,1);e.tick(1.4);e.held.fill(false);e.held[0]=true;e.tick(1.4);assert.equal(e.resolved,1);e.tick(1.8);assert.equal(e.resolved,2);assert.equal(e.emptyPresses,0);
  e.held.fill(false);e.tick(3);assert.equal(e.counts.MISS,1);
});
test('empty taps subtract one perfect unit, break combo, and retain debt at zero',()=>{
  const e=new RhythmEngine({duration:4,notes:[{t:1,lane:0},{t:2,lane:1}]});
  e.press(3,-1);e.release(3,-.9);assert.equal(e.emptyPresses,0);
  e.press(3,.1);e.press(3,.15);assert.equal(e.emptyPresses,1);e.release(3,.2);
  e.press(0,1);e.release(0,1.01);assert.equal(e.score,0);
  e.press(1,2);e.release(1,2.01);assert.equal(e.score,500000);assert.equal(e.accuracy,50);
  e.press(3,2.2);assert.equal(e.combo,0);assert.equal(e.resolved,2);assert.equal(e.score,0);e.release(3,2.3);e.press(3,4);assert.equal(e.emptyPresses,2);
});
test('simultaneous notes and holds remain independent',()=>{
  const e=new RhythmEngine({bpm:60,notes:[{t:1,end:3,lane:0},{t:1,lane:1}]});e.press(0,1);e.press(1,1);e.release(1,1.01);e.tick(2.8);e.release(0,3);assert.equal(e.score,1000000);assert.equal(e.units,4);
});
