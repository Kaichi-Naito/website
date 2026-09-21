import { readSheet } from './sheets.mjs?v=song-select-v1';
// Play each song for its configured full duration.
export const PLAY_DURATION_LIMIT = Infinity;
// Repository-relative paths and this homepage's absolute URLs are accepted.
export function assetPath(value, kind) {
  let path=String(value??'').trim();
  if(path.startsWith('https://kaichi-naito.github.io/website/'))path=path.slice('https://kaichi-naito.github.io/website/'.length);
  path=path.replace(/^\/?website\//,'').replace(/^\.\//,'');
  const decoded=decodeURIComponent(path);
  const extensions={midi:/\.(mid|midi)$/i,audio:/\.(mp3|wav|ogg|m4a)$/i,image:/\.(png|jpe?g|webp|gif|svg)$/i};
  if(!path||path.startsWith('/')||/[?#:\\]/.test(decoded)||decoded.split('/').some(p=>p==='..')||!extensions[kind].test(path))throw new Error('音源・譜面・ジャケットのパスを確認してください。');
  return path;
}
export function parseCatalog(rows) {
  const ids=new Set(),songs=[];
  for(const row of rows) {
    const v=row.c?.map(c=>c?.v)??row;
    if(!v.some(x=>x!==null&&x!==undefined&&x!==''))continue;
    if(v[9]!==true)continue;
    const [title,difficulty,midi,audio,artist,jacket,bpm,duration,id]=v;
    if(!title||!difficulty||!artist||!id)throw new Error('楽曲一覧の曲名・難易度・アーティスト・譜面IDを確認してください。');
    if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id)||ids.has(id))throw new Error('譜面IDは重複しない英数字・ハイフン・アンダーバーにしてください。');
    if(!Number.isFinite(Number(bpm))||Number(bpm)<20||Number(bpm)>400||!Number.isFinite(Number(duration))||Number(duration)<=0||Number(duration)>1200)throw new Error('BPMまたはプレイ時間が正しくありません。');
    ids.add(id);songs.push({catalogId:id,title:String(title),difficulty:String(difficulty),artist:String(artist),midiPath:assetPath(midi,'midi'),audio:assetPath(audio,'audio'),jacket:assetPath(jacket,'image'),bpm:Number(bpm),duration:Math.min(Number(duration),PLAY_DURATION_LIMIT)});
  }
  if(!songs.length)throw new Error('公開中の楽曲がありません。');
  return songs;
}
export async function loadCatalog(){return parseCatalog(await readSheet('譜面','A1:J1000'));}
