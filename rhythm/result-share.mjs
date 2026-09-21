export const APP_URL = 'https://x.gd/T4P_game';
const BACKGROUND_URL = new URL('./result-background.svg?v=scattered-notes-v14', import.meta.url).href;
const LOGO_URL = new URL('./t4p-logo.png', import.meta.url).href;
const number = value => Number(value).toLocaleString('ja-JP');

// Keep the completed run independent of the next song / retry.
export function resultSnapshot(chart, result) {
  return Object.freeze({
    title: String(chart.title), artist: String(chart.artist || ''), jacket: String(chart.jacket || ''),
    difficulty: String(chart.difficulty || ''), score: result.score,
    accuracy: result.accuracy, maxCombo: result.maxCombo,
    emptyPresses: result.emptyPresses, rank: result.rank,
    rankingPosition: Number.isInteger(result.rankingPosition) && result.rankingPosition >= 1 && result.rankingPosition <= 10 ? result.rankingPosition : null,
    counts: Object.freeze({...result.counts})
  });
}
export function shareText(result) {
  const difficultyIcon = {NORMAL:'🎸', HARD:'🔥'}[result.difficulty.toUpperCase()] || '';
  const medal = {S:'💎', A:'🥇', B:'🥈', C:'🥉', D:'🌱'}[result.rank] || '';
  const ranking = Number.isInteger(result.rankingPosition) && result.rankingPosition >= 1 && result.rankingPosition <= 10 ? `\n👑${result.rankingPosition}位にランクイン！！` : '';
  return `(自動保存された結果画像を添付してポストしてね)\n\n#T4P で ♬ ${result.title} / ${result.artist} をプレイしたよ！！🎮\n\n${difficultyIcon}${result.difficulty}${difficultyIcon}\n${medal}RANK ${result.rank}${medal}\nスコア ${number(result.score)}点${ranking}\n\n${APP_URL}`;
}
export function xIntent(result) {
  const url = new URL('https://x.com/intent/tweet');
  url.searchParams.set('text', shareText(result));
  return url.href;
}

export function xDestination(result, device = globalThis.navigator || {}) {
  const ua = device.userAgent || '';
  const message = encodeURIComponent(shareText(result));
  // Android must receive the documented HTTPS composer URL and its `text`
  // parameter. The legacy twitter://post?message route can open X without a draft.
  if (/Android/i.test(ua)) return `${xIntent(result).replace(/^https:/, 'intent:')}#Intent;scheme=https;package=com.twitter.android;S.browser_fallback_url=${encodeURIComponent(xIntent(result))};end`;
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && device.maxTouchPoints > 1)) return `twitter://post?message=${message}`;
  return xIntent(result);
}

function loadImage(url) {
  if (!url) return Promise.resolve(null);
  return new Promise(resolve => {
    const image = new Image();
    const timer = setTimeout(() => resolve(null), 5000);
    image.onload = () => { clearTimeout(timer); resolve(image); };
    image.onerror = () => { clearTimeout(timer); resolve(null); };
    image.crossOrigin = 'anonymous';
    image.src = url;
  });
}
function lines(context, text, width) {
  const output = []; let line = '';
  for (const character of Array.from(text.replace(/\s+/gu, ' '))) {
    if (line && context.measureText(line + character).width > width) {
      output.push(line); line = '';
    }
    line += character;
  }
  output.push(line);
  return output;
}
export async function renderScoreImage(result, logo, jacket = null, gameplay = null) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  const font = size => `${size}px PixelMplus, monospace`;
  ctx.font = font(64);
  const titleLines = lines(ctx, result.title, 720);
  const titleEnd = ctx.measureText(titleLines.at(-1)).width;
  ctx.font = font(46);
  const artistText = result.artist ? ` / ${result.artist}` : '';
  const artistInline = titleEnd + ctx.measureText(artistText).width <= 720;
  const artistLines = artistInline ? [] : lines(ctx, result.artist, 720);
  ctx.font = font(36);
  const difficultyLines = lines(ctx, result.difficulty, 720);
  const headingBottom = Math.max(398, 278 + titleLines.length * 76 + artistLines.length * 54 + difficultyLines.length * 44);
  canvas.width = 1200; canvas.height = headingBottom + 350;
  ctx.fillStyle = '#0e1320'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (gameplay?.width && gameplay?.height) {
    const scale = Math.min(canvas.width / gameplay.width, canvas.height / gameplay.height);
    ctx.drawImage(gameplay, (canvas.width - gameplay.width * scale) / 2, (canvas.height - gameplay.height * scale) / 2, gameplay.width * scale, gameplay.height * scale);
    ctx.fillStyle = '#080d1c99'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.strokeStyle = '#e6edf5'; ctx.lineWidth = 6; ctx.strokeRect(15, 15, 1170, canvas.height - 30);
  const colors = ['#00c6e7', '#c0c0c0', '#ff008e', '#2464ff'];
  colors.forEach((color, i) => { ctx.fillStyle = color; ctx.fillRect(18 + i * 291, 18, 291, 10); });
  const text = (value, x, y, size, color = '#f6f8ff') => {
    ctx.fillStyle = color; ctx.font = font(size); ctx.fillText(String(value), x, y);
  };
  if (logo) {
    const w = 230, h = w * logo.naturalHeight / logo.naturalWidth;
    ctx.drawImage(logo, 58, 42, w, h);
  } else text('T4P', 64, 152, 90, '#00c6e7');
  text('PLAY RESULT', 328, 101, 30, '#a5b5cc');
  text(`RANK ${result.rank}`, 328, 164, 56, '#ffe37a');
  if (jacket) {
    const size = Math.min(jacket.naturalWidth || jacket.width, jacket.naturalHeight || jacket.height);
    ctx.drawImage(jacket, ((jacket.naturalWidth || jacket.width) - size) / 2, ((jacket.naturalHeight || jacket.height) - size) / 2, size, size, 822, 48, 320, 320);
    ctx.strokeStyle = '#e6edf5'; ctx.lineWidth = 3; ctx.strokeRect(822, 48, 320, 320);
  }
  let y = 270;
  titleLines.forEach((line, index) => {
    text(line, 64, y, 64);
    if (artistInline && index === titleLines.length - 1) text(artistText, 64 + titleEnd, y, 46, '#d2ddeb');
    y += 76;
  });
  artistLines.forEach(line => { text(line, 64, y, 46, '#d2ddeb'); y += 54; });
  difficultyLines.forEach(line => { text(line, 64, y, 36, result.difficulty.toUpperCase()==='HARD'?'#ff9393':'#7deaff'); y += 44; });
  const base = headingBottom;
  ctx.fillStyle = '#202b40dc'; ctx.fillRect(58, base, 1084, 136);
  text('SCORE', 84, base + 42, 26, '#a5b5cc');
  text(number(result.score), 84, base + 118, 88);
  text(`${result.accuracy.toFixed(2)}%`, 782, base + 71, 48, '#00c6e7');
  text(`MAX COMBO  ${number(result.maxCombo)}`, 780, base + 110, 23, '#b5c4d8');
  const stats = [
    ['PERFECT', result.counts.PERFECT, '#ffe37a'], ['GREAT', result.counts.GREAT, '#c4a2ff'],
    ['GOOD', result.counts.GOOD, '#80e5b0'], ['MISS', result.counts.MISS + (result.emptyPresses || 0), '#ff6f8a']
  ];
  stats.forEach(([label, value, color], i) => {
    const x = 193.5 + i * 271;
    ctx.textAlign = 'center';
    text(label, x, base + 194, 36, color);
    text(number(value), x, base + 252, 48);
  });
  ctx.textAlign = 'left';
  text('#T4P', 64, canvas.height - 44, 34, '#ff008e');
  ctx.textAlign = 'right';
  text(APP_URL, canvas.width - 42, canvas.height - 44, 25, '#b5c4d8');
  ctx.textAlign = 'left';
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG unavailable')), 'image/png'));
}

export class ResultShare {
  constructor(root, previewRoot = root) { this.root = root; this.previewRoot = previewRoot; this.version = 0; this.logo = loadImage(LOGO_URL); this.background = loadImage(BACKGROUND_URL); }
  clear() {
    this.rankingPending = false; this.imagePending = false;
    this.downloadFrame?.remove(); this.downloadFrame = null;
    if (this.previewRoot && this.previewRoot !== this.root) { this.previewRoot.hidden = true; this.previewRoot.replaceChildren(); }
    ++this.version;
    if (this.imageURL) URL.revokeObjectURL(this.imageURL);
    this.imageURL = null; this.snapshot = null; this.link = null; this.saveButton = null; this.fallback = null; this.root.hidden = true; this.root.replaceChildren();
  }
  show(chart, result) {
    this.clear(); const version = this.version;
    const snapshot = this.snapshot = resultSnapshot(chart, result);
    this.root.hidden = false;
    const actions = document.createElement('div'); actions.className = 'share-actions';
    const save = this.saveButton = document.createElement('button');
    save.type = 'button'; save.className = 'share-save'; save.textContent = '結果画像を保存'; save.disabled = true;
    const arrow = document.createElement('span'); arrow.className = 'share-arrow'; arrow.textContent = '▶'; arrow.setAttribute('aria-hidden', 'true');
    const link = this.link = document.createElement('a');
    link.className = 'share-x'; link.href = xDestination(snapshot); link.target = '_blank'; link.rel = 'noopener noreferrer';
    this.imagePending = true;
    link.textContent = 'Xでポスト'; link.setAttribute('aria-disabled', 'false'); actions.append(save, arrow, link);
    const status = document.createElement('p'); status.className = 'share-status'; status.setAttribute('role', 'status');
    status.textContent = 'スコア画像を準備しています…';
    const heading = document.createElement('h3'); heading.className = 'share-heading'; heading.textContent = '演奏結果をXでポストしよう！';
    this.root.append(heading, actions, status);
    const mobile = /^(intent:|twitter:)/.test(link.href);
    if (mobile) {
      const fallback = this.fallback = document.createElement('a');
      fallback.className = 'share-fallback'; fallback.href = xIntent(snapshot); fallback.target = '_blank'; fallback.rel = 'noopener noreferrer';
      fallback.textContent = 'アプリが開かない場合はブラウザで投稿'; fallback.hidden = true;
      actions.append(fallback);
    }
    const current = () => this.version === version;
    const guide = '画像はXの投稿画面で添付してください。保存先はブラウザーのダウンロード先です。保存されない場合は、この結果画像を長押し・右クリックして保存できます。';
    save.addEventListener('click', () => {
      if (!current() || this.imagePending || !this.imageURL) return;
      let downloadStarted = false;
      if (this.imageURL) {
        // Start the download directly in the save-button gesture.
        const download = document.createElement('a');
        download.href = this.imageURL;
        download.download = `T4P-${snapshot.title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')}-${snapshot.score}.png`;
        // A dedicated frame keeps the result screen intact during download.
        if (!this.downloadFrame) {
          this.downloadFrame = document.createElement('iframe');
          this.downloadFrame.name = `t4p-download-${version}`;
          this.downloadFrame.hidden = true;
          document.body.append(this.downloadFrame);
        }
        download.target = this.downloadFrame.name; download.hidden = true;
        document.body.append(download);
        try { download.click(); downloadStarted = true; }
        catch { /* Offer manual image saving if the browser refuses downloading. */ }
        finally { download.remove(); }
      }
      // Download requests have no completion event: never claim that the file is saved.
      status.textContent = `${downloadStarted ? '画像の保存を開始しました。保存後に「Xでポスト」を押してください。' : '画像を保存できませんでした。'}${guide}`;
    });
    link.addEventListener('click', event => {
      if (!current()) { event.preventDefault(); return; }
      if (this.rankingPending) {
        event.preventDefault(); status.textContent = 'ランキングの登録・順位確認が終わるまでお待ちください。'; return;
      }
      if (this.fallback) this.fallback.hidden = false;
      status.textContent = `投稿文を付けて${mobile ? 'Xアプリ' : 'Xの投稿画面'}を開きます。保存した結果画像を添付してください。`;
    });
    this.prepare(snapshot).then(blob => {
      if (!current()) return;
      this.imageURL = URL.createObjectURL(blob);
      this.imagePending = false; save.disabled = false; this.setRankingPending(this.rankingPending);
      const preview = document.createElement('div'); preview.className = 'share-preview';
      const image = document.createElement('img'); image.src = this.imageURL;
      image.alt = `${snapshot.title} / ${snapshot.artist}、${snapshot.difficulty}：${number(snapshot.score)}点、RANK ${snapshot.rank}`;
      preview.append(image);
      const previewRoot = this.previewRoot || this.root;
      previewRoot.append(preview); previewRoot.hidden = false;
      status.textContent = `「結果画像を保存」→「Xでポスト」の順に押してください。${guide}`;
    }).catch(() => {
      if (current()) {
        this.imagePending = false; this.setRankingPending(this.rankingPending);
        status.textContent = '画像を作れませんでした。「Xでポスト」から本文を入れた投稿画面を開けます。';
      }
    });
  }
  setRanking(position) {
    if (!this.snapshot) return;
    const rankingPosition = Number.isInteger(position) && position >= 1 && position <= 10 ? position : null;
    this.snapshot = Object.freeze({...this.snapshot, rankingPosition});
    if (this.link) this.link.href = xDestination(this.snapshot);
    if (this.fallback) this.fallback.href = xIntent(this.snapshot);
  }
  setRankingPending(pending) {
    this.rankingPending = pending;
    if (this.link) {
      this.link.setAttribute('aria-disabled', String(pending));
      this.link.textContent = pending ? 'ランキング確認中…' : 'Xでポスト';
    }
    if (this.fallback && pending) this.fallback.hidden = true;
  }
  async prepare(result) {
    const [, logo, jacket, gameplay] = await Promise.all([
      Promise.race([document.fonts?.load('28px PixelMplus'), new Promise(resolve => setTimeout(resolve, 2000))]),
      this.logo, loadImage(result.jacket), this.background
    ]);
    return renderScoreImage(result, logo, jacket, gameplay);
  }
}
