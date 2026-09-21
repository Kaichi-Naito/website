import test from 'node:test';
import assert from 'node:assert/strict';
import {resultStandings, Leaderboard} from './leaderboard.mjs';
const row=(score,extra={})=>({name:`player${score}`,score,accuracy:90,maxCombo:20,playId:`play${score}`,...extra});
const candidate=(score,extra={})=>row(score,{playId:'current',...extra});
const full=Array.from({length:10},(_,i)=>row(1000-i*100));

test('result preview inserts at first, middle and tenth, and leaves the live ranking untouched',()=>{
 for(const [score,position] of [[1100,1],[650,5],[150,10]]) {
  const entries=structuredClone(full),before=structuredClone(entries);
  const preview=resultStandings(entries,candidate(score));
  assert.equal(preview.rows.length,10);assert.equal(preview.position,position);
  assert.equal(preview.rows[position-1].current,true);assert.equal(preview.registered,false);
  assert.deepEqual(entries,before);assert.equal(preview.rows.some(e=>e.score===100),false);
 }
});
test('equal ranking values follow existing scores; outside top ten does not create an eleventh row',()=>{
 assert.equal(resultStandings(full,candidate(500)).position,7);
 assert.equal(resultStandings(full,candidate(500,{accuracy:91})).position,6);
 for(const score of [100,0]) {
  const preview=resultStandings(full,candidate(score));assert.equal(preview.position,null);
  assert.equal(preview.rows.length,10);assert.ok(!preview.rows.some(e=>e.current));
 }
});
test('an empty ranking includes a zero-point result as first place',()=>{
 const preview=resultStandings([],candidate(0));assert.equal(preview.position,1);assert.equal(preview.rows.length,1);
});
test('a better repeat run replaces the same player rather than taking another place',()=>{
 const entries=full.map((e,i)=>({...e,playerKey:i===8?'own':`other${i}`}));
 const preview=resultStandings(entries,candidate(650,{ownKey:'own'}));
 assert.equal(preview.position,5);assert.equal(preview.rows.length,10);
 assert.equal(preview.rows.some(e=>e.playId==='play200'),false);
 assert.equal(preview.rows.filter(e=>e.current).length,1);
});
test('lower or equal repeat score keeps the previous best even with better accuracy',()=>{
 const entries=full.map((e,i)=>({...e,playerKey:i===0?'own':`other${i}`}));
 for(const score of [1000,900]) {
  const preview=resultStandings(entries,candidate(score,{ownKey:'own',accuracy:99}));
  assert.equal(preview.position,null);assert.equal(preview.kept,true);assert.equal(preview.rows[0].personalBest,true);
  assert.ok(!preview.rows.some(e=>e.current));
 }
});
test('confirmed play is highlighted once using the registered name and actual rank',()=>{
 const entries=[row(1000),row(650,{playId:'current',name:'かいち'})];
 const preview=resultStandings(entries,candidate(650));assert.equal(preview.registered,true);
 assert.equal(preview.position,2);assert.equal(preview.rows.length,2);assert.equal(preview.rows[1].name,'かいち');
});
class Element {
 constructor(){this.children=[];this.textContent='';this.hidden=false;}
 append(...items){this.children.push(...items);}
 replaceChildren(...items){this.children=items;}
}
test('result table labels provisional and confirmed scores and clears between plays',()=>{
 const nodes=new Map(['result-ranking','result-ranking-rows','result-ranking-status'].map(id=>[id,new Element()]));
 globalThis.document={getElementById:id=>nodes.get(id),createElement:()=>new Element()};
 const board=Object.create(Leaderboard.prototype);
 board.entries=full;board.resultPreview=candidate(650);board.resultRankingState='eligible';
 board.renderResultRanking();
 let rows=nodes.get('result-ranking-rows').children;
 assert.equal(rows.length,10);assert.equal(rows[4].className,'result-ranking-current');
 assert.equal(rows[4].children[1].children[0].textContent,'未登録');
 board.entries=[row(1000),row(650,{name:'かいち',playId:'current'})];board.resultRankingState='ranked';
 board.renderResultRanking();rows=nodes.get('result-ranking-rows').children;
 assert.equal(rows[1].children[1].textContent,'かいち');assert.match(rows[1].children[1].children[0].textContent,/登録済み/);
 board.resultPreview=null;board.renderResultRanking();
 assert.equal(nodes.get('result-ranking').hidden,true);assert.equal(nodes.get('result-ranking-rows').children.length,0);
});
test('failed loading and an explicit registration rejection never display a fictitious inserted rank',()=>{
 const nodes=new Map(['result-ranking','result-ranking-rows','result-ranking-status'].map(id=>[id,new Element()]));
 globalThis.document={getElementById:id=>nodes.get(id),createElement:()=>new Element()};
 const board=Object.create(Leaderboard.prototype);board.entries=full;board.resultPreview=candidate(1100);
 board.resultRankingState='failed';board.renderResultRanking();assert.equal(nodes.get('result-ranking-rows').children.length,0);
 board.resultRankingState='unranked';board.renderResultRanking();
 assert.ok(nodes.get('result-ranking-rows').children.every(r=>r.className!=='result-ranking-current'));
 assert.match(nodes.get('result-ranking-status').textContent,/圏外/);
});
