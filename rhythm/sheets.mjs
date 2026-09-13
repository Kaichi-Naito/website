export const SHEET_ID = '1l93jSWpBLkh6tLp6wZSS_Z8YHwxMCGFK8cYgJZ8wJmw';
// Public, read-only Google Sheets queries. No credentials are placed in the site.
export function readSheet(sheet,range,query='') {
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
