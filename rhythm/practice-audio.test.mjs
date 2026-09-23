import test from 'node:test';
import assert from 'node:assert/strict';
import {PracticeAudio} from './practice-audio.mjs';
import {render} from './testing/stretch-render.mjs';
function fixture(){
 const events=[];
 const context={currentTime:10,audioWorklet:{},createGain:()=>({gain:{setValueAtTime:(...v)=>events.push(['gain',...v]),cancelScheduledValues:t=>events.push(['cancel',t])},connect(){},disconnect(){}})};
 const node={context,connect(){},disconnect(){},stop:async()=>events.push(['stop']),dropBuffers:async()=>events.push(['drop']),addBuffers:async(channels)=>{assert.notEqual(channels[0],buffer.getChannelData(0));events.push(['load']);},schedule:async spec=>events.push(['schedule',spec]),port:{close:()=>events.push(['close'])}};
 const samples=new Float32Array(100),buffer={numberOfChannels:1,getChannelData:()=>samples};
 return {context,node,buffer,events};
}
test('stretch reuses decoded samples, schedules exact wall-time end, stops and releases',async()=>{
 const {context,node,buffer,events}=fixture();let creates=0;
 const audio=new PracticeAudio(()=>{},async()=>{creates++;return node;});
 await audio.prepare(context,buffer);await audio.prepare(context,buffer);assert.equal(creates,1);
 const source=audio.schedule({}, {when:12,offset:5,duration:10,rate:.1});
 assert.deepEqual(events.find(e=>e[0]==='schedule')[1],{active:true,output:12,input:5,rate:.1,semitones:0});
 assert.ok(events.some(e=>e[0]==='gain'&&e[1]===0&&e[2]===112));
 source.stop();source.stop();source.disconnect();assert.equal(events.filter(e=>e[0]==='stop').length,1);
 audio.release();await Promise.resolve();assert.equal(audio.node,null);assert.ok(events.some(e=>e[0]==='drop'));
});
test('leaving while WASM is loading cannot restore a stale node',async()=>{
 const {context,node,buffer,events}=fixture();let finish;
 const audio=new PracticeAudio(()=>{},()=>new Promise(r=>finish=r));
 const pending=audio.prepare(context,buffer);audio.release();finish(node);
 await assert.rejects(pending,/中止/);assert.equal(audio.node,null);assert.ok(events.some(e=>e[0]==='drop'));
});
test('actual WASM keeps stereo pitch and transient timing at every slow rate and sample rate',async()=>{
 for(const sr of [44100,48000])for(const rate of [.1,.2,.3,.4,.5,.6,.7,.8,.9]){
  const output=await render({sr,rate,signal:(t,c)=>.3*Math.sin(2*Math.PI*(c?660:440)*t)});
  for(const [c,target] of [440,660].entries()){
   const a=output[c],crosses=[];
   for(let i=Math.ceil(1.5*sr);i<Math.min(a.length,3*sr);i++)if(a[i-1]<0&&a[i]>=0)crosses.push(i-a[i]/(a[i]-a[i-1]));
   const hz=(crosses.length-1)*sr/(crosses.at(-1)-crosses[0]);
   const cents=1200*Math.log2(hz/target);
   assert.ok(Math.abs(cents)<12,`${sr}Hz ${rate}x channel ${c}: ${hz}Hz / ${cents} cents`);
   assert.ok(a.every(Number.isFinite));
  }
  // A short pitched percussion pulse must remain aligned with its chart timestamp.
  const hit=await render({sr,rate,signal:t=>.5*Math.exp(-(((t-.7)/.004)**2))*Math.sin(2*Math.PI*1800*t)});
  let peak=0;for(let i=1;i<hit[0].length;i++)if(Math.abs(hit[0][i])>Math.abs(hit[0][peak]))peak=i;
  assert.ok(Math.abs(peak/sr-(1+.7/rate))<.03,`${sr}Hz ${rate}x transient timing`);
 }
});
test('actual WASM resumes from a source offset with compensated output timing',async()=>{
 const sr=48000,rate=.1,offset=.5;
 const hit=await render({sr,rate,offset,signal:t=>.5*Math.exp(-(((t-.7)/.004)**2))*Math.sin(2*Math.PI*1800*t)});
 let peak=0;for(let i=1;i<hit[0].length;i++)if(Math.abs(hit[0][i])>Math.abs(hit[0][peak]))peak=i;
 assert.ok(Math.abs(peak/sr-(1+(.7-offset)/rate))<.03);
});
