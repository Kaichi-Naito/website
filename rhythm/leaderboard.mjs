import { readSheet } from './sheets.mjs?v=song-select-v1';
export const RULESET = 'beat-hold-v4';
const MAX_RANKING_ENTRIES=20;
export function registeredRank(entries, playId) {
  if (!playId) return null;
  const index = entries.findIndex(entry => entry.playId === playId);
  return index >= 0 && index < MAX_RANKING_ENTRIES ? index + 1 : null;
}
const PLAYER_STORAGE_KEY = 't4p-player-id-v1';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function getPlayerId(storage) {
  try {
    storage ||= globalThis.localStorage;
    const previous = storage.getItem(PLAYER_STORAGE_KEY);
    if (UUID.test(previous || '')) return previous;
    const id = crypto.randomUUID(); storage.setItem(PLAYER_STORAGE_KEY, id);
    return storage.getItem(PLAYER_STORAGE_KEY) === id ? id : null;
  } catch { return null; }
}
export async function playerKey(playerId, key) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`t4p-player-v1:${playerId}:${key}`));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2,'0')).join('');
}
export function uniqueBestEntries(entries) {
  const seen = new Set();
  return [...entries].sort((a,b) => b.score-a.score || b.accuracy-a.accuracy || b.maxCombo-a.maxCombo || String(a.registeredAt).localeCompare(String(b.registeredAt))).filter(entry => {
    if (!/^[a-f0-9]{64}$/.test(entry.playerKey || '')) return true; // Legacy identities are unknown.
    if (seen.has(entry.playerKey)) return false;
    seen.add(entry.playerKey); return true;
  });
}
const receiverChecks = new Map();
async function requirePlayerBestReceiver(endpoint) {
  if (!receiverChecks.has(endpoint)) receiverChecks.set(endpoint, sendScore(endpoint,{action:'capabilities'}).then(response => {
    if (response.capabilities?.playerBest !== true) throw new Error('old receiver');
  }).catch(() => {
    receiverChecks.delete(endpoint);
    throw new Error('登録プログラムの更新確認ができませんでした。管理者はApps Scriptを最新版に更新してください。');
  }));
  await receiverChecks.get(endpoint);
}
const $ = id => document.getElementById(id);
export async function chartKey(chart) {
  const normalized=JSON.stringify({song:chart.catalogId || chart.title,rules:RULESET,duration:chart.duration,notes:chart.notes.map(n=>[Math.round(n.t*1e6),n.lane,n.end?Math.round(n.end*1e6):null,n.ticks?.map(t=>Math.round(t*1e6))??[]])});
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
}
export function validEndpoint(value) {
  return typeof value==='string' && /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(value.trim());
}
export function validName(value) {
  const name=value.trim();
  if(!name || Array.from(name).length>16 || /[\u0000-\u001f\u007f]/u.test(name)) throw new Error('名前は1〜16文字で入力してください。');
  return name;
}
function beatsCutoff(candidate,cutoff) {
  if(candidate.score!==cutoff.score)return candidate.score>cutoff.score;
  if(candidate.accuracy!==cutoff.accuracy)return candidate.accuracy>cutoff.accuracy;
  if(candidate.maxCombo!==cutoff.maxCombo)return candidate.maxCombo>cutoff.maxCombo;
  // An existing score keeps its place when every ranking value is tied.
  return false;
}
// New ties follow existing scores; replacing a player's best consumes one place.
export function projectedRank(entries, stats, ownKey) {
  const others = entries.filter(entry => !ownKey || entry.playerKey !== ownKey);
  const position = 1 + others.filter(entry => !beatsCutoff(stats, entry)).length;
  return position <= MAX_RANKING_ENTRIES ? position : null;
}
function sendScore(endpoint,payload) {
  return new Promise((resolve,reject)=>{
    const requestId=crypto.randomUUID(), frame=document.createElement('iframe'), form=document.createElement('form');
    frame.name=`score_${requestId}`; frame.hidden=true;frame.title='スコア登録';
    form.method='POST';form.action=endpoint;form.target=frame.name;form.hidden=true;
    for(const [name,value] of Object.entries({payload:JSON.stringify(payload),requestId})) {
      const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.append(input);
    }
    const cleanup=()=>{clearTimeout(timer);window.removeEventListener('message',receive);form.remove();frame.remove();};
    const receive=event=>{
      if(!/^https:\/\/(?:(?:[a-z0-9-]+-)?script\.googleusercontent\.com|script\.google\.com)$/.test(event.origin))return;
      const data=event.data;if(data?.type!=='rhythm-score-result'||data.requestId!==requestId)return;
      cleanup();if(data.ok)resolve(data);else reject(new Error(data.error||'スコアを登録できませんでした。'));
    };
    const timer=setTimeout(()=>{cleanup();reject(new Error('登録結果を確認できませんでした。同じボタンで再試行できます。'));},25000);
    window.addEventListener('message',receive);document.body.append(frame,form);form.submit();
  });
}
function ensureSubmitProgress() {
  let panel=$('score-submit-progress');
  if(panel)return panel;
  const style=document.createElement('style');
  style.textContent=`
    #score-submit-progress{margin:10px 0 4px}
    #score-submit-progress-track{height:10px;padding:2px;background:#0b0f1a;border:1px solid;border-color:#060810 #68728a #68728a #060810;overflow:hidden}
    #score-submit-progress-fill{height:100%;width:0;background:linear-gradient(90deg,var(--cyan),var(--mint));transition:width .18s ease-out}
    #score-submit-progress[data-state="error"] #score-submit-progress-fill{background:#ff6f8a}
    @media(prefers-reduced-motion:reduce){#score-submit-progress-fill{transition:none}}
  `;
  document.head.append(style);
  panel=document.createElement('div');panel.id='score-submit-progress';panel.hidden=true;
  const track=document.createElement('div');track.id='score-submit-progress-track';track.setAttribute('role','progressbar');track.setAttribute('aria-label','ランキング登録の進行状況');track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','100');
  const fill=document.createElement('div');fill.id='score-submit-progress-fill';track.append(fill);panel.append(track);
  $('score-message').insertAdjacentElement('afterend',panel);
  return panel;
}
export class Leaderboard {
  constructor({onRanked = () => {}, onRankingState = () => {}} = {}) {
    this.onRankingState = onRankingState;
    this.playerId = getPlayerId();
    this.onRanked = onRanked; this.registeredPlayId = null;
    this.generation=0;this.result=null;this.endpoint='';this.submitting=false;this.progressTimer=0;this.progressValue=0;this.entries=[];
    this.progress=ensureSubmitProgress();
    $('ranking-refresh').addEventListener('click',()=>this.refresh());
    $('score-form').addEventListener('submit',event=>{event.preventDefault();this.submit();});
    $('score-skip').addEventListener('click',()=>{
      if(this.submitting)return;
      this.result=null;$('score-form').hidden=true;this.resetProgress();
      this.onRankingState('skipped');
      $('score-message').hidden=false;$('score-message').textContent='今回は登録をスキップしました。';
    });
  }
  resetProgress() {
    clearInterval(this.progressTimer);this.progressTimer=0;this.progressValue=0;
    this.progress.hidden=true;this.progress.dataset.state='';
    const fill=$('score-submit-progress-fill'),track=$('score-submit-progress-track');
    fill.style.width='0%';track.removeAttribute('aria-valuenow');track.setAttribute('aria-valuetext','待機中');
  }
  startProgress() {
    clearInterval(this.progressTimer);this.progress.hidden=false;this.progress.dataset.state='running';this.progressValue=8;
    const fill=$('score-submit-progress-fill'),track=$('score-submit-progress-track');
    fill.style.width='8%';track.setAttribute('aria-valuenow','8');track.setAttribute('aria-valuetext','ランキングに登録中');
    this.progressTimer=setInterval(()=>{
      const step=this.progressValue<45?7:this.progressValue<70?4:this.progressValue<84?2:1;
      this.progressValue=Math.min(90,this.progressValue+step);
      fill.style.width=`${this.progressValue}%`;track.setAttribute('aria-valuenow',String(this.progressValue));
    },220);
  }
  finishProgress() {
    clearInterval(this.progressTimer);this.progressTimer=0;this.progressValue=100;this.progress.dataset.state='done';
    const fill=$('score-submit-progress-fill'),track=$('score-submit-progress-track');
    fill.style.width='100%';track.setAttribute('aria-valuenow','100');track.setAttribute('aria-valuetext','登録処理完了');
    setTimeout(()=>{if(!this.submitting)this.progress.hidden=true;},700);
  }
  failProgress() {
    clearInterval(this.progressTimer);this.progressTimer=0;this.progress.dataset.state='error';
    const fill=$('score-submit-progress-fill'),track=$('score-submit-progress-track');
    fill.style.width='100%';track.setAttribute('aria-valuenow','100');track.setAttribute('aria-valuetext','登録エラー');
  }
  clearChart(label) {
    ++this.generation;this.keyPromise=null;this.chart=null;this.entries=[];
    $('ranking-chart').textContent=label;$('ranking-rows').replaceChildren();
    $('ranking-status').textContent='譜面を確認しています…';$('ranking-refresh').disabled=true;
  }
  setChart(chart,label) {
    this.chart=chart;this.keyPromise=chartKey(chart);this.entries=[];
    $('ranking-chart').textContent=`${label} / ${chart.notes.length}ノーツ`;
    this.refresh();
  }
  async refresh() {
    if(!this.keyPromise)return false;
    const generation=++this.generation;
    $('ranking-refresh').disabled=true;$('ranking-status').textContent='ランキングを読み込み中…';
    $('ranking-rows').replaceChildren();
    try {
      const key=await this.keyPromise;
      const query=`select B,C,D,E,H,I,P where F = '${key}' and G = '${RULESET}' order by C desc,D desc,E desc,H asc`;
      const [scores,config]=await Promise.all([
        readSheet('スコア','A1:R',query),
        readSheet('設定','A1:B2').catch(()=>[])
      ]);
      if(generation!==this.generation)return false;
      const endpoint=config[0]?.c?.[1]?.v;
      this.endpoint=validEndpoint(endpoint)?endpoint.trim():'';
      const entries=scores.map(r=>({
        name:r.c?.[0]?.v,
        score:Number(r.c?.[1]?.v),
        accuracy:Number(r.c?.[2]?.v),
        maxCombo:Number(r.c?.[3]?.v),
        registeredAt:r.c?.[4]?.v,
        playId:r.c?.[5]?.v,
        playerKey:r.c?.[6]?.v
      }));
      this.render(entries);
      return true;
    } catch(error) {
      if(generation===this.generation){this.entries=[];$('ranking-status').textContent=error.message;}
      return false;
    } finally { if(generation===this.generation)$('ranking-refresh').disabled=false; }
  }
  render(entries) {
    this.entries=uniqueBestEntries(entries).filter(e=>typeof e.name==='string' && Number.isFinite(e.score) && Number.isFinite(e.accuracy) && Number.isFinite(e.maxCombo)).slice(0,MAX_RANKING_ENTRIES);
    $('ranking-rows').replaceChildren();
    this.entries.forEach((entry,i)=>{
      const row=document.createElement('tr');
      for(const value of [i+1,entry.name,entry.score.toLocaleString()]) {
        const cell=document.createElement('td');cell.textContent=value;row.append(cell);
      }
      row.title=`精度 ${entry.accuracy.toFixed(2)}% / 最大コンボ ${entry.maxCombo}`;
      $('ranking-rows').append(row);
    });
    if (this.registeredPlayId) {
      const position = registeredRank(this.entries, this.registeredPlayId);
      this.onRanked(position);
      if (position) {
        this.onRankingState('ranked', position);
        $('score-message').textContent = `👑${position}位にランクイン！！`;
      }
    }
    const any=this.entries.length>0;
    $('ranking-status').textContent=any?'自己ベスト順 / 上位20人':'この譜面の登録はまだありません。';
  }
  qualifies(stats) {
    if(this.entries.length<MAX_RANKING_ENTRIES)return true;
    return beatsCutoff(stats,this.entries[MAX_RANKING_ENTRIES-1]);
  }
  clearResult() {
    this.onRankingState('clear');
    this.registeredPlayId = null;
    this.result=null;$('score-form').hidden=true;$('score-message').hidden=true;this.resetProgress();
  }
  async showResult(stats) {
    this.onRankingState('checking');
    this.registeredPlayId = null;
    const result=this.result={...stats,playId:crypto.randomUUID(),ruleset:RULESET,song:this.chart.title,songId:this.chart.catalogId,difficulty:this.chart.difficulty,playerId:this.playerId,keyPromise:this.keyPromise};
    $('player-name').value='';$('score-form').hidden=true;this.resetProgress();
    $('score-message').hidden=false;$('score-message').textContent='ランキング判定中…';

    const loaded=await this.refresh();
    if(this.result!==result)return;
    if(!loaded) {
      this.onRankingState('failed');
      this.result=null;
      $('score-message').hidden=false;$('score-message').textContent='ランキングを確認できなかったため、今回は登録できませんでした。';
      return;
    }
    if (!result.playerId) {
      this.onRankingState('failed');
      this.result=null; $('score-message').textContent='プレイヤーIDを保存できないため登録できません。ブラウザのサイトデータ保存を有効にしてください。'; return;
    }
    const ownKey = await playerKey(result.playerId, await result.keyPromise);
    if (this.result !== result) return;
    const previous = this.entries.find(entry => entry.playerKey === ownKey);
    if (previous && stats.score <= previous.score) {
      this.onRankingState('kept', this.entries.indexOf(previous) + 1);
      this.result=null; $('score-message').textContent=`自己ベスト ${previous.score.toLocaleString()} 点を保持しました。今回のスコアは重複登録しません。`; return;
    }
    const position = projectedRank(this.entries, stats, ownKey);
    if(!position) {
      this.onRankingState('unranked');
      this.result=null;
      const cutoff=this.entries[MAX_RANKING_ENTRIES-1];
      $('score-message').hidden=false;
      $('score-message').textContent=`ランキング20位圏外でした。現在の20位は ${cutoff.score.toLocaleString()} 点です。`;
      return;
    }

    this.onRankingState('eligible', position);
    $('score-form').hidden=false;$('score-message').hidden=true;
    $('score-submit').disabled=false;$('score-skip').disabled=false;
  }
  async submit() {
    if(!this.result||this.submitting)return;
    const result=this.result;
    try {
      const name=validName($('player-name').value);
      this.onRankingState('submitting');
      this.submitting=true;$('score-submit').disabled=true;$('score-skip').disabled=true;
      $('score-message').hidden=false;$('score-message').textContent='ランキングに登録中…';this.startProgress();
      if(!this.endpoint) {
        const config=await readSheet('設定','A1:B2');const endpoint=config[0]?.c?.[1]?.v;
        if(validEndpoint(endpoint))this.endpoint=endpoint.trim();
      }
      if(!this.endpoint)throw new Error('登録先にまだ接続されていません。管理者による初回設定が必要です。');
      await requirePlayerBestReceiver(this.endpoint);
      const {keyPromise,...stats}=result;
      const response=await sendScore(this.endpoint,{...stats,name,chartKey:await keyPromise});
      if(this.result!==result)return;

      this.result=null;$('score-form').hidden=true;this.finishProgress();
      if(response.registration?.personalBestKept) {
        this.onRankingState('kept');
        this.registeredPlayId=null; this.onRanked(null);
        $('score-message').hidden=false;
        $('score-message').textContent=`自己ベスト ${Number(response.registration.score).toLocaleString()} 点を保持しました。今回のスコアは重複登録しません。`;
      } else if(response.registration?.qualified===false) {
        this.onRankingState('unranked');
        $('score-message').hidden=false;
        $('score-message').textContent='直前にランキングが更新されたため20位圏外となり、登録されませんでした。';
      } else {
        this.registeredPlayId = result.playId;
        this.onRankingState('verifying');
        $('score-message').hidden=false;$('score-message').textContent='ランキングに登録しました！ 順位を確認しています…';
      }
      $('ranking-status').textContent='ランキングを更新中…';
      if (this.registeredPlayId) await this.confirmRegisteredRank(result.playId);
      else await this.refresh();
    } catch(error) {
      if(this.result===result)this.onRankingState('failed');
      if(this.result===result){this.failProgress();$('score-message').hidden=false;$('score-message').textContent=error.message;}
    } finally {
      this.submitting=false;$('score-submit').disabled=false;$('score-skip').disabled=false;
    }
  }
  async confirmRegisteredRank(playId, wait = ms => new Promise(resolve => setTimeout(resolve, ms))) {
    for (const delay of [0, 1000, 2500, 5000]) {
      if (delay) await wait(delay);
      if (this.registeredPlayId !== playId) return;
      const loaded = await this.refresh();
      if (this.registeredPlayId !== playId) return;
      if (loaded && registeredRank(this.entries, playId)) return;
    }
    if (this.registeredPlayId !== playId) return;
    this.onRankingState('unconfirmed');
    $('score-message').hidden=false;
    $('score-message').textContent='登録は完了しましたが、順位の反映を確認できませんでした。「ランキングを更新」で再確認できます。';
  }
}
