// Rolling ranking receiver. Deploy as a Web App: execute as yourself; anyone can access.
// Only this spreadsheet is read/written. No Google credentials go into the website.
const RANKING_SPREADSHEET_ID = '1l93jSWpBLkh6tLp6wZSS_Z8YHwxMCGFK8cYgJZ8wJmw';
const RANKING_ORIGIN = 'https://kaichi-naito.github.io';
const RANKING_RULESET = 'beat-hold-v4';
const CATALOG_CACHE_SECONDS = 300;
const MAX_RANKING_ENTRIES = 20;

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

function compareRankingRows_(a,b) {
  return Number(b.values[2])-Number(a.values[2]) ||
    Number(b.values[3])-Number(a.values[3]) ||
    Number(b.values[4])-Number(a.values[4]) ||
    String(a.values[7]).localeCompare(String(b.values[7]));
}

function rankingRows_(sheet,chartKey) {
  const last=sheet.getLastRow();
  if(last<2)return [];
  return sheet.getRange(2,1,last-1,15).getValues()
    .map((values,index)=>({row:index+2,values}))
    .filter(entry=>entry.values[5]===chartKey && entry.values[6]===RANKING_RULESET)
    .sort(compareRankingRows_);
}

function candidateBeats_(input,existingValues) {
  const score=Number(existingValues[2]),accuracy=Number(existingValues[3]),maxCombo=Number(existingValues[4]);
  if(input.score!==score)return input.score>score;
  if(input.accuracy!==accuracy)return input.accuracy>accuracy;
  if(input.maxCombo!==maxCombo)return input.maxCombo>maxCombo;
  // Existing record wins a complete tie because it was registered first.
  return false;
}

function trimLegacyRows_(sheet,rows) {
  if(rows.length<=MAX_RANKING_ENTRIES)return rows;
  const deleteRows=rows.slice(MAX_RANKING_ENTRIES).map(entry=>entry.row).sort((a,b)=>b-a);
  for(const row of deleteRows)sheet.deleteRow(row);
  return rankingRows_(sheet,rows[0].values[5]);
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
    const existingPlay=last>1?sheet.getRange(2,9,last-1,1).createTextFinder(input.playId).matchEntireCell(true).findNext():null;
    if(existingPlay) {
      const prior=sheet.getRange(existingPlay.getRow(),3,1,4).getValues()[0];
      if(prior[3]!==input.chartKey || prior[0]!==input.score)throw new Error('このプレイは既に登録されています。');
      return {saved:true,qualified:true,duplicate:true};
    }

    let rows=trimLegacyRows_(sheet,rankingRows_(sheet,input.chartKey));
    const cutoff=rows.length>=MAX_RANKING_ENTRIES?rows[MAX_RANKING_ENTRIES-1]:null;
    if(cutoff && !candidateBeats_(input,cutoff.values)) {
      return {
        saved:false,
        qualified:false,
        cutoff:{score:Number(cutoff.values[2]),accuracy:Number(cutoff.values[3]),maxCombo:Number(cutoff.values[4])}
      };
    }

    const c=input.counts;
    const safeName=/^[=+\-@']/.test(input.name)?"'"+input.name:input.name;
    const values=[songTitle,safeName,input.score,input.accuracy,input.maxCombo,input.chartKey,input.ruleset,Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy-MM-dd HH:mm:ss'),input.playId,c.PERFECT,c.GREAT,c.GOOD,c.MISS,input.units,input.emptyPresses];

    let targetRow;
    let replaced=false;
    if(rows.length>=MAX_RANKING_ENTRIES) {
      targetRow=rows[MAX_RANKING_ENTRIES-1].row;
      replaced=true;
    } else {
      targetRow=sheet.getLastRow()+1;
      if(targetRow>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),Math.max(100,MAX_RANKING_ENTRIES));
    }
    sheet.getRange(targetRow,1,1,15).setValues([values]);
    return {saved:true,qualified:true,duplicate:false,replaced};
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
  const json=JSON.stringify(result).replace(/</g,'\\u003c');
  return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><script>window.top.postMessage('+json+','+JSON.stringify(RANKING_ORIGIN)+');</script>')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function doGet() {
  return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><p>Rollingのランキング登録用プログラムです。ゲームから登録してください。</p>');
}
