// Rolling ranking receiver. Deploy as a Web App: execute as yourself; anyone can access.
// Only this spreadsheet is read/written. No Google credentials go into the website.
const RANKING_SPREADSHEET_ID = '1l93jSWpBLkh6tLp6wZSS_Z8YHwxMCGFK8cYgJZ8wJmw';
const RANKING_ORIGIN = 'https://kaichi-naito.github.io';
const RANKING_RULESET = 'beat-hold-v4';
const CATALOG_CACHE_SECONDS = 300;

function validateScore_(input) {
  if(!input || typeof input.song!=='string' || !input.song.trim() || input.song.length>150 || !/^[A-Za-z0-9_-]{1,80}$/.test(input.songId) || input.ruleset!==RANKING_RULESET)throw new Error('対象外の曲または判定ルールです。');
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

function publishedSongTitle_(book,input) {
  const cache=CacheService.getScriptCache(),cacheKey=`ranking-song-v1:${input.songId}`;
  const cached=cache.get(cacheKey);
  if(cached) {
    try {
      const info=JSON.parse(cached);
      if(info.title===input.song && info.public===true)return info.title;
    } catch(_) {}
  }
  const catalog=book.getSheetByName('譜面');
  const last=catalog?.getLastRow() || 0;
  if(last<2)throw new Error('現在公開されている楽曲を選び直してください。');
  // Search only the catalog ID column instead of loading the whole catalog table.
  const cell=catalog.getRange(2,9,last-1,1).createTextFinder(input.songId).matchEntireCell(true).findNext();
  if(!cell)throw new Error('現在公開されている楽曲を選び直してください。');
  const row=catalog.getRange(cell.getRow(),1,1,10).getValues()[0];
  if(row[8]!==input.songId || row[9]!==true || row[0]!==input.song)throw new Error('現在公開されている楽曲を選び直してください。');
  cache.put(cacheKey,JSON.stringify({title:String(row[0]),public:true}),CATALOG_CACHE_SECONDS);
  return String(row[0]);
}

function scoreSheet_(book) {
  const sheet=book.getSheetByName('スコア');
  if(!sheet)throw new Error('ランキング表の設定を確認してください。');
  const cache=CacheService.getScriptCache(),schemaKey='ranking-score-schema-v1';
  if(cache.get(schemaKey)!=='ok') {
    if(sheet.getRange('I1').getValue()!=='プレイID')throw new Error('ランキング表の設定を確認してください。');
    cache.put(schemaKey,'ok',21600);
  }
  return sheet;
}

function saveScore_(raw) {
  const input=validateScore_(raw);
  const book=SpreadsheetApp.openById(RANKING_SPREADSHEET_ID);
  const songTitle=publishedSongTitle_(book,input);
  const sheet=scoreSheet_(book);
  const lock=LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const last=sheet.getLastRow();
    // Keep idempotency, but search only the Play ID column on Google's side.
    const existing=last>1?sheet.getRange(2,9,last-1,1).createTextFinder(input.playId).matchEntireCell(true).findNext():null;
    if(existing) {
      const prior=sheet.getRange(existing.getRow(),3,1,4).getValues()[0];
      if(prior[3]!==input.chartKey || prior[0]!==input.score)throw new Error('このプレイは既に登録されています。');
      return {saved:true,duplicate:true};
    }
    if(last>=50000)throw new Error('登録上限に達しました。管理者による整理をお待ちください。');
    if(last>=sheet.getMaxRows())sheet.insertRowsAfter(last,1000);
    const c=input.counts,row=last+1;
    // Quote formula-like names so public submissions never become Sheets formulas.
    const safeName=/^[=+\-@']/.test(input.name)?"'"+input.name:input.name;
    // One write only. Column formatting is left to the sheet instead of formatting every new row.
    sheet.getRange(row,1,1,15).setValues([[songTitle,safeName,input.score,input.accuracy,input.maxCombo,input.chartKey,input.ruleset,Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy-MM-dd HH:mm:ss'),input.playId,c.PERFECT,c.GREAT,c.GOOD,c.MISS,input.units,input.emptyPresses]]);
    return {saved:true,duplicate:false};
  } finally { lock.releaseLock(); }
}

function doPost(e) {
  const requestId=String(e?.parameter?.requestId || '');
  let result={type:'rhythm-score-result',requestId,ok:false};
  try {
    if(!/^[a-f0-9-]{36}$/.test(requestId))throw new Error('リクエストIDが正しくありません。');
    const raw=e.parameter.payload;
    if(typeof raw!=='string'||raw.length>8000)throw new Error('送信内容を確認してください。');
    result.registration=saveScore_(JSON.parse(raw));result.ok=true;
  } catch(error) { result.error=String(error.message || '登録できませんでした。'); }
  // Return immediately after the write. The browser refreshes TOP 20 separately,
  // so this request no longer scans the entire score sheet before acknowledging success.
  const json=JSON.stringify(result).replace(/</g,'\\u003c');
  return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><script>window.top.postMessage('+json+','+JSON.stringify(RANKING_ORIGIN)+');</script>')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function doGet() {
  return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><p>Rollingのランキング登録用プログラムです。ゲームから登録してください。</p>');
}
