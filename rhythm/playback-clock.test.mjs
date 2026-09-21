import test from 'node:test';
import assert from 'node:assert/strict';
import { PlaybackClock } from './playback-clock.mjs';

function setup(from=13) {
  const clock = new PlaybackClock();
  clock.reset({from, currentTime:100, resumeAt:102, startAt:102-from});
  const audio = {currentTime:102, outputLatency:.05};
  return {clock,audio};
}

test('abnormal latency cannot reproduce the 32 second countdown with a mid-song score',()=>{
  const {clock,audio}=setup();
  audio.outputLatency=45;
  // The previous calculation actually rewinds this resumed run to -32 seconds.
  assert.equal(audio.currentTime-audio.outputLatency-(102-13),-32);
  const state=clock.read(audio,1000);
  assert.equal(state.time,13);assert.equal(state.countdown,0);
  audio.currentTime=103;assert.equal(clock.read(audio,2000).time,14);
});

test('normal output latency and hardware timestamps still correct judgment time',()=>{
  const {clock,audio}=setup();audio.currentTime=103;
  assert.ok(Math.abs(clock.read(audio,2000).time-13.95)<1e-9);
  audio.getOutputTimestamp=()=>({contextTime:102.87,performanceTime:1990});
  assert.ok(Math.abs(clock.read(audio,2100).time-13.98)<1e-9);
});

test('stale, future, invalid, empty and throwing timestamps use valid fallback latency',()=>{
  for(const timestamp of [()=>({contextTime:102.4,performanceTime:1000}),
    ()=>({contextTime:103,performanceTime:2300}),()=>({contextTime:NaN,performanceTime:2000}),
    ()=>({contextTime:0,performanceTime:0}),()=>{throw new Error('interrupted');}]) {
    const {clock,audio}=setup();audio.currentTime=103;audio.getOutputTimestamp=timestamp;
    assert.ok(Math.abs(clock.read(audio,2000).time-13.95)<1e-9);
  }
});

test('invalid latency retains the last good correction and never creates NaN positions',()=>{
  for(const value of [45,-1,NaN,Infinity,undefined]) {
    const {clock,audio}=setup();audio.currentTime=103;clock.read(audio,2000);
    audio.outputLatency=value;audio.currentTime=104;
    assert.ok(Math.abs(clock.read(audio,3000).time-14.95)<1e-9);
  }
});

test('latency changes cannot rewind already judged notes',()=>{
  const {clock,audio}=setup();audio.currentTime=103;
  const before=clock.read(audio,2000).time;
  audio.currentTime=103.01;audio.outputLatency=.4;
  assert.equal(clock.read(audio,2010).time,before);
  audio.currentTime=104;assert.ok(clock.read(audio,3000).time>before);
});

test('resume holds position for two seconds and repeated pauses preserve it',()=>{
  const {clock,audio}=setup();
  for(const [current,countdown] of [[100,2],[100.9,2],[101.2,1]]) {
    audio.currentTime=current;const state=clock.read(audio,1000);
    assert.equal(state.time,13);assert.equal(state.waiting,true);assert.equal(state.countdown,countdown);
  }
  audio.currentTime=102;assert.equal(clock.read(audio,3000).waiting,false);
  audio.currentTime=103;const position=clock.read(audio,4000).time;
  clock.reset({from:position,currentTime:103,resumeAt:105,startAt:105-position});
  audio.currentTime=104;assert.equal(clock.read(audio,5000).time,position);
  audio.currentTime=106;assert.ok(clock.read(audio,7000).time>position);
});

test('audio clock reset latches an interruption instead of a long countdown; resume recovers',()=>{
  const {clock,audio}=setup();audio.currentTime=103;
  const before=clock.read(audio,2000).time;
  audio.currentTime=0;const state=clock.read(audio,2100);
  assert.equal(state.interrupted,true);assert.equal(state.time,before);assert.equal(state.countdown,0);
  audio.currentTime=104;assert.equal(clock.read(audio,2200).interrupted,true);
  clock.reset({from:before,currentTime:104,resumeAt:106,startAt:106-before});
  assert.equal(clock.read(audio,2200).countdown,2);
  audio.currentTime=107;assert.equal(clock.read(audio,5200).interrupted,false);
});

test('non-finite audio clock stops safely at the last valid position',()=>{
  const {clock,audio}=setup();audio.currentTime=103;const before=clock.read(audio,2000).time;
  audio.currentTime=NaN;assert.deepEqual(clock.read(audio,2100),{time:before,waiting:false,countdown:0,interrupted:true});
});

test('new game resets position and uses the ordinary three second opening countdown',()=>{
  const {clock,audio}=setup();audio.currentTime=103;clock.read(audio,2000);
  clock.reset({from:-2.5,currentTime:103,startAt:105.6,resumeAt:103.1});
  assert.equal(clock.read(audio,2000).countdown,3);
  audio.currentTime=104;assert.equal(clock.read(audio,3000).countdown,2);
  audio.currentTime=105;assert.equal(clock.read(audio,4000).countdown,1);
  audio.currentTime=106;assert.equal(clock.read(audio,5000).countdown,0);
  audio.currentTime=136;assert.ok(clock.read(audio,35000).time>=30.2);
});
