import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {chartKey,validName,validEndpoint,getPlayerId,playerKey,uniqueBestEntries} from './leaderboard.mjs';
const code=readFileSync(new URL('./ranking/Code.gs',import.meta.url),'utf8');
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const valid={song:'Rolling',songId:'rolling-normal',difficulty:'NORMAL',playerId:uuid(1),ruleset:'beat-hold-v4',name:'かいち',chartKey:'a'.repeat(64),playId:uuid(10),score:575000,accuracy:57.5,maxCombo:3,emptyPresses:0,units:4,counts:{PERFECT:1,GREAT:1,GOOD:1,MISS:1}};
const headers=['曲名','プレイヤー名','スコア','精度','最大コンボ','譜面ID','判定ルール','登録日時','プレイID','PERFECT','GREAT','GOOD','MISS','判定数','空押し数','プレイヤーキー','楽曲ID','難易度'];
function fixture(initial=[]) {
  const rows=[headers,...initial],catalogRows=[['title'],['Rolling','NORMAL','','','PHALUX','',162,120,'rolling-normal',true],['Rolling','HARD','','','PHALUX','',162,120,'rolling-hard',true]];
  let locks=0,flushes=0;const cache=new Map();
  function sheet(data) {return {
    getLastRow:()=>data.length,getMaxRows:()=>1000,deleteRow:row=>data.splice(row-1,1),
    getRange:(row,col,count=1,width=1)=>{
      if(typeof row==='string'){const match=/^([A-Z]+)(\d+)$/.exec(row);col=[...match[1]].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);row=Number(match[2]);}
      const range={
        getValue:()=>data[row-1]?.[col-1],
        getValues:()=>Array.from({length:count},(_,i)=>Array.from({length:width},(_,j)=>data[row-1+i]?.[col-1+j]??'')),
        setValues:values=>{values.forEach((r,i)=>{data[row-1+i]||=[];r.forEach((v,j)=>data[row-1+i][col-1+j]=v);});},
        clearContent:()=>{for(let i=0;i<count;i++)for(let j=0;j<width;j++)data[row-1+i][col-1+j]='';},
        createTextFinder:id=>({matchEntireCell:()=>({findNext:()=>{const index=data.findIndex((r,i)=>i>=row-1&&i<row-1+count&&r[col-1]===id);return index<0?null:{getRow:()=>index+1};}})})
      };return range;
    }
  };}
  const scores=sheet(rows),catalog=sheet(catalogRows);
  const state=vm.createContext({
    CacheService:{getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v)})},
    LockService:{getScriptLock:()=>({waitLock:()=>locks++,releaseLock:()=>locks--})},
    SpreadsheetApp:{openById:()=>({getSheetByName:name=>name==='譜面'?catalog:scores}),flush:()=>flushes++},
    Utilities:{formatDate:()=> '2026-09-21 21:00:00',DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,text)=>[...createHash('sha256').update(text).digest()]},
    HtmlService:{XFrameOptionsMode:{ALLOWALL:1},createHtmlOutput:html=>({setXFrameOptionsMode:()=>html})}
  });vm.runInContext(code,state);
  return {state,rows,get locks(){return locks;},get flushes(){return flushes;}};
}
const better={...valid,playId:uuid(11),score:1000000,accuracy:100,maxCombo:4,counts:{PERFECT:4,GREAT:0,GOOD:0,MISS:0}};
test('chart keys preserve separate songs and arrangements',async()=>{
  const chart={catalogId:'rolling-normal',duration:30,notes:[{t:1,lane:0,end:2}]};
  assert.equal(await chartKey(chart),await chartKey({...chart,id:'other',title:'other'}));
  assert.notEqual(await chartKey(chart),await chartKey({...chart,catalogId:'rolling-hard'}));
  assert.notEqual(await chartKey(chart),await chartKey({...chart,notes:[{t:1.1,lane:0,end:2}]}));
});
test('player identity persists across reloads; unavailable storage does not silently create new people',async()=>{
  const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
  const id=getPlayerId(storage);assert.equal(getPlayerId(storage),id);
  assert.equal(getPlayerId({getItem(){throw Error('blocked');}}),null);
  assert.equal(getPlayerId({getItem:()=>null,setItem(){}}),null);
  assert.notEqual(await playerKey(id,'a'),await playerKey(id,'b'));
  assert.equal(await playerKey(valid.playerId,valid.chartKey),fixture().state.playerKey_(valid));
});
test('registration validates identity, name, endpoint and score before writing',()=>{
  const {state}=fixture();assert.equal(validName(' かいち '),'かいち');assert.throws(()=>validName(' '));assert.throws(()=>validName('a'.repeat(17)));
  assert(validEndpoint('https://script.google.com/macros/s/abc123/exec'));assert(!validEndpoint('https://evil.example/exec'));
  assert.equal(state.validateScore_(valid).score,575000);
  for(const patch of [{playerId:undefined},{difficulty:''},{score:1000000},{units:5},{maxCombo:5},{ruleset:'old'},{chartKey:'bad'},{counts:{...valid.counts,MISS:-1}}])assert.throws(()=>state.validateScore_({...valid,...patch}));
  assert.throws(()=>state.saveScore_({...valid,difficulty:'HARD'}));
});
test('retries save once, retain text names, and release the lock',()=>{
  const f=fixture(),entry={...valid,name:'=1+1'};f.state.saveScore_(entry);const retry=f.state.saveScore_(entry);
  assert.equal(f.rows.length,2);assert.equal(f.rows[1][1],"'=1+1");assert.equal(f.flushes,1);assert.equal(f.locks,0);assert.equal(retry.duplicate,true);
  assert.throws(()=>f.state.saveScore_({...entry,playerId:uuid(2)}));assert.equal(f.locks,0);
});
test('higher score replaces the same player, while equal or lower scores keep the prior record',()=>{
  const f=fixture();f.state.saveScore_(valid);
  assert.equal(f.state.saveScore_({...better,name:'別の名前'}).updatedPersonalBest,true);
  assert.equal(f.rows.length,2);assert.equal(f.rows[1][2],1000000);assert.equal(f.rows[1][1],'別の名前');
  for(const entry of [{...valid,playId:uuid(12)},{...better,playId:uuid(13)}]) {
    const response=f.state.saveScore_(entry);assert.equal(response.personalBestKept,true);assert.equal(response.playId,better.playId);
  }
  assert.equal(f.rows.length,2);assert.equal(f.rows[1][8],better.playId);
});
test('same names on different players and separate difficulties do not merge',()=>{
  const f=fixture();f.state.saveScore_(valid);f.state.saveScore_({...valid,playerId:uuid(2),playId:uuid(20)});
  f.state.saveScore_({...valid,songId:'rolling-hard',difficulty:'HARD',chartKey:'b'.repeat(64),playId:uuid(21)});
  assert.equal(f.rows.length,4);assert.notEqual(f.rows[1][15],f.rows[2][15]);assert.notEqual(f.rows[1][15],f.rows[3][15]);
});
test('full top 10 updates the player in place without ejecting another player',()=>{
  const f=fixture();for(let i=1;i<=10;i++)f.state.saveScore_({...valid,playerId:uuid(i),playId:uuid(100+i)});
  assert.equal(f.state.saveScore_(better).updatedPersonalBest,true);assert.equal(f.rows.length,11);
  const lost=f.state.saveScore_({...valid,playerId:uuid(11),playId:uuid(200)});assert.equal(lost.qualified,false);assert.equal(f.rows.length,11);
  assert.equal(f.state.saveScore_({...better,playerId:uuid(11),playId:uuid(201)}).replaced,true);assert.equal(f.rows.length,11);
});
test('legacy scores without identity are preserved, while known duplicate identities keep only the best',()=>{
  const f=fixture();f.state.saveScore_(valid);const low=[...f.rows[1]];low[8]=uuid(30);f.rows.push(low);
  const legacy=[...low];legacy[15]='';legacy[8]=uuid(31);f.rows.push(legacy);
  f.state.saveScore_(better);const populated=f.rows.slice(1).filter(row=>row[5]);
  assert.equal(populated.length,2);assert.equal(populated.filter(row=>row[15]).length,1);assert.equal(populated.find(row=>!row[15])[8],uuid(31));
});
test('capability probes never create a score; score replies are sent after saving',()=>{
  const f=fixture();const request=payload=>({parameter:{requestId:uuid(90),payload:JSON.stringify(payload)}});
  assert.match(f.state.doPost(request({action:'capabilities'})),/"playerBest":true/);assert.equal(f.rows.length,1);
  assert.match(f.state.doPost(request(valid)),/"ok":true/);assert.equal(f.rows.length,2);
  assert.match(f.state.doPost(request({...valid,score:1})),/"ok":false/);assert.equal(f.rows.length,2);
});
test('public leaderboard collapses only known players and keeps the highest result',()=>{
  const entries=[{playerKey:'a'.repeat(64),score:1},{playerKey:'a'.repeat(64),score:5},{playerKey:'b'.repeat(64),score:2},{name:'同名',score:3},{name:'同名',score:4}];
  assert.deepEqual(uniqueBestEntries(entries).map(x=>x.score),[5,4,3,2]);
});
test('server keeps the existing empty-press penalty and rejects forged counts',()=>{
  const {state}=fixture();const penalized={...valid,emptyPresses:1,score:325000,accuracy:32.5};
  assert.equal(state.validateScore_(penalized).score,325000);
  for(const emptyPresses of [undefined,-1,1.5,Infinity,'1'])assert.throws(()=>state.validateScore_({...penalized,emptyPresses}));
});
