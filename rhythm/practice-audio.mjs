const failureMessage='音程補正の処理に失敗しました。最初からやり直してください。';
async function createStretch(context) {
  const {default:create}=await import('./vendor/signalsmith-stretch-1.3.2/SignalsmithStretch.mjs');
  create.moduleUrl=new URL('./vendor/signalsmith-stretch-1.3.2/SignalsmithStretch.mjs',import.meta.url).href;
  // An unconnected input selects the library's sample-buffer playback path.
  return create(context,{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2]});
}
const disposed=new WeakSet();
function dispose(node) {
  if(!node||disposed.has(node))return;
  disposed.add(node);
  node.onprocessorerror=null;node.disconnect();
  void node.stop();
  // Return transferred samples before closing the port, including on cancellation.
  void node.dropBuffers().finally(()=>node.port.close());
}
export class PracticeAudio {
  constructor(onError=()=>{},create=createStretch) {
    this.onError=onError;this.create=create;this.node=null;this.buffer=null;this.pending=null;this.serial=0;
  }
  async prepare(context,buffer) {
    if(this.node&&this.buffer===buffer)return;
    if(this.pending?.buffer===buffer)return this.pending.promise;
    this.release();
    if(!context.audioWorklet)throw new Error('このブラウザーは音程を保つ練習再生に対応していません。ブラウザーを更新してください。');
    const serial=this.serial;
    let candidate,timer;
    const active=()=>serial===this.serial;
    const work=(async()=>{
      candidate=await this.create(context);
      if(!active()){dispose(candidate);throw new Error('音源の準備を中止しました。');}
      candidate.onprocessorerror=()=>{
        if(!active())return;
        this.release();this.onError(new Error(failureMessage));
      };
      const channels=Array.from({length:Math.min(2,buffer.numberOfChannels)},(_,i)=>new Float32Array(buffer.getChannelData(i)));
      await candidate.addBuffers(channels,channels.map(c=>c.buffer));
      if(!active()){dispose(candidate);throw new Error('音源の準備を中止しました。');}
      this.node=candidate;this.buffer=buffer;
    })();
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(failureMessage)),15000);});
    const promise=Promise.race([work,timeout]).catch(error=>{
      if(active()){this.release();if(candidate&&candidate!==this.node)dispose(candidate);}
      throw error;
    }).finally(()=>{clearTimeout(timer);if(this.pending?.promise===promise)this.pending=null;});
    this.pending={buffer,promise};
    return promise;
  }
  schedule(destination,{when,offset,duration,rate}) {
    if(!this.node||!this.buffer)throw new Error('練習音源を準備できませんでした。');
    const node=this.node,context=node.context,gate=context.createGain();
    gate.gain.setValueAtTime(0,context.currentTime);
    gate.gain.setValueAtTime(1,when);
    gate.gain.setValueAtTime(0,when+duration/rate);
    node.connect(gate);gate.connect(destination);
    // Buffer scheduling includes the DSP's input/output latency compensation.
    // A native gain gate ends playback exactly without replacing the pending start.
    void node.schedule({active:true,output:when,input:offset,rate,semitones:0});
    let stopped=false;
    return {
      stop(){if(stopped)return;stopped=true;gate.gain.cancelScheduledValues(0);gate.gain.setValueAtTime(0,context.currentTime);void node.stop();},
      disconnect(){try{node.disconnect(gate);}catch{}gate.disconnect();}
    };
  }
  release() {
    ++this.serial;dispose(this.node);this.node=null;this.buffer=null;this.pending=null;
  }
}
