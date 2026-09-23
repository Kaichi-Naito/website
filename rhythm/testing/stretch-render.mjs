import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../vendor/signalsmith-stretch-1.3.2/SignalsmithStretch.mjs',import.meta.url),'utf8').replace('export default _export;','');
export async function render({sr=48000,rate=.5,offset=0,duration=2,signal}){
 let Processor,ready;
 const readyPromise=new Promise(r=>ready=r);
 const env=vm.createContext({sampleRate:sr,currentTime:0,currentFrame:0,console,WebAssembly,atob,TextDecoder,TextEncoder,setTimeout,clearTimeout,AudioWorkletProcessor:class {constructor(){this.port={postMessage(data){if(data[0]==='ready')ready();}};}},registerProcessor:(name,P)=>Processor=P});
 vm.runInContext(code,env);
 const p=new Processor({numberOfOutputs:1,outputChannelCount:[2]});await readyPromise;
 const channels=[0,1].map(c=>Float32Array.from({length:Math.ceil(duration*sr)},(_,i)=>signal(i/sr,c)));
 p.port.onmessage({data:[0,'addBuffers',channels]});
 p.port.onmessage({data:[1,'schedule',{active:true,output:1,input:offset,rate,semitones:0}]});
 const count=Math.ceil((1+(duration-offset)/rate)*sr/128)*128;
 const output=[new Float32Array(count),new Float32Array(count)];
 for(let i=0;i<count;i+=128){env.currentTime=i/sr;env.currentFrame=i;const b=[new Float32Array(128),new Float32Array(128)];p.process([[]],[b],{});b.forEach((v,c)=>output[c].set(v,i));}
 return output;
}
