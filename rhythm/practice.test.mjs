import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {practiceRate,practiceChart,PRACTICE_RATES} from './practice.mjs';
import {RhythmEngine} from './engine.mjs';
import {PlaybackClock} from './playback-clock.mjs';
const base={duration:15,bpm:120,title:'Rolling',difficulty:'HARD',notes:[{lane:0,t:1,end:2,ticks:[1.5,2]},{lane:1,t:3}]};
test('all six rates scale heads, hold ticks, tails and duration without modifying the original',()=>{
 const original=JSON.stringify(base);
 assert.deepEqual(PRACTICE_RATES,[.5,.6,.7,.8,.9,1]);
 for(const rate of PRACTICE_RATES){
  const chart=practiceChart(base,rate);
  assert.equal(chart.notes[0].t,1/rate);assert.equal(chart.notes[0].end,2/rate);
  assert.deepEqual(chart.notes[0].ticks,[1.5/rate,2/rate]);
  assert.equal(chart.duration,15/rate);assert.equal(chart.bpm,120*rate);
 }
 assert.equal(JSON.stringify(base),original);
 for(const invalid of [0,.1,.2,.3,.4,-1,1.1,NaN,Infinity,'x'])assert.equal(practiceRate(invalid),1);
});
test('practice provides real-time judgments and hold feedback at every speed while score stays zero',()=>{
 for(const rate of PRACTICE_RATES){
  const judged=[],engine=new RhythmEngine(practiceChart(base,rate),event=>judged.push(event.label),{scoring:false});
  engine.press(0,1/rate+.02);engine.tick(2/rate);engine.release(0,2/rate);
  engine.press(1,3/rate+.11);
  assert.deepEqual(judged,['PERFECT','PERFECT','PERFECT','GOOD']);
  assert.equal(engine.score,0);assert.equal(engine.combo,4);
 }
 const live=new RhythmEngine(base);live.press(0,1);assert.ok(live.score>0);
});
const source=readFileSync(new URL('./game.mjs',import.meta.url),'utf8');
function slice(start,end){return source.slice(source.indexOf(start),source.indexOf(end));}
test('audio and note clocks stay aligned across count-in, pause and resume at every speed',()=>{
 for(const rate of PRACTICE_RATES){
  let started;
  const audio={currentTime:100,outputLatency:0,createBufferSource:()=>({playbackRate:{value:1},connect(){},start(...args){started=args;}})};
  const clock=new PlaybackClock();
  const state=vm.createContext({context:audio,practiceAudio:{schedule(destination,options){started=[options.when,options.offset,options.duration];assert.equal(options.rate,rate);return {};}},playbackClock:clock,playRate:()=>rate,practicing:true,practiceSpeed:rate,stopSource(){},lockPageScroll(){},$:()=>({}),gain:{},buffer:{duration:15},chart:base,source:null,startAt:0,resumeAt:0,mode:'paused',ui:{overlay:{},pause:{},settings:{},status:{}}});
  vm.runInContext(slice('function schedule(', 'async function startGame('),state);
  state.schedule(-2.5,.1);
  assert.equal(started[0],102.6);assert.equal(started[1],0);assert.equal(started[2],15);
  if(rate===1)assert.equal(state.source.playbackRate.value,1);
  audio.currentTime=102.6+1/rate;assert.ok(Math.abs(clock.read(audio,0).time-1/rate)<1e-8);
  const from=5/rate;audio.currentTime=200;state.schedule(from,2);
  assert.equal(started[0],202);assert.equal(started[1],5);assert.equal(started[2],10);
  audio.currentTime=201;assert.equal(clock.read(audio,0).time,from);
  audio.currentTime=203;assert.ok(Math.abs(clock.read(audio,0).time-(from+1))<1e-8);
 }
});
test('practice completion cannot read/write best scores, rank, generate images or register results',()=>{
 const ui={pause:{},settings:{},restart:{},result:{},status:{}};
 let overlay;
 const state=vm.createContext({mode:'finishing',practicing:true,practiceSpeed:.5,chart:base,ui,$:()=>({}),resultTransition:{cancel(){}},unlockPageScroll(){},updateHud(){},resultShare:{clear(){},show(){assert.fail('sharing practice');}},leaderboard:{clearResult(){},showResult(){assert.fail('registering practice');}},showOverlay:(...args)=>overlay=args,readBest(){assert.fail('reading personal best');},localStorage:{setItem(){assert.fail('writing personal best');}}});
 vm.runInContext(slice('function showResults(', 'function onJudge('),state);state.showResults();
 assert.equal(state.mode,'results');assert.equal(overlay[0],'PRACTICE COMPLETE');assert.equal(overlay[3],'もう一度練習');assert.equal(ui.result.hidden,true);
});
test('returning to title stops playback, cancels requests and leaves only the opening screen',()=>{
 const elements=new Map();const $=id=>{if(!elements.has(id))elements.set(id,{hidden:false,disabled:true,close(){},focus(){}});return elements.get(id);};
 const classes=new Set(['practice-active']);let stopped=0,unlocked=0;
 const state=vm.createContext({practiceAudio:{release(){}},mode:'paused',practicing:true,selectionPractice:true,updateSelectionPractice(){},chartRequest:4,requestId:5,wheelTimer:1,clearTimeout(){},resultTransition:{cancel(){}},resultShare:{clear(){}},leaderboard:{clearResult(){}},stopSource(){stopped++;},resetInputs(){},unlockPageScroll(){unlocked++;},$,document:{body:{classList:{add:v=>classes.add(v),remove:v=>classes.delete(v)}}},window:{scrollTo(){}},ui:{overlay:{},pause:{},settings:{},status:{}}});
 vm.runInContext(slice('function showTitle(', 'function useChart('),state);state.showTitle();
 assert.equal(state.mode,'title');assert.equal(state.practicing,false);assert.equal(state.selectionPractice,false);assert.equal(stopped,1);assert.equal(unlocked,1);
 assert.equal(state.chartRequest,5);assert.equal(state.requestId,6);assert.equal(state.chart,null);
 assert.equal($('title-screen').hidden,false);assert.equal($('title-start').disabled,false);
 for(const id of ['selection-screen','play-workspace','game-menubar','ranking-window','game-page-note'])assert.equal($(id).hidden,true);
 assert.deepEqual([...classes],['title-screen-active']);
});

test('the separate toggle sends any difficulty to practice; turning it off restores normal play',()=>{
 const elements=new Map(),handlers={},calls=[],sounds=[];
 const $=id=>{if(!elements.has(id))elements.set(id,{hidden:false,value:'0.5',setAttribute(key,value){this[key]=value;},addEventListener(type,fn){handlers[id+':'+type]=fn;}});return elements.get(id);};
 const state=vm.createContext({$,Event,mode:'select',selectionPractice:false,practicing:false,practiceSpeed:.5,practiceRate,selectedIndex:0,selectedDifficulty:0,ensureAudioContext:()=>Promise.resolve(),wheel:{dispatchEvent:e=>sounds.push(e.type)},selectSong:(...args)=>calls.push(args)});
 vm.runInContext(slice('function updateSelectionPractice()', '// The dialog is only used'),state);
 handlers['practice-toggle:click']();
 assert.equal($('practice-toggle')['aria-pressed'],'true');assert.equal($('selection-practice-options').hidden,false);
 state.playSong(0,1);assert.equal(state.practicing,true);assert.equal(state.practiceSpeed,.5);assert.deepEqual(calls.pop(),[0,false,1,true]);
 $('selection-practice-speed').value='0.9';handlers['selection-practice-speed:change']();
 state.playSong(1,0);assert.equal(state.practiceSpeed,.9);assert.deepEqual(calls.pop(),[1,false,0,true]);
 handlers['practice-toggle:click']();state.playSong(0,0);
 assert.equal(state.practicing,false);assert.equal($('practice-toggle')['aria-pressed'],'false');assert.equal($('selection-practice-options').hidden,true);
 assert.deepEqual(calls.pop(),[0,false,0,true]);assert.equal(sounds.length,3);
 state.mode='playing';handlers['practice-toggle:click']();state.playSong();assert.equal(calls.length,0);assert.equal(state.selectionPractice,false);
});
