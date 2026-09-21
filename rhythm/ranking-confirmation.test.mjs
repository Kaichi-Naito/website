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
