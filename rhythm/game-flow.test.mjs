import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('./game.mjs',import.meta.url),'utf8');
const select=source.slice(source.indexOf('async function selectSong('),source.indexOf('async function loadSongs('));
const wheelHandlers=source.slice(source.indexOf("wheel.addEventListener('keydown'"),source.indexOf('function showSelection('));
function fixture() {
  const elements=new Map(),handlers={},events=[],timers=new Map(),responses=[];let timerId=0,fetches=0;
  const element=()=>({hidden:false,disabled:false,textContent:'',setAttribute(){},scrollIntoView(){}});
  const $=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
  const wheel={children:[0,116].map(offsetTop=>({...element(),offsetTop,offsetHeight:104})),offsetTop:0,clientHeight:280,scrollTop:0,setAttribute(){},dispatchEvent:event=>events.push(event.type),addEventListener:(name,fn)=>{handlers[name]=fn;}};
  const context=vm.createContext({Event,$,wheel,mode:'select',developerMode:false,logoTaps:0,songs:[{charts:[{title:'first',duration:125.952,catalogId:'normal'},{title:'first',duration:125.952,catalogId:'hard'}]},{charts:[{title:'second',duration:125.952}]}],selectedIndex:0,selectedDifficulty:0,chart:{id:'kept'},engine:{score:123},chartRequest:0,wheelTimer:null,reduceMotion:true,preloadAudio(){},leaderboard:{clearResult(){},clearChart(){}},clockString:()=>'',midiToChart:()=>({id:'late'}),useChart:next=>{context.chart=next;context.mode='select';},fetch:()=>{fetches++;return new Promise(resolve=>responses.push(resolve));},setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id)});
  const developer=source.slice(source.indexOf('function handleDeveloperLogo('),source.indexOf("$('song-prev').addEventListener"));
  vm.runInContext(select+'\n'+wheelHandlers+'\n'+developer,context);
  return {context,$,wheel,handlers,events,timers,responses,fetches:()=>fetches};
}
test('a queued song-wheel scroll cannot replace the chart after gameplay starts or ends',()=>{
  for(const mode of ['loading','playing','paused','finishing','results']){
    const f=fixture();f.context.selectedIndex=1;f.handlers.scroll();
    const queued=[...f.timers.values()];
    f.context.mode=mode;f.$('selection-screen').hidden=true;
    // display:none removes layout geometry; both items measure zero.
    f.wheel.clientHeight=0;f.wheel.children.forEach(item=>{item.offsetTop=0;item.offsetHeight=0;});
    queued.forEach(fn=>fn());
    assert.equal(f.context.mode,mode);assert.equal(f.context.selectedIndex,1);
    assert.equal(f.context.chart.id,'kept');assert.equal(f.context.engine.score,123);assert.equal(f.fetches(),0);
  }
});
test('new hidden-wheel events and stale song clicks leave results intact',async()=>{
  const f=fixture();f.context.mode='results';f.$('selection-screen').hidden=true;
  f.handlers.scroll();await f.context.selectSong(1,true);
  assert.equal(f.context.mode,'results');assert.equal(f.context.chart.id,'kept');assert.equal(f.fetches(),0);
});
test('visible song-wheel scrolling still selects the nearest song',()=>{
  const f=fixture();f.handlers.scroll();[...f.timers.values()].forEach(fn=>fn());
  assert.equal(f.context.selectedIndex,1);assert.equal(f.fetches(),1);assert.deepEqual(f.events,['song-scroll-select']);
  f.handlers.scroll();[...f.timers.values()].forEach(fn=>fn());assert.equal(f.events.length,1);
});

test('a MIDI response arriving after leaving selection cannot overwrite results',async()=>{
  for(const mode of ['loading','playing','paused','finishing','results']){
    const f=fixture();const pending=f.context.selectSong(1,false);
    f.context.mode=mode;f.$('selection-screen').hidden=true;
    f.context.chart={id:'finished'};f.context.engine={score:456};
    f.responses[0]({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)});
    await pending;
    assert.equal(f.context.mode,mode);assert.equal(f.context.chart.id,'finished');assert.equal(f.context.engine.score,456);
  }
});

test('five logo taps toggle 15-second mode and five more restore full duration',async()=>{
 const f=fixture();f.context.selectedIndex=0;
 for(let i=0;i<4;i++)f.context.handleDeveloperLogo();
 assert.equal(f.context.developerMode,false);assert.equal(f.fetches(),0);
 f.context.handleDeveloperLogo();assert.equal(f.context.developerMode,true);
 assert.equal(f.$('developer-indicator').hidden,false);
 const parsed=[];f.context.midiToChart=(_,song)=>{parsed.push(song);return {notes:[],bpm:162};};
 f.context.useChart=next=>{f.context.chart=next;};
 f.responses[0]({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(parsed[0].duration,15);assert.equal(f.context.songs[0].charts[0].duration,125.952);
 for(let i=0;i<5;i++)f.context.handleDeveloperLogo();
 assert.equal(f.context.developerMode,false);assert.equal(f.$('developer-indicator').hidden,true);
 f.responses[1]({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(parsed[1].duration,125.952);
});
test('logo taps cannot alter active gameplay or results',()=>{
 for(const mode of ['loading','playing','paused','finishing','results']){
  const f=fixture();f.context.mode=mode;
  for(let i=0;i<5;i++)f.context.handleDeveloperLogo();
  assert.equal(f.context.developerMode,false);assert.equal(f.context.chart.id,'kept');assert.equal(f.fetches(),0);
 }
});

test('difficulty button loads and starts its exact chart, not the previously selected chart',async()=>{
 const f=fixture();let started=0;
 f.context.startGame=()=>{started++;f.context.mode='playing';};
 f.context.midiToChart=(_,song)=>({...song,notes:[]});
 const pending=f.context.selectSong(0,false,1,true);
 assert.equal(started,0);
 f.responses[0]({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)});await pending;
 assert.equal(f.context.chart.catalogId,'hard');assert.equal(started,1);
});
test('rapid difficulty clicks only start the latest selected chart',async()=>{
 const f=fixture();let started=0;
 f.context.startGame=()=>{started++;f.context.mode='playing';};
 f.context.midiToChart=(_,song)=>({...song,notes:[]});
 const hard=f.context.selectSong(0,false,1,true);
 const normal=f.context.selectSong(0,false,0,true);
 f.responses[1]({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)});await normal;
 f.responses[0]({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)});await hard;
 assert.equal(f.context.chart.catalogId,'normal');assert.equal(started,1);
});
