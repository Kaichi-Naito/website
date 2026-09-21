import test from 'node:test';
import assert from 'node:assert/strict';
import {ResultTransition} from './result-transition.mjs';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('completion waits for the whole 1.1 second transition',()=>{
 const gate=new ResultTransition();gate.begin(100);
 assert.equal(gate.ready(1199),false);assert.equal(gate.ready(1200),true);
 assert.equal(gate.progress(50),0);assert.equal(gate.progress(650),.5);
});
test('last held note cannot click through even after the animation ends',()=>{
 const gate=new ResultTransition();gate.press('finger:1',90);gate.begin(100);
 assert.equal(gate.ready(5000),false);
 gate.release('finger:1',5000);
 assert.equal(gate.ready(5349),false);assert.equal(gate.ready(5350),true);
});
test('all fingers and keyboard keys must lift, and repeated finishing taps extend protection',()=>{
 const gate=new ResultTransition();gate.press('finger:1',0);gate.press('KeyR',0);gate.begin(0);
 gate.release('finger:1',1500);assert.equal(gate.ready(1900),false);
 gate.release('KeyR',1900);gate.press('finger:2',2200);gate.release('finger:2',2220);
 assert.equal(gate.ready(2569),false);assert.equal(gate.ready(2570),true);
});
test('cancellation and backgrounding cannot leave the next result waiting for stale contacts',()=>{
 const gate=new ResultTransition();gate.press('finger:1',0);gate.begin(0);gate.releaseAll(2000);
 assert.equal(gate.ready(2350),true);gate.cancel();assert.equal(gate.ready(5000),false);
 gate.begin(6000);assert.equal(gate.ready(7100),true);
});
const source=readFileSync(new URL('./game.mjs',import.meta.url),'utf8');
test('scroll lock blocks touch/wheel everywhere, restores styles, and permits result scrolling',()=>{
 const handlers={}, classes=new Set(),scrolls=[];
 const body={style:{position:'relative',top:'2px',left:'3px',right:'4px',width:'90%'}};
 const original={...body.style};
 const context=vm.createContext({scrollLockState:null,$:()=>({getBoundingClientRect:()=>({top:100,height:500})}),window:{scrollY:40,innerHeight:800,visualViewport:{height:700},scrollTo:(x,y)=>scrolls.push([x,y])},document:{body,documentElement:{classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)}},addEventListener:(type,fn,options)=>{handlers[type]={fn,options};}}});
 vm.runInContext(source.slice(source.indexOf('function lockPageScroll()'),source.indexOf('// Use the hardware output')),context);
 context.lockPageScroll();assert.equal(body.style.position,'fixed');assert.equal(classes.has('play-scroll-locked'),true);
 for(const type of ['touchmove','wheel']){
  let prevented=false;const event={cancelable:true,preventDefault(){prevented=true;}};
  assert.equal(handlers[type].options.passive,false);handlers[type].fn(event);assert.equal(prevented,true);
 }
 context.lockPageScroll();context.unlockPageScroll();assert.deepEqual(body.style,original);assert.equal(classes.size,0);
 for(const type of ['touchmove','wheel'])handlers[type].fn({cancelable:true,preventDefault(){assert.fail('Results must scroll');}});
 context.unlockPageScroll();assert.deepEqual(scrolls.at(-1),[0,40]);
});
test('finishing blocks result-link clicks before document handlers, and results allow them',()=>{
 const handlers={};const context=vm.createContext({window:{addEventListener:(type,handler)=>{handlers[type]=handler;}}});
 const start=source.indexOf("window.addEventListener('click',event=>{");
 vm.runInContext(source.slice(start,source.indexOf("window.addEventListener('blur'",start)),context);
 context.mode='finishing';let prevented=0,stopped=0;
 handlers.click({preventDefault(){prevented++;},stopImmediatePropagation(){stopped++;}});
 assert.equal(prevented,1);assert.equal(stopped,1);
 context.mode='results';handlers.click({preventDefault(){assert.fail();},stopImmediatePropagation(){assert.fail();}});
});
