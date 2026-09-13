import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {chartKey,validName,validEndpoint} from './leaderboard.mjs';
const code=readFileSync(new URL('./ranking/Code.gs',import.meta.url),'utf8');
const sandbox=vm.createContext({});vm.runInContext(code,sandbox);
const valid={song:'Rolling',songId:'rolling-normal',ruleset:'beat-hold-v4',name:'かいち',chartKey:'a'.repeat(64),playId:'00000000-0000-4000-8000-000000000000',score:575000,accuracy:57.5,maxCombo:3,emptyPresses:0,units:4,counts:{PERFECT:1,GREAT:1,GOOD:1,MISS:1}};
test('ranking identity follows note content and rules, not MIDI filenames or metadata',async()=>{
  const chart={catalogId:'rolling-normal',duration:60,notes:[{t:1,lane:0,end:2}]};
  assert.equal(await chartKey(chart),await chartKey({...chart,id:'another',title:'other'}));
  assert.notEqual(await chartKey(chart),await chartKey({...chart,notes:[{t:1.1,lane:0,end:2}]}));
});
test('registration validates name, endpoint, counts, score and completion before writing',()=>{
  assert.equal(validName(' かいち '),'かいち');assert.throws(()=>validName(' '));
  assert.throws(()=>validName('a'.repeat(17)));assert.throws(()=>validName('a\nb'));
  assert(validEndpoint('https://script.google.com/macros/s/abc123/exec'));
  assert(!validEndpoint('https://evil.example/exec'));
  assert(!validEndpoint('https://script.google.com.evil.example/macros/s/a/exec'));
  assert.equal(sandbox.validateScore_(valid).score,575000);
  for(const patch of [{score:1000000},{units:5},{maxCombo:5},{ruleset:'old'},{chartKey:'bad'},{counts:{...valid.counts,MISS:-1}}])assert.throws(()=>sandbox.validateScore_({...valid,...patch}));
});
test('retries only append once; formula-like names stay text; response is acknowledged after saving',()=>{
  const rows=[['曲名','プレイヤー名','スコア','精度','最大コンボ','譜面ID','判定ルール','登録日時','プレイID']];
  let locks=0,flushes=0;
  const sheet={getLastRow:()=>rows.length,getMaxRows:()=>1000,getRange:(row,col,count=1,width=1)=>{
    if(row==='I1')return {getValue:()=>rows[0][8]};
    return {setNumberFormat:()=>{},setValues:values=>{rows[row-1]=values[0];},getValues:()=>rows.slice(row-1,row-1+count).map(r=>r.slice(col-1,col-1+width)),createTextFinder:id=>({matchEntireCell:()=>({findNext:()=>{const index=rows.findIndex(r=>r[8]===id);return index<0?null:{getRow:()=>index+1};}})})};
  }};
  sandbox.LockService={getScriptLock:()=>({waitLock:()=>locks++,releaseLock:()=>locks--})};
  const catalog={getLastRow:()=>2,getRange:()=>({getValues:()=>[['Rolling','NORMAL','','','PHALUX','',162,120,'rolling-normal',true]]})};
  sandbox.SpreadsheetApp={openById:()=>({getSheetByName:name=>name==='譜面'?catalog:sheet}),flush:()=>flushes++};
  sandbox.Utilities={formatDate:()=> '2026-09-12 23:00:00'};
  sandbox.HtmlService={XFrameOptionsMode:{ALLOWALL:1},createHtmlOutput:html=>({setXFrameOptionsMode:()=>html})};
  const entry={...valid,name:'=1+1'};
  const first=sandbox.saveScore_(entry);sandbox.saveScore_(entry);
  assert.equal(rows.length,2);assert.equal(rows[1][1],"'=1+1");assert.equal(flushes,1);assert.equal(locks,0);assert.equal(first.length,1);
  const html=sandbox.doPost({parameter:{requestId:valid.playId,payload:JSON.stringify(entry)}});
  assert(html.includes('"ok":true'));assert(html.includes('window.top.postMessage'));assert.equal(rows.length,2);
  const bad=sandbox.doPost({parameter:{requestId:valid.playId,payload:JSON.stringify({...entry,score:1})}});
  assert(bad.includes('"ok":false'));assert.equal(rows.length,2);
});

test('server derives the same empty-press penalty and rejects forged penalty counts',()=>{
  const penalized={...valid,emptyPresses:1,score:325000,accuracy:32.5};
  assert.equal(sandbox.validateScore_(penalized).score,325000);
  assert.equal(sandbox.validateScore_({...penalized,emptyPresses:10,score:0,accuracy:0}).score,0);
  for(const emptyPresses of [undefined,-1,1.5,Infinity,'1'])assert.throws(()=>sandbox.validateScore_({...penalized,emptyPresses}));
  assert.throws(()=>sandbox.validateScore_({...valid,emptyPresses:1}));
});
