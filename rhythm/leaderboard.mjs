import { readSheet } from './sheets.mjs?v=song-select-v1';
export const RULESET = 'beat-hold-v4';
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
  constructor() {
    this.generation=0;this.result=null;this.endpoint='';this.submitting=false;this.progressTimer=0;this.progressValue=0;
    this.progress=ensureSubmitProgress();
    $('ranking-refresh').addEventListener('click',()=>this.refresh());
    $('score-form').addEventListener('submit',event=>{event.preventDefault();this.submit();});
    $('score-skip').addEventListener('click',()=>{
      if(this.submitting)return;
      this.result=null;$('score-form').hidden=true;this.resetProgress();
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
    // Apps Script cannot stream intermediate progress. Ease toward 90% as waiting feedback;
    // 100% is shown only after the server confirms that the score was saved.
    this.progressTimer=setInterval(()=>{
      const step=this.progressValue<45?7:this.progressValue<70?4:this.progressValue<84?2:1;
      this.progressValue=Math.min(90,this.progressValue+step);
      fill.style.width=`${this.progressValue}%`;track.setAttribute('aria-valuenow',String(this.progressValue));
    },220);
  }
  finishProgress() {
    clearInterval(this.progressTimer);this.progressTimer=0;this.progressValue=100;this.progress.dataset.state='done';
    const fill=$('score-submit-progress-fill'),track=$('score-submit-progress-track');
    fill.style.width='100%';track.setAttribute('aria-valuenow','100');track.setAttribute('aria-valuetext','登録完了');
    setTimeout(()=>{if(!this.submitting)this.progress.hidden=true;},700);
  }
  failProgress() {
    clearInterval(this.progressTimer);this.progressTimer=0;this.progress.dataset.state='error';
    const fill=$('score-submit-progress-fill'),track=$('score-submit-progress-track');
    fill.style.width='100%';track.setAttribute('aria-valuenow','100');track.setAttribute('aria-valuetext','登録エラー');
  }
  clearChart(label) {
    ++this.generation;this.keyPromise=null;this.chart=null;
    $('ranking-chart').textContent=label;$('ranking-rows').replaceChildren();
    $('ranking-status').textContent='譜面を確認しています…';$('ranking-refresh').disabled=true;
  }
  setChart(chart,label) {
    this.chart=chart;this.keyPromise=chartKey(chart);
    $('ranking-chart').textContent=`${label} / ${chart.notes.length}ノーツ`;
    this.refresh();
  }
  async refresh() {
    if(!this.keyPromise)return;
    const generation=++this.generation;
    $('ranking-refresh').disabled=true;$('ranking-status').textContent='ランキングを読み込み中…';
    // Hide old chart scores immediately, including while its replacement loads.
    $('ranking-rows').replaceChildren();
    try {
      const key=await this.keyPromise;
      const query=`select B,C,D,E,H where F = '${key}' and G = '${RULESET}' order by C desc,D desc,E desc,H asc limit 20`;
      const [scores,config]=await Promise.all([
        readSheet('スコア','A1:N',query),
        readSheet('設定','A1:B2').catch(()=>[])
      ]);
      if(generation!==this.generation)return;
      const endpoint=config[0]?.c?.[1]?.v;
      this.endpoint=validEndpoint(endpoint)?endpoint.trim():'';
      this.render(scores.map(r=>({name:r.c?.[0]?.v,score:r.c?.[1]?.v,accuracy:r.c?.[2]?.v,maxCombo:r.c?.[3]?.v})));
    } catch(error) {
      if(generation===this.generation)$('ranking-status').textContent=error.message;
    } finally { if(generation===this.generation)$('ranking-refresh').disabled=false; }
  }
  render(entries) {
    $('ranking-rows').replaceChildren();
    entries.filter(e=>typeof e.name==='string' && Number.isFinite(e.score)).slice(0,20).forEach((entry,i)=>{
      const row=document.createElement('tr');
      for(const value of [i+1,entry.name,entry.score.toLocaleString()]) {
        const cell=document.createElement('td');cell.textContent=value;row.append(cell);
      }
      row.title=`精度 ${Number(entry.accuracy).toFixed(2)}% / 最大コンボ ${entry.maxCombo}`;
      $('ranking-rows').append(row);
    });
    const any=$('ranking-rows').children.length>0;
    $('ranking-status').textContent=any?'スコア順 / 上位20件':'この譜面の登録はまだありません。';
  }
  clearResult() {
    this.result=null;$('score-form').hidden=true;$('score-message').hidden=true;this.resetProgress();
  }
  showResult(stats) {
    this.result={...stats,playId:crypto.randomUUID(),ruleset:RULESET,song:this.chart.title,songId:this.chart.catalogId,keyPromise:this.keyPromise};
    $('player-name').value='';$('score-form').hidden=false;$('score-message').hidden=true;this.resetProgress();
    $('score-submit').disabled=false;$('score-skip').disabled=false;
  }
  async submit() {
    if(!this.result||this.submitting)return;
    const result=this.result;
    try {
      const name=validName($('player-name').value);
      this.submitting=true;$('score-submit').disabled=true;$('score-skip').disabled=true;
      $('score-message').hidden=false;$('score-message').textContent='ランキングに登録中…';this.startProgress();
      if(!this.endpoint) {
        const config=await readSheet('設定','A1:B2');const endpoint=config[0]?.c?.[1]?.v;
        if(validEndpoint(endpoint))this.endpoint=endpoint.trim();
      }
      if(!this.endpoint)throw new Error('登録先にまだ接続されていません。管理者による初回設定が必要です。');
      const {keyPromise,...stats}=result;
      await sendScore(this.endpoint,{...stats,name,chartKey:await keyPromise});
      if(this.result!==result)return;
      this.result=null;$('score-form').hidden=true;$('score-message').textContent='ランキングに登録しました！';this.finishProgress();
      $('ranking-status').textContent='ランキングを更新中…';
      // Registration is already complete. Refresh the public ranking separately so the
      // confirmation does not wait for Apps Script to scan and return the whole score table.
      void this.refresh();
    } catch(error) {
      if(this.result===result){this.failProgress();$('score-message').hidden=false;$('score-message').textContent=error.message;}
    } finally {
      this.submitting=false;$('score-submit').disabled=false;$('score-skip').disabled=false;
    }
  }
}
