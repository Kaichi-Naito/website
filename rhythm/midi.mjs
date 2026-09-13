// Standard MIDI Files (type 0/1, PPQ timing); tempo changes from every track are merged.
export const MIDI_LANES = Object.freeze([75, 74, 73, 72]);
export const HOLD_BEATS = 1; // One quarter note or longer is a hold; shorter notes are taps.
export function midiToChart(input, base) {
  const data = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (data.length > 2 * 1024 * 1024) throw new Error('MIDIは2 MB以下にしてください。');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let p = 0, end = data.length;
  const fail = () => { throw new Error('MIDIファイルが壊れているか、対応していない形式です。'); };
  const need = n => { if (p + n > end) fail(); };
  const u8 = () => { need(1); return data[p++]; };
  const u16 = () => { need(2); const n = view.getUint16(p); p += 2; return n; };
  const u32 = () => { need(4); const n = view.getUint32(p); p += 4; return n; };
  const tag = () => String.fromCharCode(u8(),u8(),u8(),u8());
  const vlq = () => { let value=0; for(let i=0;i<4;i++){const b=u8();value=value*128+(b&127);if(!(b&128))return value;} fail(); };
  if (tag() !== 'MThd') fail();
  const headerLength = u32(); if(headerLength < 6) fail(); need(headerLength);
  const headerEnd = p + headerLength, format=u16(), tracks=u16(), ppq=u16();
  if (format > 1) throw new Error('MIDIはType 0またはType 1で書き出してください。');
  if (!ppq || ppq & 0x8000) throw new Error('SMPTE形式ではなく、拍ベースのMIDIで書き出してください。');
  if (!tracks || tracks > 256) fail();
  p = headerEnd;
  const tempos = [], pairs = []; let ignored = 0, tempoOrder = 0;
  for(let tr=0;tr<tracks;tr++) {
    end=data.length; if(tag()!=='MTrk')fail(); const size=u32();need(size);end=p+size;
    let tick=0, running=0; const active = new Map();
    while(p<end) {
      tick += vlq(); if (!Number.isSafeInteger(tick)) fail();
      let status=u8();
      if(status<128){if(!running)fail();p--;status=running;}
      else if(status<240)running=status;
      else running=0;
      if(status===255) {
        const type=u8(), length=vlq();need(length);
        if(type===81){if(length!==3)fail();const us=data[p]*65536+data[p+1]*256+data[p+2];if(!us)fail();tempos.push({tick,us,order:tempoOrder++});}
        p+=length;if(type===47){p=end;break;}continue;
      }
      if(status===240||status===247){const length=vlq();need(length);p+=length;continue;}
      if(status>=240)fail();
      const type=status>>4, channel=status&15, a=u8(), b=(type===12||type===13)?0:u8();
      if(a>=128||b>=128)fail();
      if(type!==8&&type!==9)continue;
      const lane=MIDI_LANES.indexOf(a), on=type===9&&b>0;
      if(lane<0){if(on)ignored++;continue;}
      const key=channel*128+a;
      if(on) {
        if(active.has(key))throw new Error(`MIDIノート${a}が重なっています。同じレーンの音符を重ねないでください。`);
        active.set(key,{tick,lane});
      } else if(active.has(key)) {
        const start=active.get(key);active.delete(key);
        if(tick>start.tick)pairs.push({start:start.tick,stop:tick,lane});
      }
    }
    if(active.size)throw new Error('終わりのないMIDIノートがあります。音符の終端を設定して書き出してください。');
  }
  if(!pairs.length)throw new Error('75・74・73・72番のMIDIノートが見つかりませんでした。');
  // A missing initial tempo uses this song's BPM, and is retained in parser diagnostics.
  const hasInitialTempo=tempos.some(e=>e.tick===0);
  const events=[{tick:0,us:60000000/base.bpm,order:-1},...tempos].sort((a,b)=>a.tick-b.tick||a.order-b.order);
  const segments=[];let lastTick=0,seconds=0,us=events[0].us;
  for(const e of events){seconds+=(e.tick-lastTick)/ppq*us/1e6;segments.push({tick:e.tick,seconds,us:e.us});lastTick=e.tick;us=e.us;}
  const toSeconds=tick=>{let lo=0,hi=segments.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(segments[mid].tick<=tick)lo=mid;else hi=mid-1;}const s=segments[lo];return s.seconds+(tick-s.tick)/ppq*s.us/1e6;};
  let clipped=0;
  const notes=pairs.flatMap(n=>{
    const t=toSeconds(n.start);if(t>=base.duration){clipped++;return [];}
    const rawEnd=toSeconds(n.stop), stop=Math.min(base.duration,rawEnd);
    if(rawEnd>base.duration)clipped++;
    const hold=n.stop-n.start>=ppq*HOLD_BEATS && stop-t>=.1;
    const ticks=[];
    if(hold){
      for(let tick=n.start+ppq;tick<=n.stop;tick+=ppq){const at=toSeconds(tick);if(at>base.duration)break;ticks.push(at);}
      if(!ticks.length)ticks.push(stop);
    }
    return [{t,lane:n.lane,...(hold?{end:stop,ticks}:{})}];
  }).sort((a,b)=>a.t-b.t||a.lane-b.lane);
  if(!notes.length)throw new Error(`冒頭${base.duration}秒にノーツがありません。MIDIの開始位置を確認してください。`);
  const last=[-1,-1,-1,-1];
  for(const n of notes){if(n.t<last[n.lane]+.02)throw new Error('同じレーンのノーツが重なっているか、間隔が短すぎます（20 ms未満）。');last[n.lane]=n.end??n.t;}
  let hash=2166136261;for(const b of data)hash=Math.imul(hash^b,16777619)>>>0;
  return {...base,id:`rolling-midi-v2-${hash.toString(16)}`,notes,midi:{ignored,clipped,tempoFallback:!hasInitialTempo},bpm:Math.round(60000000/segments.filter(s=>s.tick===0).at(-1).us*100)/100};
}
