import test from 'node:test';
import assert from 'node:assert/strict';
import {assetPath,parseCatalog} from './catalog.mjs';
const row=['Rolling','NORMAL','website/rhythm/charts/Rolling_Game.mid','website/rhythm/Rolling_Game.mp3','PHALUX','images/CDjacket/Rolling500x500.png',162,120,'rolling-normal',true];
test('sheet rows bind song details and assets; multiple difficulties have separate IDs',()=>{
  const hard=[...row];hard[1]='HARD';hard[8]='rolling-hard';
  const songs=parseCatalog([row,hard]);assert.equal(songs.length,2);assert.equal(songs[0].midiPath,'rhythm/charts/Rolling_Game.mid');assert.equal(songs[1].difficulty,'HARD');assert.equal(songs[0].duration,120);
  assert.equal(assetPath('https://kaichi-naito.github.io/website/rhythm/Rolling_Game.mp3','audio'),'rhythm/Rolling_Game.mp3');
});
test('private rows are omitted; invalid or duplicate public entries report errors',()=>{
  const hidden=[...row];hidden[9]=false;assert.equal(parseCatalog([row,hidden]).length,1);
  assert.throws(()=>parseCatalog([row,row]),/譜面ID/);assert.throws(()=>parseCatalog([hidden]),/公開中/);
  const incomplete=[...row];incomplete[4]='';assert.throws(()=>parseCatalog([incomplete]),/アーティスト/);
});
test('asset paths reject remote hosts, scripts and encoded directory traversal',()=>{
  for(const path of ['https://evil.example/a.mp3','javascript:a.mp3','../private.mp3','%2e%2e/private.mp3','/secret.mp3','a%5cb.mp3'])assert.throws(()=>assetPath(path,'audio'));
});
