// Rolling ranking receiver. Deploy as a Web App: execute as yourself; anyone can access.
// Only this spreadsheet is read/written. No Google credentials go into the website.
const RANKING_SPREADSHEET_ID = '1l93jSWpBLkh6tLp6wZSS_Z8YHwxMCGFK8cYgJZ8wJmw';
const RANKING_ORIGIN = 'https://kaichi-naito.github.io';
const RANKING_RULESET = 'hold80-empty-v3';

function validateScore_(input) {
  if(!input || input.song!=='Rolling' || input.ruleset!==RANKING_RULESET)throw new Error('対象外の曲または判定ルールです。');
  const name=String(input.name || '').trim();
  if(!name || Array.from(name).length>16 || /[\u0000-\u001f\u007f]/.test(name))throw new Error('名前は1〜16文字で入力してください。');
  if(!/^[a-f0-9]{64}$/.test(input.chartKey))throw new Error('譜面IDが正しくありません。');
  if(!/^[a-f0-9-]{36}$/.test(input.playId))throw new Error('プレイIDが正しくありません。');
  const c=input.counts || {};
  for(const label of ['PERFECT','GREAT','GOOD','MISS'])if(!Number.isInteger(c[label])||c[label]<0||c[label]>20000)throw new Error('判定数が正しくありません。');
  const units=c.PERFECT+c.GREAT+c.GOOD+c.MISS;
  if(!units||units>20000||input.units!==units)throw new Error('完了したプレイのみ登録できます。');
  if(!Number.isInteger(input.emptyPresses)||input.emptyPresses<0||input.emptyPresses>20000)throw new Error('空押し数が正しくありません。');
  const earned=Math.max(0,c.PERFECT+c.GREAT*.8+c.GOOD*.5-input.emptyPresses);
  const score=Math.round(earned/units*1000000),accuracy=Number((earned/units*100).toFixed(2));
  if(input.score!==score || input.accuracy!==accuracy)throw new Error('スコアと判定結果が一致しません。');
  if(!Number.isInteger(input.maxCombo)||input.maxCombo<0||input.maxCombo>units-c.MISS)throw new Error('コンボ数が正しくありません。');
  return {...input,name,score,accuracy};
}
function rankingEntries_(sheet,key) {
  if(sheet.getLastRow()<2)return [];
  return sheet.getRange(2,1,sheet.getLastRow()-1,14).getValues()
    .filter(r=>r[5]===key&&r[6]===RANKING_RULESET)
    .sort((a,b)=>b[2]-a[2]||b[3]-a[3]||b[4]-a[4]||String(a[7]).localeCompare(String(b[7])))
    .slice(0,20).map(r=>({name:String(r[1]),score:Number(r[2]),accuracy:Number(r[3]),maxCombo:Number(r[4])}));
}
function saveScore_(raw) {
  const input=validateScore_(raw),lock=LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet=SpreadsheetApp.openById(RANKING_SPREADSHEET_ID).getSheetByName('スコア');
    if(!sheet||sheet.getRange('I1').getValue()!=='プレイID')throw new Error('ランキング表の設定を確認してください。');
    const last=sheet.getLastRow();
    const existing=last>1?sheet.getRange(2,9,last-1,1).createTextFinder(input.playId).matchEntireCell(true).findNext():null;
    if(existing) {
      const prior=sheet.getRange(existing.getRow(),1,1,14).getValues()[0];
      if(prior[5]!==input.chartKey||prior[2]!==input.score)throw new Error('このプレイは既に登録されています。');
    } else {
      if(last>=50000)throw new Error('登録上限に達しました。管理者による整理をお待ちください。');
      if(last>=sheet.getMaxRows())sheet.insertRowsAfter(last,1000);
      const c=input.counts, row=last+1;
      // Quote formula-like names so public submissions never become Sheets formulas.
      const safeName=/^[=+\-@']/.test(input.name)?"'"+input.name:input.name;
      sheet.getRange(row,2).setNumberFormat('@');
      sheet.getRange(row,1,1,15).setValues([['Rolling',safeName,input.score,input.accuracy,input.maxCombo,input.chartKey,input.ruleset,Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy-MM-dd HH:mm:ss'),input.playId,c.PERFECT,c.GREAT,c.GOOD,c.MISS,input.units,input.emptyPresses]]);
      sheet.getRange(row,3).setNumberFormat('#,##0');sheet.getRange(row,4).setNumberFormat('0.00');
      SpreadsheetApp.flush();
    }
    return rankingEntries_(sheet,input.chartKey);
  } finally { lock.releaseLock(); }
}
function doPost(e) {
  const requestId=String(e?.parameter?.requestId || '');
  let result={type:'rhythm-score-result',requestId,ok:false};
  try {
    if(!/^[a-f0-9-]{36}$/.test(requestId))throw new Error('リクエストIDが正しくありません。');
    const raw=e.parameter.payload;
    if(typeof raw!=='string'||raw.length>8000)throw new Error('送信内容を確認してください。');
    result.entries=saveScore_(JSON.parse(raw));result.ok=true;
  } catch(error) { result.error=String(error.message || '登録できませんでした。'); }
  // Form POST avoids cross-origin preflight; acknowledge only after the write succeeds.
  const json=JSON.stringify(result).replace(/</g,'\\u003c');
  return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><script>window.top.postMessage('+json+','+JSON.stringify(RANKING_ORIGIN)+');</script>')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function doGet() {
  return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><p>Rollingのランキング登録用プログラムです。ゲームから登録してください。</p>');
}
