import { RhythmEngine } from './engine.mjs?v=hold2';
import { midiToChart } from './midi.mjs';
const $ = id => document.getElementById(id);
const ui = Object.fromEntries(['canvas','stage','score','accuracy','combo','judgment','countdown','overlay','overlay-title','overlay-eyebrow','overlay-description','overlay-foot','start','restart','pause','result','status','progress','elapsed','settings','best-score'].map(id => [id, $(id)]));
const g = ui.canvas.getContext('2d');
const buttons = [...document.querySelectorAll('[data-lane]')];
const colors = ['#7deaff','#7deaff','#ff8dda','#ff8dda'];
const keyCodes = ['KeyQ','KeyW','KeyE','KeyR'];
const publishedMidiPath = 'rhythm/charts/rolling.mid';
const inputSources = [new Set(), new Set(), new Set(), new Set()];
const flashes = [0,0,0,0];
let chart, defaultChart, engine, context, gain, buffer, source, tapBuffer, tapGain;
let tapPromise;
let mode = 'loading', startAt = 0, resumeAt = 0, frozenTime = -2.5, judgmentUntil = 0;
let width = 800, height = 600, lastHud = 0, requestId = 0;
let settings = { speed: 5, offset: 0, volume: 70, tapVolume: 70 };
const settingsKey = 'kaichi-rhythm-settings-v1';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
try {
  const saved = JSON.parse(localStorage.getItem(settingsKey) || '{}');
  for (const [key,min,max] of [['speed',2,9],['offset',-250,250],['volume',0,100],['tapVolume',0,100]]) {
    if (Number.isFinite(saved[key])) settings[key] = Math.max(min, Math.min(max, saved[key]));
  }
} catch { /* Storage may be disabled; gameplay does not depend on it. */ }
for (const key of ['speed','offset','volume','tapVolume']) {
  $(key).value = settings[key];
  const update = () => {
    settings[key] = Number($(key).value);
    $(`${key}-value`).textContent = key === 'speed' ? settings[key].toFixed(1) : key === 'offset' ? `${settings[key] > 0 ? '+' : ''}${settings[key]} ms` : `${settings[key]}%`;
    if (gain) gain.gain.value = settings.volume / 100;
    if (tapGain) tapGain.gain.value = settings.tapVolume / 100 * .4;
    try { localStorage.setItem(settingsKey, JSON.stringify(settings)); } catch { /* optional */ }
  };
  $(key).addEventListener('input', update); update();
}
function bestKey() { return `kaichi-rhythm-best-hold80-${chart.id}`; }
function readBest() { try { return Number(localStorage.getItem(bestKey())) || 0; } catch { return 0; } }
function bestUI() { const n = readBest(); ui['best-score'].textContent = n ? n.toLocaleString() : '—'; }
function resetInputs() {
  inputSources.forEach(s => s.clear()); buttons.forEach(b => b.classList.remove('active'));
  if (engine) engine.held.fill(false);
}
function stopSource() {
  if (source) { source.onended = null; try { source.stop(); } catch { /* already ended */ } source.disconnect(); source = null; }
}
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
    tapGain = context.createGain(); tapGain.gain.value = settings.tapVolume / 100 * .4; tapGain.connect(master);
    context.addEventListener('statechange', () => { if (context.state !== 'running' && mode === 'playing') pause(); });
  }
  await context.resume();
}
async function loadTap() {
  if (tapBuffer) return;
  if (!tapPromise) tapPromise = (async () => {
    const r = await fetch('rhythm/tap.wav');
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
  await loadTap();
  if (!buffer) {
    const response = await fetch(chart.audio);
    if (!response.ok) throw new Error(`音源を読み込めませんでした（${response.status}）。`);
    buffer = await context.decodeAudioData(await response.arrayBuffer());
  }
}
function schedule(from, leadIn) {
  stopSource();
  const playFrom = Math.max(0, from);
  const when = context.currentTime + leadIn + Math.max(0, -from);
  startAt = when - playFrom;
  resumeAt = context.currentTime + leadIn;
  source = context.createBufferSource(); source.buffer = buffer; source.connect(gain);
  source.start(when, playFrom);
  mode = 'playing'; ui.overlay.hidden = true; ui.pause.disabled = false;
  ui.settings.disabled = true; ui.status.textContent = 'PLAYING — Q / W / E / R';
  $('midi-controls').disabled = true;
}
async function startGame() {
  if (!chart || mode === 'playing' || (mode === 'loading' && !ui.start.disabled)) return;
  const token = ++requestId;
  mode = 'loading'; ui.start.disabled = true; ui.start.textContent = '音源を読み込み中…';
  $('midi-controls').disabled = true;
  ui.status.textContent = '音源を準備しています';
  try {
    await loadAudio();
    if (token !== requestId) return;
    resetInputs(); engine = new RhythmEngine(chart, onJudge);
    frozenTime = -2.5; ui.result.hidden = true; ui.restart.hidden = true;
    ui.combo.textContent = ''; ui.judgment.style.opacity = 0; judgmentUntil = 0;
    schedule(-2.5, .10);
    ui.start.blur();
    if (document.hidden) pause();
  } catch (error) {
    $('midi-controls').disabled = false;
    mode = 'error'; ui.status.textContent = '読み込みエラー';
    showOverlay('LOAD ERROR', '読み込みをやり直してください', error.message, '再読み込み');
  }
}
function pause() {
  if (mode !== 'playing') return;
  frozenTime = Math.max(-2.5, Math.min(songTime(), chart.duration));
  if (context.currentTime >= resumeAt) engine.tick(frozenTime - settings.offset / 1000);
  mode = 'paused'; stopSource(); resetInputs();
  ui.pause.disabled = true; ui.settings.disabled = false; ui.countdown.textContent = '';
  $('midi-controls').disabled = false;
  ui.restart.hidden = false; ui.result.hidden = true;
  ui.status.textContent = 'PAUSED — 再開まで譜面も音楽も止まります';
  showOverlay('PAUSED', 'ひとやすみ。', '再開すると2秒後に演奏が続きます。長押しの途中なら、再開前に同じキーを押してください。', 'プレイを再開');
}
async function resume() {
  if (mode !== 'paused') return;
  ui.start.disabled = true;
  try {
    await context.resume();
    schedule(frozenTime, 2);
    ui.start.blur();
  } catch { ui.start.disabled = false; ui.status.textContent = '音声を再開できませんでした。もう一度お試しください。'; }
}
function finish() {
  if (mode !== 'playing') return;
  engine.tick(chart.duration + 1);
  frozenTime = chart.duration; mode = 'results'; stopSource(); resetInputs();
  updateHud();
  ui.pause.disabled = true; ui.settings.disabled = false; ui.restart.hidden = true;
  $('midi-controls').disabled = false;
  const best = readBest();
  if (engine.score > best) { try { localStorage.setItem(bestKey(), String(engine.score)); } catch { /* optional */ } }
  bestUI();
  const fullCombo = engine.counts.MISS === 0;
  const allPerfect = engine.counts.PERFECT === engine.units;
  const rank = engine.accuracy >= 97 ? 'S' : engine.accuracy >= 90 ? 'A' : engine.accuracy >= 80 ? 'B' : engine.accuracy >= 65 ? 'C' : 'D';
  showOverlay(allPerfect ? 'ALL PERFECT' : fullCombo ? 'FULL COMBO' : 'SONG COMPLETE', `RANK ${rank}`, engine.score > best ? 'NEW PERSONAL BEST!' : '最後までプレイしてくれてありがとう。', 'もう一度プレイ');
  ui.result.hidden = false;
  ui.result.replaceChildren();
  const score = document.createElement('div'); score.className = 'result-score'; score.textContent = engine.score.toLocaleString(); ui.result.append(score);
  const stats = document.createElement('div'); stats.className = 'result-stats';
  for (const [label, value] of [...Object.entries(engine.counts), ['MAX COMBO', engine.maxCombo], ['ACCURACY', `${engine.accuracy.toFixed(2)}%`]]) {
    const row = document.createElement('div'), name = document.createElement('span'), number = document.createElement('b');
    name.textContent = label; number.textContent = value; row.append(name, number); stats.append(row);
  }
  ui.result.append(stats); ui.status.textContent = 'COMPLETE — おつかれさまでした';
}
function onJudge({ label, lane, delta }) {
  const now = performance.now(); judgmentUntil = now + 550;
  ui.judgment.replaceChildren(document.createTextNode(label));
  ui.judgment.style.color = label === 'MISS' ? '#a1afc8' : label === 'GOOD' ? '#ffc390' : label === 'GREAT' ? '#ffacf0' : '#b9ffff';
  ui.judgment.style.opacity = 1;
  if (label === 'GREAT' || label === 'GOOD') { const small = document.createElement('small'); small.textContent = delta < 0 ? 'FAST' : 'LATE'; ui.judgment.append(small); }
  if (label !== 'MISS') flashes[lane] = now;
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
  if (event.code === 'Escape') { event.preventDefault(); if (!event.repeat) { if (mode === 'playing') pause(); else if (mode === 'paused') resume(); } return; }
  if (lane >= 0 && mode === 'playing') { event.preventDefault(); if (!event.repeat) inputDown(lane, 'keyboard'); }
});
window.addEventListener('keyup', event => { const lane = keyCodes.indexOf(event.code); if (lane >= 0) inputUp(lane, 'keyboard'); });
buttons.forEach((button, lane) => {
  button.addEventListener('pointerdown', event => { event.preventDefault(); button.setPointerCapture(event.pointerId); inputDown(lane, event.pointerId); });
  for (const type of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(type, event => inputUp(lane, event.pointerId));
});
window.addEventListener('blur', pause);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('pagehide', () => { ++requestId; pause(); stopSource(); });
ui.start.addEventListener('click', () => { if (mode === 'paused') resume(); else if (!chart) loadChart(); else startGame(); });
ui.restart.addEventListener('click', startGame);
ui.pause.addEventListener('click', pause);
$('tap-preview').addEventListener('click', async () => {
  const button = $('tap-preview'); button.disabled = true;
  try { await ensureAudioContext(); await loadTap(); playTap(); ui.status.textContent = 'タップ音を再生しました'; }
  catch (error) { ui.status.textContent = error.message; }
  finally { button.disabled = false; }
});
function useChart(next, label) {
  ++requestId; stopSource(); resetInputs(); chart = next;
  engine = new RhythmEngine(chart,onJudge); frozenTime = -2.5; mode = 'ready';
  ui.settings.disabled = false; ui.pause.disabled = true; $('midi-controls').disabled = false;
  ui.result.hidden = true; ui.restart.hidden = true; ui.countdown.textContent = '';
  ui.combo.textContent = ''; delete ui.combo.dataset.value; ui.judgment.style.opacity = 0;
  $('bpm').textContent = `${chart.bpm} BPM`; $('chart-name').textContent = label;
  $('midi-reset').hidden = !chart.midi;
  bestUI(); updateHud();
  showOverlay('READY TO ROLL?', '音楽に、飛び込もう。', 'Q・W・E・Rに指を置いてスタート。冒頭1分のテスト版です。', '▶ START GAME');
  ui.status.textContent = `READY — ${chart.notes.length} NOTES / Q W E R`;
}
$('midi-file').addEventListener('change', async event => {
  const file=event.target.files[0];if(!file||!defaultChart)return;
  const previousMode=mode; mode='loading';
  const previousDisabled=ui.start.disabled; ui.start.disabled=true; ui.restart.disabled=true; $('midi-controls').disabled=true;
  try {
    if(file.size>2*1024*1024)throw new Error('MIDIは2 MB以下にしてください。');
    const next=midiToChart(await file.arrayBuffer(),defaultChart);
    useChart(next,file.name);
    $('midi-message').textContent=midiMessage(next);
  } catch(error) { mode=previousMode; $('midi-message').textContent=error.message;ui.start.disabled=previousDisabled; }
  finally { $('midi-controls').disabled=false;ui.restart.disabled=false;event.target.value=''; }
});
function midiMessage(next) {
  const messages=[`${next.notes.length}ノーツを読み込みました。`];
  if(next.midi.tempoFallback)messages.push('冒頭のテンポ指定がないため162 BPMとして読み込みました。');
  if(next.midi.ignored)messages.push(`割り当て外の${next.midi.ignored}音は除外しました。`);
  if(next.midi.clipped)messages.push('1分以降の音符は省略・短縮しました。');
  return messages.join(' ');
}
async function loadPublishedMidi() {
  if (!defaultChart || mode === 'playing') return;
  const previousMode=mode, previousDisabled=ui.start.disabled;
  mode='loading'; ui.start.disabled=true; ui.restart.disabled=true; $('midi-controls').disabled=true;
  $('midi-message').textContent='公開MIDIを確認しています…';
  try {
    const response=await fetch(`${publishedMidiPath}?updated=${Date.now()}`, {cache:'no-store'});
    if(response.status===404)throw new Error('公開MIDIはまだありません。rhythm/charts/rolling.mid に配置してください。現在の譜面でプレイできます。');
    if(!response.ok)throw new Error(`公開MIDIを読み込めませんでした（${response.status}）。現在の譜面を維持します。`);
    const bytes=await response.arrayBuffer();
    if(bytes.byteLength>2*1024*1024)throw new Error('MIDIは2 MB以下にしてください。');
    const next=midiToChart(bytes,defaultChart);
    useChart(next,'rolling.mid（公開MIDI）');
    $('midi-message').textContent=midiMessage(next);
  } catch(error) {
    mode=previousMode; ui.start.disabled=previousDisabled;
    $('midi-message').textContent=error.message;
  } finally { $('midi-controls').disabled=false; ui.restart.disabled=false; }
}
$('midi-reload').addEventListener('click',loadPublishedMidi);
$('midi-reset').addEventListener('click',()=>{useChart(defaultChart,'テスト譜面');$('midi-message').textContent='';});
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
    if(!reduceMotion && now-flashes[lane]<240){g.globalAlpha=(1-(now-flashes[lane])/240)*.4;laneQuad(lane,.55,1.01,colors[lane]);g.globalAlpha=1;}
  }
  const approach = 3.8 - settings.speed * .32;
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
  g.font='9px Arial';g.fillStyle='#96a3bf';g.textAlign='center';g.fillText('JUDGE LINE',width/2,height*.865);
}
function clockString(time) { time=Math.floor(Math.max(0,time));return `${Math.floor(time/60)}:${String(time%60).padStart(2,'0')}`; }
function updateHud() {
  ui.score.textContent = String(engine?.score || 0).padStart(7,'0');
  ui.accuracy.textContent = `${(engine?.accuracy ?? 100).toFixed(2)}%`;
  const combo = engine?.combo || 0;
  if (ui.combo.dataset.value !== String(combo)) {
    ui.combo.dataset.value = combo; ui.combo.replaceChildren();
    if(combo>=2){ui.combo.append(document.createTextNode(combo));const small=document.createElement('small');small.textContent='COMBO';ui.combo.append(small);}
  }
  const time=songTime();ui.elapsed.textContent=`${clockString(time)} / ${clockString(chart?.duration || 60)}`;ui.progress.style.width=`${Math.max(0,Math.min(100,time/(chart?.duration || 60)*100))}%`;
}
function frame(now) {
  const resumeCountdown = mode==='playing' && context.currentTime < resumeAt;
  const time = resumeCountdown ? frozenTime-settings.offset/1000 : judgeTime();
  if(mode==='playing') {
    if(!resumeCountdown) engine.tick(time);
    const remain=resumeCountdown?resumeAt-context.currentTime:-songTime();
    ui.countdown.textContent=remain>0?String(Math.ceil(remain)):'';
    if(songTime()>=Math.max(buffer.duration,chart.duration)+.2)finish();
  }
  draw(engine?time:-2.5,now);
  if(now>judgmentUntil)ui.judgment.style.opacity=0;
  if(now-lastHud>70){updateHud();lastHud=now;}
  requestAnimationFrame(frame);
}
async function loadChart() {
  try {
    mode='loading';ui.start.disabled=true;
    const response=await fetch('rhythm/rolling-chart.json');
    if(!response.ok)throw new Error(`譜面を読み込めませんでした（${response.status}）。`);
    defaultChart=await response.json();
    useChart(defaultChart,'テスト譜面');
    await loadPublishedMidi();
  } catch(error) {mode='error';showOverlay('LOAD ERROR','譜面を読み込めませんでした',error.message,'再読み込み');ui.status.textContent='読み込みエラー';}
}
loadChart();resize();requestAnimationFrame(frame);
