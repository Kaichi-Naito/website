export const SHEET_ID = '1l93jSWpBLkh6tLp6wZSS_Z8YHwxMCGFK8cYgJZ8wJmw';
export const RULESET = 'hold80-v2';
const $ = id => document.getElementById(id);
export async function chartKey(chart) {
  const normalized=JSON.stringify({song:'rolling-60',rules:RULESET,duration:chart.duration,notes:chart.notes.map(n=>[Math.round(n.t*1e6),n.lane,n.end?Math.round(n.end*1e6):null])});
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
// Public, read-only Google Sheets queries. No credentials are placed in the site.
function readSheet(sheet,range,query='') {
  return new Promise((resolve,reject)=>{
    const callback=`rhythm_${crypto.randomUUID().replaceAll('-','')}`;
    const script=document.createElement('script');
    const cleanup=()=>{
      clearTimeout(timer);script.remove();
      // A timed-out response can arrive later; let it finish harmlessly.
      window[callback]=()=>{};setTimeout(()=>delete window[callback],60000);
    };
    const timer=setTimeout(()=>{cleanup();reject(new Error('ランキングを取得できませんでした。更新ボタンで再試行できます。'));},15000);
    window[callback]=data=>{
      cleanup();
      if(data.status==='error')reject(new Error('ランキング表を読み込めませんでした。'));
      else resolve(data.table?.rows || []);
    };
    script.onerror=()=>{cleanup();reject(new Error('ランキングに接続できませんでした。'));};
    const url=new URL(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`);
    url.search=new URLSearchParams({sheet,range,headers:'1',tq:query,tqx:`out:json;responseHandler:${callback}`,_:String(Date.now())});
    script.src=url.href;document.head.append(script);
  });
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
export class Leaderboard {
  constructor() {
    this.generation=0;this.result=null;this.endpoint='';this.submitting=false;
    $('ranking-refresh').addEventListener('click',()=>this.refresh());
    $('score-form').addEventListener('submit',event=>{event.preventDefault();this.submit();});
    $('score-skip').addEventListener('click',()=>{
      if(this.submitting)return;
      this.result=null;$('score-form').hidden=true;
      $('score-message').hidden=false;$('score-message').textContent='今回は登録をスキップしました。';
    });
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
    this.result=null;$('score-form').hidden=true;$('score-message').hidden=true;
  }
  showResult(stats) {
    this.result={...stats,playId:crypto.randomUUID(),ruleset:RULESET,song:'Rolling',keyPromise:this.keyPromise};
    $('player-name').value='';$('score-form').hidden=false;$('score-message').hidden=true;
    $('score-submit').disabled=false;$('score-skip').disabled=false;
  }
  async submit() {
    if(!this.result||this.submitting)return;
    const result=this.result;
    try {
      const name=validName($('player-name').value);
      this.submitting=true;$('score-submit').disabled=true;$('score-skip').disabled=true;
      $('score-message').hidden=false;$('score-message').textContent='スコアを登録しています…';
      if(!this.endpoint) {
        const config=await readSheet('設定','A1:B2');const endpoint=config[0]?.c?.[1]?.v;
        if(validEndpoint(endpoint))this.endpoint=endpoint.trim();
      }
      if(!this.endpoint)throw new Error('ランキング登録は準備中です。今回は登録せずに進めます。');
      const {keyPromise,...stats}=result;
      const response=await sendScore(this.endpoint,{...stats,name,chartKey:await keyPromise});
      if(this.result!==result)return;
      this.result=null;$('score-form').hidden=true;$('score-message').textContent='ランキングに登録しました！';
      ++this.generation;$('ranking-refresh').disabled=false;
      this.render(response.entries || []);
    } catch(error) {
      if(this.result===result){$('score-message').hidden=false;$('score-message').textContent=error.message;}
    } finally {
      this.submitting=false;$('score-submit').disabled=false;$('score-skip').disabled=false;
    }
  }
}
