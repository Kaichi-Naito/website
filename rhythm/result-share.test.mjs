import test from 'node:test';
import assert from 'node:assert/strict';
import {APP_URL, ResultShare, resultSnapshot, shareText, xIntent, xDestination} from './result-share.mjs';

const chart = {title: '曲 &「光」 #1 🎸', artist: 'PHALUX / A+B', difficulty: 'NORMAL'};
const score = {score: 987654, rank: 'S', accuracy: 98.34, maxCombo: 123, emptyPresses: 1, counts: {PERFECT: 120, GREAT: 3, GOOD: 0, MISS: 1}};
test('X draft preserves Japanese, symbols, song, artist, score, hashtag and canonical link', () => {
  const result = resultSnapshot(chart, score);
  const intent = new URL(xIntent(result));
  assert.equal(intent.origin + intent.pathname, 'https://x.com/intent/tweet');
  assert.equal(intent.searchParams.get('text'), shareText(result));
  for (const value of [chart.title, chart.artist, '987,654点', '#T4P', APP_URL]) assert.ok(shareText(result).includes(value));
  assert.equal([...intent.searchParams].length, 1);
});
test('completed result survives chart changes and score resets', () => {
  const song = {...chart}, run = {...score, counts: {...score.counts}};
  const result = resultSnapshot(song, run);
  song.title = 'Next'; run.score = 0; run.counts.PERFECT = 0;
  assert.equal(result.title, chart.title); assert.equal(result.score, score.score);
  assert.equal(result.counts.PERFECT, 120);
  assert.ok(Object.isFrozen(result.counts));
});
test('zero score remains shareable', () => {
  assert.match(shareText(resultSnapshot(chart, {...score, score: 0})), /0点/);
});

test('app links preserve the exact draft on iOS, iPadOS and Android with a web fallback', () => {
  const result = resultSnapshot(chart, {...score, rankingPosition: 2});
  for (const device of [{userAgent:'iPhone'}, {userAgent:'iPad'}, {userAgent:'Macintosh', maxTouchPoints:5}]) {
    const url = new URL(xDestination(result, device));
    assert.equal(url.protocol, 'twitter:'); assert.equal(url.host, 'post');
    assert.equal(url.searchParams.get('message'), shareText(result));
  }
  const intent = xDestination(result, {userAgent:'Android'});
  assert.equal(new URL(intent).searchParams.get('text'), shareText(result));
  assert.equal(new URL(intent).host, 'x.com');
  assert.equal(new URL(intent).pathname, '/intent/tweet');
  assert.match(intent, /#Intent;scheme=https;/);
  assert.equal(new URL(intent).searchParams.has('message'), false);
  assert.match(intent, /package=com\.twitter\.android;/);
  assert.equal(decodeURIComponent(intent.split('S.browser_fallback_url=')[1].split(';end')[0]), xIntent(result));
  for (const device of [{userAgent:'Windows'}, {userAgent:'Macintosh',maxTouchPoints:0}]) assert.equal(xDestination(result,device),xIntent(result));
});

test('mobile opens the app link directly and reveals fallback only after tapping', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  try {
    for (const userAgent of ['iPhone', 'Android']) {
      Object.defineProperty(globalThis, 'navigator', {configurable:true,value:{userAgent,share:()=>assert.fail('No system share menu'),clipboard:{write:()=>assert.fail('Do not delay app navigation')}}});
      const {root,controller}=fixture(); controller.prepare=async()=>new Blob(['png']);
      controller.show(chart,score); await settle(); controller.setRanking(3);
      const [link,fallback]=root.children[1].children;
      assert.equal(link.target,'_blank'); assert.equal(fallback.hidden,true);
      await link.events.click({preventDefault(){assert.fail('Native anchor must navigate');}});
      assert.equal(fallback.hidden,false);
      assert.equal(root.hidden,false); assert.equal(root.children[0].textContent,'演奏結果をXでポストしよう！');
      assert.equal(fallback.target,'_blank'); assert.equal(controller.snapshot.title,chart.title);
      assert.equal(new URL(link.href).searchParams.get(userAgent === 'Android' ? 'text' : 'message'),shareText(controller.snapshot));
      assert.equal(fallback.href,xIntent(controller.snapshot));
      controller.clear(); assert.equal(controller.fallback,null);
    }
  } finally { if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else delete globalThis.navigator; }
});

// A small DOM fixture exercises asynchronous lifecycle without a browser dependency.
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.hidden = false; this.textContent = ''; this.events = {}; }
  append(...nodes) { nodes.forEach(node=>node.parent=this); this.children.push(...nodes); }
  click() { downloads.push({href:this.href,filename:this.download,target:this.target}); if(downloadError) throw downloadError; }
  remove() { if(this.parent)this.parent.children=this.parent.children.filter(node=>node!==this); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute() {}
  removeAttribute() {}
  addEventListener(name, handler) { this.events[name] = handler; }
}
function fixture() {
  const root = new Element('section');
  const controller = Object.create(ResultShare.prototype);
  controller.root = root; controller.version = 0;
  return {root, controller};
}
const downloads=[]; let downloadError=null;
globalThis.document = {body:new Element('body'),createElement: tag => new Element(tag)};
const settle = () => new Promise(resolve => setImmediate(resolve));
test('leaving results discards a PNG that finishes preparing later', async () => {
  const {root, controller} = fixture(); let ready;
  controller.prepare = () => new Promise(resolve => { ready = resolve; });
  controller.show(chart, score); controller.clear();
  ready(new Blob(['png'], {type:'image/png'})); await settle();
  assert.equal(root.hidden, true); assert.equal(root.children.length, 0); assert.equal(controller.imageURL, null);
});
test('image preparation failure keeps the X draft accessible', async () => {
  const {root, controller} = fixture(); controller.prepare = async () => { throw Error('canvas'); };
  controller.show(chart, score); await settle();
  assert.equal(root.children[1].children[0].href, xIntent(resultSnapshot(chart, score)));
  assert.match(root.children[2].textContent, /画像を作れません/);
});
test('a new result replaces the old draft and invalidates pending image work', async () => {
  const {root, controller} = fixture(); const resolvers = [];
  controller.prepare = () => new Promise(resolve => resolvers.push(resolve));
  controller.show(chart, score); controller.show({...chart, title:'Next song'}, {...score, score:0});
  resolvers[0](new Blob(['old'], {type:'image/png'})); await settle();
  assert.match(new URL(root.children[1].children[0].href).searchParams.get('text'), /Next song/);
  assert.equal(root.children.length, 3); assert.equal(controller.imageURL, null);
  controller.clear(); resolvers[1](new Blob(['new'])); await settle();
});

test('share template matches the requested wording and blank lines',()=>{
  const result=resultSnapshot({title:'Rolling',artist:'PHALUX',difficulty:'NORMAL'},{...score,score:886170,rank:'B'});
  assert.equal(shareText(result),`(自動保存された結果画像を添付してポストしてね)\n\n#T4P で ♬ Rolling / PHALUX をプレイしたよ！！🎮\n\n🎸NORMAL🎸\n🥈RANK B🥈\nスコア 886,170点\n\n${APP_URL}`);
  assert.equal(shareText({...result,rankingPosition:3}),`(自動保存された結果画像を添付してポストしてね)\n\n#T4P で ♬ Rolling / PHALUX をプレイしたよ！！🎮\n\n🎸NORMAL🎸\n🥈RANK B🥈\nスコア 886,170点\n👑3位にランクイン！！\n\n${APP_URL}`);
  for(const [rank,medal] of Object.entries({S:'💎',A:'🥇',B:'🥈',C:'🥉',D:'🌱'})) assert.ok(shareText({...result,rank}).includes(`${medal}RANK ${rank}${medal}`));
  for(const rankingPosition of [null,undefined,0,11,20,21,1.5])assert.ok(!shareText({...result,rankingPosition}).includes('位にランクイン'));
});
test('confirmed ranking updates the draft but clearing prevents carryover',()=>{
  const {root,controller}=fixture();controller.prepare=()=>new Promise(()=>{});
  controller.show(chart,score);controller.setRanking(2);
  assert.match(new URL(root.children[1].children[0].href).searchParams.get('text'),/👑2位/);
  controller.clear();controller.setRanking(1);
  controller.show(chart,score);
  assert.ok(!new URL(root.children[1].children[0].href).searchParams.get('text').includes('位にランクイン'));
});

test('X opens directly even when the device supports native file sharing',async()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  let shared=false, prevented=false;
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{canShare:()=>true,share:async()=>{shared=true;}}});
  try {
    const {root,controller}=fixture();controller.prepare=async()=>new Blob(['png'],{type:'image/png'});
    controller.show(chart,score);await settle();controller.setRanking(4);
    const link=root.children[1].children[0];
    await link.events.click({preventDefault(){prevented=true;}});
    assert.equal(shared,false);assert.equal(prevented,false);
    assert.equal(new URL(link.href).origin+new URL(link.href).pathname,'https://x.com/intent/tweet');
    assert.match(new URL(link.href).searchParams.get('text'),/👑4位/);
    assert.equal(link.target,'_blank');controller.clear();
  } finally {if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else delete globalThis.navigator;}
});
test('one X tap starts one named PNG download synchronously and keeps the result screen',async()=>{
  downloads.length=0;
  const {root,controller}=fixture();controller.prepare=async()=>new Blob(['png'],{type:'image/png'});
  controller.show(chart,score);await settle();
  const link=controller.link;
  link.events.click({preventDefault(){assert.fail('Keep the native new-tab navigation');}});
  assert.equal(downloads.length,1);assert.equal(downloads[0].href,controller.imageURL);
  assert.ok(downloads[0].filename.endsWith('-987654.png'));assert.doesNotMatch(downloads[0].filename,/[\\/:*?"<>|]/);
  assert.equal(downloads[0].target,controller.downloadFrame.name);assert.equal(controller.downloadFrame.tag,'iframe');
  assert.equal(document.body.children.length,1);assert.equal(controller.downloadFrame.hidden,true);
  assert.equal(root.children[1].children.length,1);assert.equal(link.textContent,'Xに投稿');
  assert.equal(root.children[3].children[0].tag,'img');assert.equal(root.hidden,false);
  assert.match(root.children[2].textContent,/保存を開始/);assert.doesNotMatch(root.children[2].textContent,/保存しました/);
  controller.clear();
});
test('image preparation blocks premature taps; generation failure still allows the X draft',async()=>{
  downloads.length=0;
  const {root,controller}=fixture();let reject;
  controller.prepare=()=>new Promise((resolve,no)=>{reject=no;});controller.show(chart,score);
  let prevented=false;controller.link.events.click({preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.equal(downloads.length,0);assert.equal(controller.link.textContent,'画像を準備中…');
  reject(Error('canvas'));await settle();prevented=false;
  controller.link.events.click({preventDefault(){prevented=true;}});
  assert.equal(prevented,false);assert.equal(downloads.length,0);assert.equal(controller.link.textContent,'Xに投稿');
  assert.match(root.children[2].textContent,/画像を保存できません/);controller.clear();
});
test('download failure never blocks the X draft or claims a completed save',async()=>{
  const {root,controller}=fixture();controller.prepare=async()=>new Blob(['png']);
  controller.show(chart,score);await settle();downloadError=Error('blocked');
  try {
    controller.link.events.click({preventDefault(){assert.fail('Text is still shareable');}});
    assert.match(root.children[2].textContent,/画像を保存できません/);
    assert.match(root.children[2].textContent,/長押し/);assert.equal(document.body.children.length,1);
  } finally {downloadError=null;controller.clear();}
});
test('stale result buttons cannot download a new run or navigate',async()=>{
  downloads.length=0;const {controller}=fixture();controller.prepare=async()=>new Blob(['png']);
  controller.show(chart,score);await settle();const old=controller.link;
  controller.show({...chart,title:'Next'},score);await settle();let prevented=false;
  old.events.click({preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(downloads.length,0);
  controller.clear();
});
test('shared URL uses the supplied short link',()=>assert.equal(APP_URL,'https://x.gd/T4P_game'));
test('X cannot open an unranked draft while registration is pending, then uses the confirmed rank',async()=>{
  const {controller}=fixture(); controller.prepare=async()=>new Blob(['png']);
  controller.show(chart,score); await settle(); controller.setRankingPending(true);
  let prevented=false;
  await controller.link.events.click({preventDefault(){prevented=true;}});
  assert.equal(prevented,true); assert.equal(controller.link.textContent,'ランキング確認中…');
  controller.setRanking(3); controller.setRankingPending(false);
  prevented=false;
  await controller.link.events.click({preventDefault(){prevented=true;}});
  assert.equal(prevented,false); assert.equal(controller.link.textContent,'Xに投稿');
  assert.match(new URL(controller.link.href).searchParams.get('text'),/👑3位にランクイン！！/);
  controller.clear(); assert.equal(controller.rankingPending,false);
});
test('ranking identity is the registered play ID, not a matching name or score',async()=>{
  const {registeredRank}=await import('./leaderboard.mjs');
  const entries=[{name:'同名',score:123,playId:'other'},{name:'同名',score:123,playId:'current'}];
  assert.equal(registeredRank(entries,'current'),2);assert.equal(registeredRank(entries,'missing'),null);assert.equal(registeredRank(entries,null),null);
});

test('top preview is separate from posting controls and clears between results',async()=>{
  const {root,controller}=fixture();const preview=new Element('div');controller.previewRoot=preview;
  const pending=[];controller.prepare=()=>new Promise(resolve=>pending.push(resolve));
  controller.show(chart,score);assert.equal(preview.hidden,true);
  pending.shift()(new Blob(['first']));await settle();
  assert.equal(preview.hidden,false);assert.equal(preview.children.length,1);
  assert.equal(preview.children[0].children[0].tag,'img');assert.equal(root.children.length,3);
  controller.show({...chart,title:'Next'},score);
  assert.equal(preview.hidden,true);assert.equal(preview.children.length,0);
  controller.clear();pending.shift()(new Blob(['late']));await settle();
  assert.equal(preview.hidden,true);assert.equal(preview.children.length,0);
});

