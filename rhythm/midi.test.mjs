import test from 'node:test';
import assert from 'node:assert/strict';
import { midiToChart } from './midi.mjs';
const base={id:'test',title:'Rolling',artist:'PHALUX',bpm:162,duration:60,audio:'rhythm/rolling.mp3'};
const vlq=n=>{const a=[n&127];while(n>>=7)a.unshift((n&127)|128);return a;};
const be=(n,len)=>Array.from({length:len},(_,i)=>(n>>((len-1-i)*8))&255);
const event=(tick,bytes)=>({tick,bytes});
const on=(tick,n,ch=0)=>event(tick,[144+ch,n,100]);
const off=(tick,n,ch=0)=>event(tick,[128+ch,n,0]);
const tempo=(tick,us)=>event(tick,[255,81,3,...be(us,3)]);
function smf(tracks,format=tracks.length>1?1:0){
  const body=tracks.flatMap(events=>{let prev=0;const bytes=events.sort((a,b)=>a.tick-b.tick).flatMap(e=>{const d=e.tick-prev;prev=e.tick;return [...vlq(d),...e.bytes];});bytes.push(0,255,47,0);return [...Buffer.from('MTrk'),...be(bytes.length,4),...bytes];});
  return Uint8Array.from([...Buffer.from('MThd'),0,0,0,6,...be(format,2),...be(tracks.length,2),1,224,...body]);
}
test('C D E F map to Q W E R; short notes tap, quarter+ holds; leading rest stays intact',()=>{
  const c=midiToChart(smf([[tempo(0,500000),on(960,60),off(1080,60),on(1440,62),off(1920,62),on(1920,64),on(1920,65),off(1980,64),off(1980,65)]]),base);
  assert.deepEqual(c.notes,[{t:1,lane:0},{t:1.5,lane:1,end:2},{t:2,lane:2},{t:2,lane:3}]);
  assert.equal(c.bpm,120);assert.equal(c.midi.tempoFallback,false);
});
test('type 1 tempo map including a change during a hold yields exact seconds',()=>{
  const c=midiToChart(smf([[tempo(0,500000),tempo(960,1000000)],[on(480,60,4),off(1440,60,4)]]),base);
  assert.deepEqual(c.notes,[{t:.5,lane:0,end:2}]);
});
test('running status and zero-velocity note-on releases are understood',()=>{
  const c=midiToChart(smf([[tempo(0,500000),on(0,60),event(120,[60,0]),event(480,[62,100]),event(960,[62,0])]]),base);
  assert.deepEqual(c.notes,[{t:0,lane:0},{t:.5,lane:1,end:1}]);
});
test('missing tempo uses song BPM and reports fallback',()=>{
  const c=midiToChart(smf([[on(960,60),off(1080,60)]]),base);
  assert(Math.abs(c.notes[0].t-120/162)<1e-10);assert.equal(c.midi.tempoFallback,true);
});
test('one-minute scope clips tails, omits later starts, and reports unused pitches',()=>{
  const c=midiToChart(smf([[tempo(0,500000),on(0,70),off(120,70),on(57120,65),off(58080,65),on(58080,60),off(58200,60)]]),base);
  assert.deepEqual(c.notes,[{t:59.5,lane:3,end:60}]);assert.equal(c.midi.clipped,2);assert.equal(c.midi.ignored,1);
});
test('rejects broken data, unmatched holds, and same-lane overlaps without modifying base',()=>{
  assert.throws(()=>midiToChart(new Uint8Array([1,2]),base));
  assert.throws(()=>midiToChart(smf([[on(0,60)]]),base),/終わり/);
  assert.throws(()=>midiToChart(smf([[on(0,60),on(100,60),off(200,60)]]),base),/重な/);
  assert.throws(()=>midiToChart(smf([[on(0,60,0),on(10,60,1),off(480,60,0),off(500,60,1)]]),base),/重な/);
  assert.throws(()=>midiToChart(smf([[on(0,60),off(10,60)]],2),base),/Type/);
  assert.equal(base.id,'test');
});
