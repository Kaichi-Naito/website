import { ResultTransition } from './result-transition.mjs?v=finish-guard-v19';
import { ResultShare } from './result-share.mjs?v=result-footer-v21';
import { loadCatalog } from './catalog.mjs?v=test30-fix-v1';
import { RhythmEngine } from './engine.mjs?v=empty-miss-v1';
import { midiToChart } from './midi.mjs?v=song-select-v1';
import { Leaderboard } from './leaderboard.mjs?v=compact-result-v20';
import { approachSeconds, tapLevel, readSettings } from './settings.mjs?v=song-select-v1';
const $ = id => document.getElementById(id);
const ui = Object.fromEntries(['canvas','stage','score','accuracy','accuracy-meter','accuracy-fill','combo','judgment','countdown','overlay','overlay-title','overlay-eyebrow','overlay-description','overlay-foot','start','restart','pause','result','status','progress','elapsed','settings','best-score'].map(id => [id, $(id)]));
const g = ui.canvas.getContext('2d');
const buttons = [...document.querySelectorAll('[data-lane]')];
const colors = ['#7deaff','#7deaff','#ff8dda','#ff8dda'];
const keyCodes = ['KeyQ','KeyW','KeyE','KeyR'];
const judgmentColors = {PERFECT:'#ffe37a',GREAT:'#c4a2ff',GOOD:'#80e5b0',MISS:'#ff6f8a',EMPTY:'#ff6f8a'};
const flashColors=[...colors], errors=[0,0,0,0], bursts=[];
let songs=[], selectedIndex=-1, chartRequest=0, wheelTimer;
const wheel=$('song-wheel');
const inputSources = [new Set(), new Set(), new Set(), new Set()];
const flashes = [-Infinity,-Infinity,-Infinity,-Infinity];
let chart, engine, context, gain, buffer, source, tapBuffer, tapGain;
let tapPromise;
const audioDataCache=new Map(),audioBufferCache=new Map(),audioFetchPromises=new Map(),audioDecodePromises=new Map();
let scrollLockState=null;
const resultTransition = new ResultTransition();
let mode = 'loading', startAt = 0, resumeAt = 0, frozenTime = -2.5, judgmentUntil = 0;
let width = 800, height = 600, lastHud = 0, requestId = 0;
const settingsKey = 'kaichi-rhythm-settings-v3';
let savedSettings = {};
try {
  const current = localStorage.getItem(settingsKey);
  if (current) savedSettings = JSON.parse(current);
  else {
    const old = JSON.parse(localStorage.getItem('kaichi-rhythm-settings-v2') || '{}');
    savedSettings = {offset:old.offset,speed:old.speed};
  }
} catch {}
let settings = readSettings(savedSettings);
const resultShare = new ResultShare($('result-share'), $('result-image'));
const leaderboard = new Leaderboard({
  onRanked:position => resultShare.setRanking(position),
  onRankingState:(state, position) => {
    const notice=$('result-ranking-notice');
    notice.hidden=state==='clear'; notice.dataset.state=state;
    notice.textContent={
      checking:'ランキングを確認しています…',
      eligible:`👑登録すると現在${position}位！名前を登録してランクインしよう。`,
      submitting:'ランキングに登録しています…',
      verifying:'登録完了。順位を確認しています…',
      ranked:`👑${position}位にランクイン！！`,
      kept:position ? `自己ベストは現在${position}位。今回は記録の更新がありません。` : '前回の自己ベストを保持しました。',
      unranked:'今回はランキング圏外です。',
      unconfirmed:'登録済み・順位の反映待ちです。順位付きで投稿するには「ランキングを更新」を押してください。',
      failed:'ランキングを確認できませんでした。順位なしの結果を投稿できます。',
      skipped:'ランキング登録をスキップしました。',
      clear:''
    }[state] || '';
    resultShare.setRankingPending(state==='submitting'||state==='verifying');
  }
});
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
let reduceMotion = motionPreference.matches;
motionPreference.addEventListener('change', event => { reduceMotion = event.matches; bursts.length = 0; });
for (const key of ['speed','offset','volume','tapVolume']) {
  $(key).value = settings[key];
  const update = () => {
    settings[key] = Number($(key).value);
    $(`${key}-value`).textContent = key === 'speed' ? settings[key].toFixed(1) : key === 'offset' ? `${settings[key] > 0 ? '+' : ''}${settings[key]} ms` : `${settings[key]}%`;
    if (gain) gain.gain.value = settings.volume / 100;
    if (tapGain) tapGain.gain.value = tapLevel(settings.tapVolume);
    try { localStorage.setItem(settingsKey, JSON.stringify(settings)); } catch { /* optional */ }
  };
  $(key).addEventListener('input', update); update();
}
function bestKey() { return `kaichi-rhythm-best-beat-v4-${chart.catalogId}-${chart.duration}-${chart.id}`; }
function readBest() { try { return Number(localStorage.getItem(bestKey())) || 0; } catch { return 0; } }
function bestUI() { const n = readBest(); ui['best-score'].textContent = n ? n.toLocaleString() : '—'; }
function resetInputs() {
  inputSources.forEach(s => s.clear()); buttons.forEach(b => b.classList.remove('active'));
  if (engine) engine.held.fill(false);
}
function stopSource() {
  if (source) { source.onended = null; try { source.stop(); } catch { /* already ended */ } source.disconnect(); source = null; }
}
function lockPageScroll() {
  if(scrollLockState)return;
  const rect=$('play-workspace').getBoundingClientRect();
  const viewportHeight=window.visualViewport?.height || window.innerHeight;
  const target=Math.max(0,window.scrollY+rect.top-Math.max(0,(viewportHeight-rect.height)/2));
  window.scrollTo(0,target);
  const body=document.body;
  scrollLockState={y:window.scrollY,position:body.style.position,top:body.style.top,left:body.style.left,right:body.style.right,width:body.style.width};
  body.style.position='fixed';body.style.top=`-${scrollLockState.y}px`;body.style.left='0';body.style.right='0';body.style.width='auto';
  document.documentElement.classList.add('play-scroll-locked');
}
function unlockPageScroll() {
  if(!scrollLockState)return;
  const body=document.body,state=scrollLockState;scrollLockState=null;
  document.documentElement.classList.remove('play-scroll-locked');
  body.style.position=state.position;body.style.top=state.top;body.style.left=state.left;body.style.right=state.right;body.style.width=state.width;
  window.scrollTo(0,state.y);
}
// Fixed body alone does not prevent all iOS root/visual viewport gestures.
for (const type of ['touchmove','wheel']) document.addEventListener(type,event=>{
  if(scrollLockState && event.cancelable) event.preventDefault();
},{passive:false,capture:true});
// Use the hardware output timestamp when available so audio buffering does not shift judgment.
function audibleTime() {
  if (!context) return 0;
  if (context.getOutputTimestamp) {
    const stamp = context.getOutputTimestamp();
    if (stamp.contextTime > 0 && stamp.performanceTime > 0) {
      const estimate = stamp.contextTime + (performance.now() - stamp.performanceTime) / 1000;
      if (Math.abs(estimate - context.currentTime) < .5) return estimate;
    }
  }
  return context.currentTime - (context.outputLatency || 0);
}
function songTime() { return mode === 'playing' ? (context.currentTime < resumeAt ? frozenTime : audibleTime() - startAt) : frozenTime; }
function judgeTime() { return songTime() - settings.offset / 1000; }
function showOverlay(eyebrow, title, description, button) {
  ui.overlay.classList.toggle('is-results', mode === 'results');
  $('overlay-card').scrollTop = 0;
  ui.overlay.hidden = false;
  ui['overlay-eyebrow'].textContent = eyebrow;
  ui['overlay-title'].textContent = title;
  ui['overlay-description'].textContent = description;
  ui.start.textContent = button; ui.start.disabled = false;
}
async function ensureAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error('このブラウザーは音声再生に対応していません。');
  if (!context) {
    context = new AudioContextClass({ latencyHint: 'interactive' });
    const master = context.createDynamicsCompressor();
    master.threshold.value=-1;master.knee.value=0;master.ratio.value=20;master.attack.value=.001;master.release.value=.06;
    master.connect(context.destination);
    gain = context.createGain(); gain.gain.value = settings.volume / 100; gain.connect(master);
    tapGain = context.createGain(); tapGain.gain.value = tapLevel(settings.tapVolume); tapGain.connect(master);
    context.addEventListener('statechange', () => { if (context.state !== 'running' && mode === 'playing') pause(); });
  }
  await context.resume();
}
function fetchAudioData(path) {
  if(audioDataCache.has(path))return Promise.resolve(audioDataCache.get(path));
  if(audioFetchPromises.has(path))return audioFetchPromises.get(path);
  const promise=(async()=>{
    const response=await fetch(path,{cache:'no-cache'});
    if(!response.ok)throw new Error(`音源を読み込めませんでした（${response.status}）。`);
    const data=await response.arrayBuffer();audioDataCache.set(path,data);return data;
  })().finally(()=>audioFetchPromises.delete(path));
  audioFetchPromises.set(path,promise);return promise;
}
function decodeSong(path) {
  if(audioBufferCache.has(path))return Promise.resolve(audioBufferCache.get(path));
  if(audioDecodePromises.has(path))return audioDecodePromises.get(path);
  if(!context)return Promise.reject(new Error('音声再生を準備できませんでした。'));
  const promise=(async()=>{
    const data=await fetchAudioData(path);
    // Some browsers detach the ArrayBuffer passed to decodeAudioData, so keep the cached bytes intact.
    const decoded=await context.decodeAudioData(data.slice(0));audioBufferCache.set(path,decoded);return decoded;
  })().finally(()=>audioDecodePromises.delete(path));
  audioDecodePromises.set(path,promise);return promise;
}
function preloadAudio(path) {
  const fetched=fetchAudioData(path);
  if(context)fetched.then(()=>decodeSong(path)).catch(()=>{});
  return fetched.catch(()=>null);
}
async function loadTap() {
  if (tapBuffer) return;
  if (!tapPromise) tapPromise = (async () => {
    const r = await fetch('rhythm/tap.wav', {cache:'no-cache'});
    if (!r.ok) throw new Error(`タップ音を読み込めませんでした（${r.status}）。`);
    tapBuffer = await context.decodeAudioData(await r.arrayBuffer());
  })().catch(error => { tapPromise = null; throw error; });
  await tapPromise;
}
function playTap() {
  if (!tapBuffer || context?.state !== 'running' || !settings.tapVolume) return;
  const tap = context.createBufferSource(); tap.buffer = tapBuffer; tap.connect(tapGain);
  tap.onended = () => tap.disconnect(); tap.start();
}
async function loadAudio() {
  await ensureAudioContext();
  const [songBuffer]=await Promise.all([decodeSong(chart.audio),loadTap()]);
  buffer=songBuffer;
}
function schedule(from, leadIn) {
  stopSource();
  const playFrom = Math.max(0, from);
  const when = context.currentTime + leadIn + Math.max(0, -from);
  startAt = when - playFrom;
  resumeAt = context.currentTime + leadIn;
  source = context.createBufferSource(); source.buffer = buffer; source.connect(gain);
  const remaining = Math.max(0, Math.min(chart.duration, buffer.duration) - playFrom);
  source.start(when, playFrom, remaining);
  $('back-to-select').disabled=false;
  mode = 'playing';lockPageScroll();ui.overlay.hidden = true; ui.pause.disabled = false;
  ui.settings.disabled = true; ui.status.textContent = 'PLAYING — Q / W / E / R';
}
async function startGame() {
  if (!chart || mode === 'playing' || mode === 'loading' || mode === 'finishing') return;
  resultTransition.cancel(); $('result-transition').hidden=true;
  clearTimeout(wheelTimer); ++chartRequest;
  resultShare.clear(); ui.result.hidden=true; leaderboard.clearResult();
  $('selection-screen').hidden=true; $('play-workspace').hidden=false; resize();
  $('settings-dialog').close();
  showOverlay('LOADING', chart.title, '音源を準備しています。', '音源を読み込み中…');
  const token = ++requestId;
  mode = 'loading'; ui.start.disabled = true; ui.start.textContent = '音源を読み込み中…';
  $('back-to-select').disabled=true;
  ui.status.textContent = '音源を準備しています';
  try {
    await loadAudio();
    if (token !== requestId) return;
    resetInputs(); bursts.length=0; flashes.fill(-Infinity); errors.fill(0); engine = new RhythmEngine(chart, onJudge);
    leaderboard.clearResult();
    frozenTime = -2.5; ui.result.hidden = true; ui.restart.hidden = true;
    ui.combo.textContent = ''; ui.judgment.style.opacity = 0; judgmentUntil = 0;
    schedule(-2.5, .10);
    ui.start.blur();
    if (document.hidden) pause();
  } catch (error) {
    if (token !== requestId) return;
    $('back-to-select').disabled=false;
    mode = 'error'; ui.status.textContent = '読み込みエラー';
    showOverlay('LOAD ERROR', '読み込みをやり直してください', error.message, '再読み込み');
  }
}
function pause() {
  if (mode !== 'playing') return;
  frozenTime = Math.max(-2.5, Math.min(songTime(), chart.duration));
  if (context.currentTime >= resumeAt) engine.tick(frozenTime - settings.offset / 1000);
  mode = 'paused'; stopSource(); resetInputs();unlockPageScroll();
  ui.pause.disabled = true; ui.settings.disabled = false; ui.countdown.textContent = '';
  ui.restart.hidden = false; ui.result.hidden = true;
  ui.status.textContent = 'PAUSED — 再開まで譜面も音楽も止まります';
  showOverlay('PAUSED', 'ひとやすみ。', '再開すると2秒後に演奏が続きます。長押しの途中なら、再開前に同じキーを押してください。', 'プレイを再開');
}
async function resume() {
  if (mode !== 'paused') return;
  const token = requestId;
  ui.start.disabled = true;
  try {
    await context.resume();
    if (token !== requestId || mode !== 'paused') return;
    schedule(frozenTime, 2);
    ui.start.blur();
  } catch { ui.start.disabled = false; ui.status.textContent = '音声を再開できませんでした。もう一度お試しください。'; }
}
function finish() {
  if (mode !== 'playing') return;
  engine.tick(chart.duration + 1);
  frozenTime = chart.duration; mode = 'finishing'; stopSource(); resetInputs();
  ui.pause.disabled=true; ui.settings.disabled=true; ui.countdown.textContent='';
  ui.status.textContent='結果集計中…';
  resultTransition.begin(performance.now());
  $('result-transition-fill').style.width='0%';
  $('result-transition-progress').setAttribute('aria-valuenow','0');
  $('result-transition').hidden=false;
  updateHud();
}
function showResults() {
  if(mode!=='finishing')return;
  resultTransition.cancel(); $('result-transition').hidden=true;
  mode='results'; unlockPageScroll();
  updateHud();
  ui.pause.disabled = true; ui.settings.disabled = false; ui.restart.hidden = true;
  const best = readBest();
  if (engine.score > best) { try { localStorage.setItem(bestKey(), String(engine.score)); } catch { /* optional */ } }
  bestUI();
  const fullCombo = engine.counts.MISS === 0 && engine.emptyPresses === 0;
  const allPerfect = fullCombo && engine.counts.PERFECT === engine.units;
  const rank = engine.accuracy >= 97 ? 'S' : engine.accuracy >= 90 ? 'A' : engine.accuracy >= 80 ? 'B' : engine.accuracy >= 65 ? 'C' : 'D';
  showOverlay(allPerfect ? 'ALL PERFECT' : fullCombo ? 'FULL COMBO' : 'SONG COMPLETE', `RANK ${rank}`, engine.score > best ? 'NEW PERSONAL BEST!' : '最後までプレイしてくれてありがとう！！！', 'もう一度プレイ');
  ui.result.hidden = false;
  ui.result.replaceChildren();
  const brand = document.createElement('img'); brand.src=chart.jacket; brand.alt=`${chart.title} ジャケット`; brand.className='result-jacket';
  const song = document.createElement('p'); song.className='result-song'; song.textContent=chart.title;
  const artist = document.createElement('span'); artist.className='result-artist'; artist.textContent=` / ${chart.artist}`; song.append(artist);
  const difficulty = document.createElement('small'); difficulty.textContent=chart.difficulty; song.append(difficulty);
  ui.result.append(brand, song);
  const score = document.createElement('div'); score.className = 'result-score'; score.textContent = engine.score.toLocaleString(); ui.result.append(score);
  resultShare.show(chart, {score:engine.score, accuracy:engine.accuracy, maxCombo:engine.maxCombo, emptyPresses:engine.emptyPresses, counts:engine.counts, rank});
  leaderboard.showResult({score:engine.score,accuracy:Number(engine.accuracy.toFixed(2)),maxCombo:engine.maxCombo,units:engine.units,emptyPresses:engine.emptyPresses,counts:{...engine.counts}});
  ui.status.textContent = 'COMPLETE — おつかれさまでした';
}
function onJudge({label,lane,delta,sustain}) {
  const now=performance.now(); judgmentUntil=now+550;
  ui.judgment.replaceChildren(document.createTextNode(label==='EMPTY'?'MISS':label));
  ui.judgment.style.color=judgmentColors[label];ui.judgment.style.opacity=1;
  if(label==='GREAT'||label==='GOOD'){const small=document.createElement('small');small.textContent=delta<0?'FAST':'LATE';ui.judgment.append(small);}
  if(label==='MISS'||label==='EMPTY')errors[lane]=now;
  else {
    flashes[lane]=now;flashColors[lane]=judgmentColors[label];
    if(!reduceMotion){bursts.push({lane,at:now,color:judgmentColors[label],sustain});if(bursts.length>36)bursts.shift();}
  }
}
function inputDown(lane, sourceId) {
  if (mode !== 'playing') return;
  const s = inputSources[lane]; if (s.has(sourceId)) return;
  const wasHeld = s.size > 0; s.add(sourceId); buttons[lane].classList.add('active');
  if (!wasHeld) {
    playTap();
    if (context.currentTime < resumeAt) engine.held[lane] = true;
    else engine.press(lane, judgeTime());
  }
}
function inputUp(lane, sourceId) {
  const s = inputSources[lane]; if (!s.delete(sourceId)) return;
  if (!s.size) {
    buttons[lane].classList.remove('active');
    if (mode === 'playing') {
      if (context.currentTime < resumeAt) engine.held[lane] = false;
      else engine.release(lane, judgeTime());
    }
  }
}
window.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
  const lane = keyCodes.indexOf(event.code);
  const typing = event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.matches('input,textarea,select'));
  if (typing || $('settings-dialog').open) return;
  if ((event.code === 'Escape' || event.code === 'Space') && (mode === 'playing' || mode === 'paused')) { event.preventDefault(); if (!event.repeat) { if (mode === 'playing') pause(); else if (mode === 'paused') resume(); } return; }
  if (lane >= 0 && mode === 'playing') { event.preventDefault(); if (!event.repeat) inputDown(lane, 'keyboard'); }
});
window.addEventListener('keyup', event => { const lane = keyCodes.indexOf(event.code); if (lane >= 0) inputUp(lane, 'keyboard'); });
buttons.forEach((button, lane) => {
  button.addEventListener('pointerdown', event => { event.preventDefault(); button.setPointerCapture(event.pointerId); inputDown(lane, event.pointerId); });
  for (const type of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(type, event => inputUp(lane, event.pointerId));
});
// Physical contacts outlive scoring input resets at the end of a song.
window.addEventListener('pointerdown',event=>{
  if(mode==='playing'||mode==='finishing')resultTransition.press(`pointer:${event.pointerId}`,performance.now());
  if(mode==='finishing'&&event.cancelable)event.preventDefault();
},{capture:true,passive:false});
for(const type of ['pointerup','pointercancel']) window.addEventListener(type,event=>{
  resultTransition.release(`pointer:${event.pointerId}`,performance.now());
},true);
window.addEventListener('keydown',event=>{
  if((mode==='playing'||mode==='finishing')&&keyCodes.includes(event.code))resultTransition.press(event.code,performance.now());
  if(mode==='finishing'&&!event.ctrlKey&&!event.metaKey&&!event.altKey)event.preventDefault();
},true);
window.addEventListener('keyup',event=>resultTransition.release(event.code,performance.now()),true);
window.addEventListener('click',event=>{
  if(mode==='finishing'){event.preventDefault();event.stopImmediatePropagation();}
},true);
window.addEventListener('blur', () => {resultTransition.releaseAll(performance.now());pause();});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('pagehide', () => { ++requestId; pause(); stopSource();unlockPageScroll(); });
ui.start.addEventListener('click', () => { if (mode === 'paused') resume(); else startGame(); });
ui.restart.addEventListener('click', startGame);
ui.pause.addEventListener('click', pause);
$('settings-open').addEventListener('click',()=>{
  if(mode==='playing')pause();
  if(mode==='loading'||mode==='finishing')return;
  $('settings-dialog').showModal();
});
$('back-to-select').addEventListener('click',showSelection);
$('play-selected').addEventListener('click',startGame);
$('catalog-retry').addEventListener('click',loadSongs);
$('song-prev').addEventListener('click',()=>selectSong(selectedIndex-1,true));
$('song-next').addEventListener('click',()=>selectSong(selectedIndex+1,true));
wheel.addEventListener('keydown',event=>{
  if(mode!=='select'||$('selection-screen').hidden)return;
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();selectSong(selectedIndex+(event.key==='ArrowDown'?1:-1),true);}
  if(event.key==='Enter'&&!$('play-selected').disabled){event.preventDefault();startGame();}
});
wheel.addEventListener('scroll',()=>{
  clearTimeout(wheelTimer);
  if(mode!=='select'||$('selection-screen').hidden)return;
  wheelTimer=setTimeout(()=>{
    if(mode!=='select'||$('selection-screen').hidden)return;
    const center=wheel.scrollTop+wheel.clientHeight/2;
    let nearest=selectedIndex,distance=Infinity;
    [...wheel.children].forEach((item,index)=>{const d=Math.abs(item.offsetTop-wheel.offsetTop+item.offsetHeight/2-center);if(d<distance){distance=d;nearest=index;}});
    if(nearest!==selectedIndex){wheel.dispatchEvent(new Event('song-scroll-select'));selectSong(nearest,false);}
  },110);
});
function showSelection() {
  if(mode==='finishing')return;
  resultTransition.cancel(); $('result-transition').hidden=true;
  clearTimeout(wheelTimer); ++chartRequest;
  resultShare.clear();
  ++requestId;stopSource();resetInputs();unlockPageScroll();mode='select';frozenTime=-2.5;
  $('selection-screen').hidden=false;$('play-workspace').hidden=true;ui.overlay.hidden=true;
  ui.pause.disabled=true;ui.settings.disabled=false;leaderboard.clearResult();
  ui.status.textContent='MUSIC SELECT';
  $('play-selected').focus();
}
function useChart(next) {
  if(mode!=='select'||$('selection-screen').hidden)return;
  resultShare.clear();
  stopSource();resetInputs();chart=next;buffer=audioBufferCache.get(next.audio)||null;preloadAudio(next.audio);
  leaderboard.clearResult();leaderboard.setChart(next,`${next.title} / ${next.difficulty}`);
  engine=new RhythmEngine(chart,onJudge);frozenTime=-2.5;mode='select';
  ui.settings.disabled=false;ui.pause.disabled=true;ui.result.hidden=true;ui.restart.hidden=true;
  ui.countdown.textContent='';ui.combo.textContent='';delete ui.combo.dataset.value;ui.judgment.style.opacity=0;
  $('playing-jacket').src=chart.jacket;$('playing-jacket').alt=`${chart.title} ジャケット`;
  $('playing-artist').textContent=chart.artist;$('playing-title').textContent=chart.title;
  $('playing-difficulty').textContent=chart.difficulty;$('bpm').textContent=`${chart.bpm} BPM`;
  $('playing-duration').textContent=clockString(chart.duration);
  $('stage-song').textContent=chart.title;$('stage-artist').textContent=chart.artist;
  bestUI();updateHud();ui.status.textContent='MUSIC SELECT';
}
async function selectSong(index,scroll) {
  if(!songs.length||mode!=='select'||$('selection-screen').hidden)return;
  index=Math.max(0,Math.min(songs.length-1,index));
  if(index===selectedIndex&&chart)return;
  selectedIndex=index;const song=songs[index],token=++chartRequest;
  preloadAudio(song.audio);
  chart=null;engine=null;mode='select';
  $('play-selected').disabled=true;$('play-selected').textContent='譜面を読み込み中…';
  $('selection-status').textContent='';$('catalog-retry').hidden=true;
  $('song-position').textContent=`${String(index+1).padStart(2,'0')} / ${String(songs.length).padStart(2,'0')}`;
  $('selected-title').textContent=song.title;$('selected-artist').textContent=song.artist;
  $('selected-jacket').src=song.jacket;$('selected-jacket').alt=`${song.title} ジャケット`;
  $('selected-difficulty').textContent=song.difficulty;$('selected-bpm').textContent=`${song.bpm} BPM`;
  $('selected-duration').textContent=clockString(song.duration);
  $('song-prev').disabled=index===0;$('song-next').disabled=index===songs.length-1;
  [...wheel.children].forEach((item,i)=>item.setAttribute('aria-selected',String(i===index)));
  wheel.setAttribute('aria-activedescendant',`song-option-${index}`);
  if(scroll)wheel.children[index].scrollIntoView({block:'center',behavior:reduceMotion?'instant':'smooth'});
  leaderboard.clearResult();leaderboard.clearChart(`${song.title} / ${song.difficulty}`);
  try {
    const response=await fetch(`${song.midiPath}?updated=${Date.now()}`,{cache:'no-store'});
    if(!response.ok)throw new Error(`譜面を読み込めませんでした（${response.status}）。`);
    const next=midiToChart(await response.arrayBuffer(),song);
    if(token!==chartRequest||mode!=='select'||$('selection-screen').hidden)return;
    useChart(next);$('selected-bpm').textContent=`${next.bpm} BPM`;
    $('play-selected').disabled=false;$('play-selected').textContent='▶ PLAY';
    $('selection-status').textContent=`${next.notes.length}ノーツ / 長押しは1拍ごとに加点`;
  } catch(error) {
    if(token!==chartRequest||mode!=='select'||$('selection-screen').hidden)return;
    $('selection-status').textContent=error.message;$('play-selected').textContent='プレイできません';$('catalog-retry').hidden=false;
  }
}
async function loadSongs() {
  const token=++chartRequest;
  selectedIndex=-1;chart=null;engine=null;mode='select';
  $('play-selected').disabled=true;$('catalog-retry').hidden=true;
  $('selection-status').textContent='楽曲一覧を読み込んでいます…';
  try {
    const next=await loadCatalog();if(token!==chartRequest)return;songs=next;wheel.replaceChildren();
    songs.forEach((song,index)=>{
      const item=document.createElement('div');item.className='song-option';item.id=`song-option-${index}`;
      item.setAttribute('role','option');item.setAttribute('aria-selected','false');
      const img=document.createElement('img');img.src=song.jacket;img.alt='';img.loading='lazy';
      const details=document.createElement('div'),title=document.createElement('strong'),artist=document.createElement('small'),level=document.createElement('em');
      title.textContent=song.title;artist.textContent=song.artist;level.textContent=song.difficulty;
      details.append(title,artist,level);item.append(img,details);item.addEventListener('click',()=>selectSong(index,true));wheel.append(item);
    });
    await selectSong(0,false);
  } catch(error) {if(token===chartRequest){$('selection-status').textContent=error.message;$('catalog-retry').hidden=false;$('play-selected').textContent='プレイできません';}}
}
function resize() {
  const r = ui.stage.getBoundingClientRect(); width = r.width; height = r.height;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  ui.canvas.width = Math.round(width * dpr); ui.canvas.height = Math.round(height * dpr); g.setTransform(dpr,0,0,dpr,0,0);
}
new ResizeObserver(resize).observe(ui.stage);
function point(lane, depth) {
  const spread = width * (.24 + .60 * depth);
  return { x: width / 2 + (lane / 4 - .5) * spread, y: height * (.07 + .76 * depth) };
}
function polygon(points, fill, stroke) {
  g.beginPath(); points.forEach((p,i) => i ? g.lineTo(p.x,p.y) : g.moveTo(p.x,p.y)); g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.stroke(); }
}
function laneQuad(lane, d1, d2, fill, stroke) { polygon([point(lane,d1),point(lane+1,d1),point(lane+1,d2),point(lane,d2)],fill,stroke); }
function draw(time, now) {
  g.clearRect(0,0,width,height);
  const sky = g.createLinearGradient(0,0,0,height); sky.addColorStop(0,'#0c122d'); sky.addColorStop(1,'#100c21'); g.fillStyle=sky; g.fillRect(0,0,width,height);
  // Static stars keep the stage legible without a distracting background video.
  g.fillStyle='#526b984f'; for(let i=0;i<35;i++){const x=(i*137.7)%width,y=(i*83.1)%(height*.77);g.fillRect(x,y,1,1);}
  for (let lane=0;lane<4;lane++) {
    laneQuad(lane,0,1.04,lane<2?'#102338b8':'#261b38b8','#53688744');
    if (engine?.held[lane]) laneQuad(lane,.1,1.02,lane<2?'#7deaff14':'#ff8dda14');
    const hitAge = now - flashes[lane];
    if(hitAge >= 0 && hitAge < 320){
      // Reduced motion keeps a stationary highlight instead of hiding feedback.
      g.globalAlpha = reduceMotion ? .32 : (1-hitAge/320)*.55;
      laneQuad(lane,.70,1.01,flashColors[lane]); g.globalAlpha=1;
    }
  }
  const approach = approachSeconds(settings.speed);
  const beat = 60 / (chart?.bpm || 162);
  for (let k=Math.floor(time/beat);k<(time+approach)/beat+1;k++) {
    const d=1-(k*beat-time)/approach;if(d<0||d>1)continue;
    g.beginPath();const a=point(0,d),b=point(4,d);g.moveTo(a.x,a.y);g.lineTo(b.x,b.y);g.strokeStyle=k%4===0?'#667aa54a':'#667aa51c';g.lineWidth=1;g.stroke();
  }
  if (engine) {
    for (const n of engine.notes) {
      if (n.state==='done'||n.state==='miss')continue;
      const d=1-(n.t-time)/approach;
      if(d<0||d>1.20 && !n.end)continue;
      if(n.end) {
        const tail=Math.max(0,1-(n.end-time)/approach);
        const head=n.state==='holding'?1:Math.min(1.08,d);
        if(tail>1.12)continue;
        const a=point(n.lane+.17,tail),b=point(n.lane+.83,tail),c=point(n.lane+.83,head),e=point(n.lane+.17,head);
        polygon([a,b,c,e],n.state==='holding'?'#b9ffb880':'#82eac74d','#a9ffd280');
        const cap=point(n.lane+.5,tail);g.fillStyle='#d6ffce';g.fillRect(cap.x-5,cap.y-2,10,4);
      }
      const nd=n.state==='holding'?1:d;
      const left=point(n.lane+.06,nd),right=point(n.lane+.94,nd);
      const noteHeight=4+nd*8;
      g.shadowBlur=reduceMotion?0:12;g.shadowColor=n.end?'#abffd5':colors[n.lane];
      g.fillStyle=n.end?'#b9ffbf':colors[n.lane];g.fillRect(left.x,left.y-noteHeight/2,right.x-left.x,noteHeight);
      g.shadowBlur=0;g.fillStyle='#f2ffff';g.fillRect(left.x+1,left.y-noteHeight/2,right.x-left.x-2,2);
    }
  }
  const a=point(0,1),b=point(4,1);g.lineWidth=3;g.strokeStyle='#ecf8ff';g.shadowBlur=15;g.shadowColor='#b0d5ff';g.beginPath();g.moveTo(a.x,a.y);g.lineTo(b.x,b.y);g.stroke();g.shadowBlur=0;g.lineWidth=1;
  for(let lane=0;lane<4;lane++) {
    const p=point(lane+.5,1),age=now-errors[lane];
    if(age<240){g.globalAlpha=(1-age/240)*.65;g.strokeStyle=judgmentColors.MISS;g.lineWidth=3;g.beginPath();g.moveTo(p.x-8,p.y-8);g.lineTo(p.x+8,p.y+8);g.moveTo(p.x+8,p.y-8);g.lineTo(p.x-8,p.y+8);g.stroke();g.globalAlpha=1;}
    const hitAge=now-flashes[lane];
    if(hitAge>=0 && hitAge<320){
      const left=point(lane+.10,1),right=point(lane+.90,1);
      g.fillStyle=flashColors[lane];g.fillRect(left.x,p.y-7,right.x-left.x,14);
      g.fillStyle='#fff';g.fillRect(left.x,p.y-2,right.x-left.x,4);
    }
  }
  for(let i=bursts.length-1;i>=0;i--) {
    const burst=bursts[i],age=(now-burst.at)/360;if(age>=1){bursts.splice(i,1);continue;}
    const p=point(burst.lane+.5,1),size=burst.sustain?.65:1;
    g.globalAlpha=1-age;g.strokeStyle=burst.color;g.fillStyle=burst.color;g.lineWidth=2;
    g.beginPath();g.ellipse(p.x,p.y,(8+age*32)*size,(5+age*16)*size,0,0,Math.PI*2);g.stroke();
    for(let k=0;k<8;k++){const angle=k*Math.PI/4,x=p.x+Math.cos(angle)*(8+age*55)*size,y=p.y+Math.sin(angle)*(8+age*36)*size-age*14;g.fillRect(x-2,y-2,4,4);}
    g.globalAlpha=1;
  }
}
function clockString(time) { time=Math.floor(Math.max(0,time));return `${Math.floor(time/60)}:${String(time%60).padStart(2,'0')}`; }
function updateHud() {
  ui.score.textContent = String(engine?.score || 0).padStart(7,'0');
  const accuracy = engine?.accuracy ?? 100;
  ui.accuracy.textContent = `${accuracy.toFixed(2)}%`;
  ui['accuracy-fill'].style.width = `${accuracy}%`;
  ui['accuracy-meter'].setAttribute('aria-valuenow', accuracy.toFixed(2));
  const combo = engine?.combo || 0;
  if (ui.combo.dataset.value !== String(combo)) {
    ui.combo.dataset.value = combo; ui.combo.replaceChildren();
    if(combo>=2){ui.combo.append(document.createTextNode(combo));const small=document.createElement('small');small.textContent='COMBO';ui.combo.append(small);}
  }
  const time=songTime();ui.elapsed.textContent=`${clockString(time)} / ${clockString(chart?.duration || 30)}`;ui.progress.style.width=`${Math.max(0,Math.min(100,time/(chart?.duration || 30)*100))}%`;
}
function frame(now) {
  const resumeCountdown = mode==='playing' && context.currentTime < resumeAt;
  const time = resumeCountdown ? frozenTime-settings.offset/1000 : judgeTime();
  if(mode==='playing') {
    if(!resumeCountdown) engine.tick(time);
    const remain=resumeCountdown?resumeAt-context.currentTime:-songTime();
    ui.countdown.textContent=remain>0?String(Math.ceil(remain)):'';
    if(songTime()>=Math.min(buffer.duration,chart.duration)+.2)finish();
  }
  if(mode==='finishing') {
    const percent=Math.round(resultTransition.progress(now)*100);
    $('result-transition-fill').style.width=`${percent}%`;
    $('result-transition-progress').setAttribute('aria-valuenow',String(percent));
    $('result-transition-hint').textContent=resultTransition.held.size ? '指を離すと結果を表示します' : 'まもなく結果を表示します';
    if(resultTransition.ready(now) && !document.hidden)showResults();
  }
  // Event and effect ages must use the same clock, including slow desktop frames.
  draw(engine?time:-2.5,performance.now());
  if(now>judgmentUntil)ui.judgment.style.opacity=0;
  if(now-lastHud>70){updateHud();lastHud=now;}
  requestAnimationFrame(frame);
}
loadSongs();resize();requestAnimationFrame(frame);
