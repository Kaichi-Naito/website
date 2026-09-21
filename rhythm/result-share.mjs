export const APP_URL = 'https://x.gd/T4P_game';
const LOGO_URL = new URL('./t4p-logo.png', import.meta.url).href;
const number = value => Number(value).toLocaleString('ja-JP');

// Keep the completed run independent of the next song / retry.
export function resultSnapshot(chart, result) {
  return Object.freeze({
    title: String(chart.title), artist: String(chart.artist || ''),
    difficulty: String(chart.difficulty || ''), score: result.score,
    accuracy: result.accuracy, maxCombo: result.maxCombo,
    emptyPresses: result.emptyPresses, rank: result.rank,
    rankingPosition: Number.isInteger(result.rankingPosition) && result.rankingPosition >= 1 && result.rankingPosition <= 20 ? result.rankingPosition : null,
    counts: Object.freeze({...result.counts})
  });
}
export function shareText(result) {
  const medal = {S:'💎', A:'🥇', B:'🥈', C:'🥉', D:'🌱'}[result.rank] || '';
  const ranking = Number.isInteger(result.rankingPosition) && result.rankingPosition >= 1 && result.rankingPosition <= 20 ? `\n👑${result.rankingPosition}位にランクイン！！` : '';
  return `#T4P で ♬ ${result.title} / ${result.artist} をプレイしたよ！！🎮\n\n🎧${result.difficulty}\n${medal}RANK ${result.rank}${medal}\nスコア ${number(result.score)}点${ranking}\n\n${APP_URL}`;
}
export function xIntent(result) {
  const url = new URL('https://x.com/intent/tweet');
  url.searchParams.set('text', shareText(result));
  return url.href;
}

function loadLogo() {
  return new Promise(resolve => {
    const image = new Image();
    const timer = setTimeout(() => resolve(null), 5000);
    image.onload = () => { clearTimeout(timer); resolve(image); };
    image.onerror = () => { clearTimeout(timer); resolve(null); };
    image.src = LOGO_URL;
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
export async function renderScoreImage(result, logo) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  const font = size => `${size}px PixelMplus, monospace`;
  ctx.font = font(46);
  const titleLines = lines(ctx, result.title, 1056);
  ctx.font = font(28);
  const artistLines = lines(ctx, result.artist, 1056);
  const difficultyLines = lines(ctx, result.difficulty, 1056);
  const headingBottom = 220 + titleLines.length * 54 + artistLines.length * 36 + difficultyLines.length * 34;
  canvas.width = 1200; canvas.height = headingBottom + 430;
  ctx.fillStyle = '#0e1320'; ctx.fillRect(0, 0, canvas.width, canvas.height);
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
  let y = 244;
  titleLines.forEach(line => { text(line, 64, y, 46); y += 54; });
  artistLines.forEach(line => { text(line, 64, y, 28, '#b5c4d8'); y += 36; });
  difficultyLines.forEach(line => { text(line, 64, y, 28, '#00c6e7'); y += 34; });
  const base = headingBottom;
  ctx.fillStyle = '#202b40'; ctx.fillRect(58, base, 1084, 136);
  text('SCORE', 84, base + 42, 26, '#a5b5cc');
  text(number(result.score), 84, base + 111, 68);
  text(`${result.accuracy.toFixed(2)}%`, 782, base + 71, 48, '#00c6e7');
  text(`MAX COMBO  ${number(result.maxCombo)}`, 780, base + 110, 23, '#b5c4d8');
  const stats = [
    ['PERFECT', result.counts.PERFECT, '#ffe37a'], ['GREAT', result.counts.GREAT, '#c4a2ff'],
    ['GOOD', result.counts.GOOD, '#80e5b0'], ['MISS', result.counts.MISS, '#ff6f8a'],
    ['空押し', result.emptyPresses, '#ff6f8a']
  ];
  stats.forEach(([label, value, color], i) => {
    const x = 64 + (i % 3) * 370, y = base + 192 + Math.floor(i / 3) * 54;
    text(label, x, y, 25, color); text(number(value), x + 215, y, 28);
  });
  text('#T4P', 64, canvas.height - 100, 34, '#ff008e');
  text(APP_URL, 64, canvas.height - 54, 25, '#b5c4d8');
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG unavailable')), 'image/png'));
}

export class ResultShare {
  constructor(root) { this.root = root; this.version = 0; this.logo = loadLogo(); }
  clear() {
    ++this.version;
    if (this.imageURL) URL.revokeObjectURL(this.imageURL);
    this.imageURL = null; this.snapshot = null; this.link = null; this.root.hidden = true; this.root.replaceChildren();
  }
  show(chart, result) {
    this.clear(); const version = this.version;
    const snapshot = this.snapshot = resultSnapshot(chart, result);
    this.root.hidden = false;
    const actions = document.createElement('div'); actions.className = 'share-actions';
    const link = this.link = document.createElement('a');
    link.className = 'share-x'; link.href = xIntent(snapshot); link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.textContent = 'Xに投稿'; actions.append(link);
    const status = document.createElement('p'); status.className = 'share-status'; status.setAttribute('role', 'status');
    status.textContent = 'スコア画像を準備しています…';
    this.root.append(actions, status);
    const current = () => this.version === version;
    let imageBlob = null, file = null, nativeSharing = false, sharing = false;
    link.addEventListener('click', async event => {
      if (!current()) { event.preventDefault(); return; }
      if (nativeSharing && file) {
        event.preventDefault();
        if (sharing) return;
        sharing = true;
        try {
          await navigator.share({title:'T4P プレイ結果', text:shareText(this.snapshot), files:[file]});
          if (current()) status.textContent = '共有先で本文と画像を確認してください。';
        } catch (error) {
          if (current() && error.name !== 'AbortError') {
            nativeSharing = false;
            status.textContent = '画像付き共有を開けませんでした。もう一度「Xに投稿」を押すとXの投稿画面を開きます。';
          }
        } finally { sharing = false; }
        return;
      }
      // Let the anchor open X immediately, even if PNG generation or clipboard
      // access fails. Image copying is optional and must never block navigation.
      if (!imageBlob || !navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
        status.textContent = 'Xの投稿画面を開きます。画像は自動添付されません。下の画像を右クリック・長押しで保存して添付できます。';
        return;
      }
      try {
        await navigator.clipboard.write([new ClipboardItem({'image/png':imageBlob})]);
        if (current()) status.textContent = '画像をコピーしました。Xの投稿欄で貼り付け（Ctrl+V / ⌘V）してください。';
      } catch {
        if (current()) status.textContent = 'Xの投稿画面を開きました。画像をコピーできなかったため、下の画像を右クリック・長押しで保存して添付してください。';
      }
    });
    this.prepare(snapshot).then(blob => {
      if (!current()) return;
      imageBlob = blob;
      this.imageURL = URL.createObjectURL(blob);
      file = new File([blob], `T4P-score-${snapshot.score}.png`, {type:'image/png'});
      try { nativeSharing = Boolean(navigator.share && navigator.canShare?.({title:'T4P プレイ結果', text:shareText(this.snapshot), files:[file]})); } catch { /* open X directly */ }
      const preview = document.createElement('div'); preview.className = 'share-preview';
      const image = document.createElement('img'); image.src = this.imageURL;
      image.alt = `${snapshot.title} / ${snapshot.artist}：${number(snapshot.score)}点、RANK ${snapshot.rank}`;
      preview.append(image); this.root.append(preview);
      status.textContent = nativeSharing
        ? '「Xに投稿」で共有先にXを選んでください。本文と画像の引き継ぎは端末・アプリによって異なります。'
        : '「Xに投稿」でXを開きます。画像の自動添付には非対応です。画像コピーに対応した環境では、Xで貼り付け（Ctrl+V / ⌘V）できます。';
    }).catch(() => {
      if (current()) status.textContent = '画像を作れませんでした。「Xに投稿」から本文を入れた投稿画面を開けます。';
    });
  }
  setRanking(position) {
    if (!this.snapshot) return;
    const rankingPosition = Number.isInteger(position) && position >= 1 && position <= 20 ? position : null;
    this.snapshot = Object.freeze({...this.snapshot, rankingPosition});
    if (this.link) this.link.href = xIntent(this.snapshot);
  }
  async prepare(result) {
    const [, logo] = await Promise.all([
      Promise.race([document.fonts?.load('28px PixelMplus'), new Promise(resolve => setTimeout(resolve, 2000))]),
      this.logo
    ]);
    return renderScoreImage(result, logo);
  }
}
