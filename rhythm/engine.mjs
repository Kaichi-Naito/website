// Judgment is driven by the audio clock. A hold earns one unit per MIDI quarter beat.
export const WINDOWS = Object.freeze({ perfect: .045, great: .09, good: .14 });
export const HOLD_RATIO = .8;
export function holdTicks(note, bpm = 120) {
  if (!note.end) return [];
  if (note.ticks) return note.ticks;
  const beat = 60 / bpm, count = Math.floor((note.end - note.t) / beat + 1e-8);
  return count ? Array.from({length:count},(_,i)=>note.t+(i+1)*beat) : [note.end];
}
export class RhythmEngine {
  constructor(chart, onJudge = () => {}) {
    this.notes = chart.notes.map(n => {
      let start=n.t;
      const segments=holdTicks(n,chart.bpm).map(end=>{const s={start,end,held:0,done:false};start=end;return s;});
      return {...n,state:'pending',segments,lastSample:n.t};
    });
    this.onJudge=onJudge;this.duration=chart.duration??Infinity;
    this.held=[false,false,false,false];this.emptyPresses=0;
    this.counts={PERFECT:0,GREAT:0,GOOD:0,MISS:0};
    this.combo=0;this.maxCombo=0;this.resolved=0;
    this.units=this.notes.reduce((sum,n)=>sum+1+n.segments.length,0);
    this.lanes=[0,1,2,3].map(lane=>this.notes.filter(n=>n.lane===lane));
  }
  judge(label,note,delta=0,sustain=false) {
    this.counts[label]++;this.resolved++;
    this.combo=label==='MISS'?0:this.combo+1;this.maxCombo=Math.max(this.maxCombo,this.combo);
    this.onJudge({label,lane:note.lane,delta,combo:this.combo,sustain});
  }
  tick(time) {
    for(const n of this.notes) {
      if(n.state==='pending' && time-n.t>WINDOWS.good) {
        n.state='miss';this.judge('MISS',n);
        for(const s of n.segments){s.done=true;this.judge('MISS',n,0,true);}
      } else if(n.state==='holding') {
        for(const s of n.segments) {
          if(s.done)continue;
          if(this.held[n.lane])s.held+=Math.max(0,Math.min(time,s.end)-Math.max(n.lastSample,s.start,n.headTime));
          // Judge time held within each beat, never the instant of release.
          // The first beat tolerates a valid late head without shortening later beats.
          const available=Math.max(0,s.end-Math.max(s.start,n.headTime));
          const required=Math.min((s.end-s.start)*HOLD_RATIO,available);
          if(available>0 && s.held>=required-1e-9){s.done=true;this.judge('PERFECT',n,0,true);}
          else if(time>=s.end){s.done=true;this.judge('MISS',n,0,true);}
        }
        n.lastSample=Math.max(n.lastSample,time);
        if(n.segments.every(s=>s.done))n.state='done';
      }
    }
  }
  press(lane,time) {
    if(this.held[lane])return;
    this.tick(time);this.held[lane]=true;
    // Re-gripping an unfinished hold is valid, even after missing a beat.
    if(this.lanes[lane].some(n=>n.state==='holding'))return;
    const n=this.lanes[lane].find(n=>n.state==='pending');
    if(!n||Math.abs(time-n.t)>WINDOWS.good) {
      if(time>=0&&time<this.duration){this.emptyPresses++;this.combo=0;this.onJudge({label:'EMPTY',lane,delta:0,combo:0});}
      return;
    }
    const delta=time-n.t;
    const label=Math.abs(delta)<=WINDOWS.perfect?'PERFECT':Math.abs(delta)<=WINDOWS.great?'GREAT':'GOOD';
    n.state=n.segments.length?'holding':'done';n.headTime=Math.max(time,n.t);n.lastSample=time;
    this.judge(label,n,delta);
  }
  release(lane,time) {this.tick(time);this.held[lane]=false;}
  get weightedHits(){return this.counts.PERFECT+this.counts.GREAT*.8+this.counts.GOOD*.5;}
  get netHits(){return Math.max(0,this.weightedHits-this.emptyPresses);}
  get score(){return this.units?Math.round(this.netHits/this.units*1000000):0;}
  get accuracy(){return this.resolved?this.netHits/this.resolved*100:this.emptyPresses?0:100;}
}
