import test from 'node:test';
import assert from 'node:assert/strict';
import {Leaderboard} from './leaderboard.mjs';

function fixture() {
  const messages = new Map();
  globalThis.document = {getElementById(id) {
    if (!messages.has(id)) messages.set(id, {hidden:true,textContent:''});
    return messages.get(id);
  }};
  const board = Object.create(Leaderboard.prototype), states=[];
  board.entries=[]; board.registeredPlayId='current';
  board.onRankingState=(...state)=>states.push(state);
  return {board,states,messages};
}
test('registration waits for the current play to appear after stale sheet reads',async()=>{
  const {board,states}=fixture(); let reads=0; const waits=[];
  board.refresh=async()=>{
    ++reads;
    board.entries=reads<3 ? [{playId:'older'}] : [{playId:'older'},{playId:'current'}];
    return true;
  };
  await board.confirmRegisteredRank('current',async ms=>waits.push(ms));
  assert.equal(reads,3); assert.deepEqual(waits,[1000,2500]);
  assert.deepEqual(states,[]);
});
test('an unconfirmed registration stays honest and gives a manual retry',async()=>{
  const {board,states,messages}=fixture(); let reads=0;
  board.refresh=async()=>{reads++; return true;};
  await board.confirmRegisteredRank('current',async()=>{});
  assert.equal(reads,4); assert.deepEqual(states,[['unconfirmed']]);
  assert.match(messages.get('score-message').textContent,/登録は完了.*順位の反映を確認できません/);
});
test('a retry response from an old result cannot change the next result',async()=>{
  const {board,states}=fixture(); let resolve;
  board.refresh=()=>new Promise(done=>{resolve=done;});
  const pending=board.confirmRegisteredRank('current',async()=>{});
  board.registeredPlayId=null; resolve(true); await pending;
  assert.deepEqual(states,[]);
});

test('projected positions respect score, accuracy, combo and existing ties', async()=>{
  const {projectedRank}=await import('./leaderboard.mjs');
  const row=(score,accuracy=90,maxCombo=20)=>({score,accuracy,maxCombo});
  const entries=[row(300),row(200,95,30),row(200,90,25),row(100)];
  assert.equal(projectedRank(entries,row(400)),1);
  assert.equal(projectedRank(entries,row(200,95,31)),2);
  assert.equal(projectedRank(entries,row(200,95,30)),3);
  assert.equal(projectedRank(entries,row(200,91,1)),3);
  assert.equal(projectedRank(entries,row(200,90,24)),4);
  assert.equal(projectedRank([],row(0)),1);
  const full=Array.from({length:10},(_,i)=>({...row(100-i),playerKey:String(i)}));
  assert.equal(projectedRank(full,row(90)),null);
  assert.equal(projectedRank(full,row(91)),null);
  assert.equal(projectedRank(full,row(91,91)),10);
  assert.equal(projectedRank(full,row(92),'9'),10);
});

test('eligible result sends its numeric position without claiming registration',async()=>{
  const {board,states}=fixture();
  const {playerKey}=await import('./leaderboard.mjs');
  board.chart={title:'Rolling',catalogId:'rolling-normal',difficulty:'NORMAL'};
  board.playerId='12345678-1234-1234-1234-123456789abc';board.keyPromise=Promise.resolve('chart');
  board.resetProgress=()=>{};board.refresh=async()=>true;
  board.entries=[{score:200,accuracy:90,maxCombo:20},{score:100,accuracy:90,maxCombo:20,playerKey:await playerKey(board.playerId,'chart')}];
  await board.showResult({score:150,accuracy:90,maxCombo:20});
  assert.deepEqual(states,[['checking'],['eligible',2]]);
  assert.equal(board.registeredPlayId,null);
});
