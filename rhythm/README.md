# Rolling — 4-key rhythm game, test version 01

Entry point: `../T4P.html`. The shared site navigation links to the game.
Gameplay needs no build step, external game library, or player account.
Optional public rankings use the owner's Google Sheet and an Apps Script receiver.
Serve the repository over HTTP (for example `python -m http.server`); ES modules and
audio fetching are not supported by opening the HTML as a `file://` URL.

## Test song and chart

- Source: user-uploaded `rhythm/Rolling/Rolling_T4P.ver.mp3`, PHALUX.
- Scope: the catalog keeps each song's source duration, while `catalog.mjs` currently limits gameplay to the first **30 seconds**. Playback stops at that test boundary even for a longer MP3.
- The original ranking spreadsheet’s `譜面` tab contains the song catalog.
  `Rolling/rolling-chart.json` retains test metadata; it is not fetched by the game.
- MIDI is parsed on every page load with cache bypass. Notes after 30 seconds
  are excluded and crossing holds are shortened. A load error offers retry;
  there is no fallback to an outdated generated chart.
- The MIDI tempo map is used, with 162 BPM as the fallback if no initial tempo exists.

## Timing and controls

- Q/W/E/R use physical `KeyboardEvent.code`; OS key repeat is ignored.
- Touch/pointer lane buttons also work. Inputs are tracked per source.
- Web Audio decodes the song before starting. One audio clock drives rendering
  and scoring; `getOutputTimestamp()` compensates for device buffering where available.
- PERFECT ±45 ms, GREAT ±90 ms, GOOD ±140 ms; positive user offset delays the target.
- Holds score the head plus one unit per complete MIDI quarter beat. The parser
  exports tempo-aware `ticks`; each beat succeeds after 80% held coverage.
  Releases have no timing judgment, re-grips recover later beats, and only
  insufficient beats miss. A four-beat hold therefore has five scoring units.
  Brief interruptions accumulate within each beat; rapid tapping does not replace a hold.
- Missing notes never ends a song early. Score is normalized to 1,000,000.
- Space/Escape/pause, tab hiding, and focus loss pause the audio and chart. Resume gives
  a countdown; a hold in progress can be re-gripped before the timeline resumes.
- Speed, offset, volume, and personal best are stored locally when storage is available.
- Speed defaults to 8, at the midpoint of the 2–14 slider. This matches old speed 8.
  The range is exponential around that point to remain playable at both extremes.
- Music and tap volume default to 100%. Tap gain retains the prior 2.5× increase.
  Settings v3 resets both volume defaults while retaining speed and timing offset.
- Each fresh press outside a note's ±140 ms window during the song deducts one
  PERFECT scoring unit and breaks combo. Penalty debt persists even at zero;
  displayed score and accuracy are clamped at zero. Countdown, held-key repeats,
  and release after successful sustain are not penalized. Results include empty count.
- Accuracy has a numeric percentage and a synchronized gauge. It uses weighted
  resolved judgments minus empty penalties, divided by resolved judgments.
- Touch buttons hide key letters on phone layouts. The page uses the homepage's
  fixed Windows 95 wallpaper and 10% dark overlay.

## Song selection and settings

The initial screen has a vertical scroll-snap song wheel, jacket, artist, title,
and difficulty. The catalog has one row per song/difficulty. Arrow keys,
buttons, wheel scrolling, and touch swipes select an entry. Only checked public
rows are displayed. Invalid public rows fail visibly; no stale generated chart
is substituted. All catalog fields are rendered as text and asset URLs are
restricted to this homepage. Switching songs cancels stale MIDI responses and
clears audio/score state. Rankings are separated by catalog ID and chart content.

The gear button opens a native modal settings dialog. Opening it during play
pauses first. Space/Escape and the two-bar pause icon open the pause menu, with
resume, retry, and return-to-selection actions. PERFECT is gold, GREAT purple,
GOOD green, misses red. Success produces a small ring and sparks at the judge
line; misses produce a red cross. Reduced-motion mode omits moving particles.

## User MIDI charts and tap sound

Rolling uses two public chart files:

- NORMAL: **`rhythm/Rolling/Rolling_Game.mid`**
- HARD: **`rhythm/Rolling/Rolling_T4P_HARD.mid`**

Upload/replace the appropriate file on `main`, wait for GitHub Pages deployment, then reload the page.
MIDI filenames, diagnostics, file import, and manual MIDI reload controls are absent
from the game UI. See `Rolling/README.md` for the REAPER/update workflow.

- MIDI note numbers **75, 74, 73, 72** map to **Q, W, E, R** respectively.
  These are D♯/D/C♯/C, one octave above middle C. Octave labels vary by DAW settings;
  the numbers are authoritative. Other pitches are ignored.
- Note-on sets the hit time. Notes shorter than one quarter note are taps.
  Notes at least one quarter note long are holds; note-off defines their visual
  length (not a release-timing judgment). Use
  1/16 notes for consistent tap entry. Velocity is ignored except that zero
  velocity note-on is a note-off, as specified by MIDI.
- Type 0/1 Standard MIDI Files with PPQ timing are supported. The parser merges
  tempo maps across tracks and channels, handles running status, and rejects
  missing note-offs and overlapping inputs on the same lane. SMPTE and type 2
  are rejected with a user-visible explanation.
- Align MIDI zero with the audio zero; do not trim the leading rest. Export the
  tempo map from REAPER. Missing initial tempo uses
  Rolling's 162 BPM fallback. MIDI duration need not equal the audio duration.
- Playback currently remains the first **30 seconds**. Later notes are excluded and holds
  crossing the end are shortened; these adjustments are retained in parser diagnostics.
- Imported chart scores have separate IDs derived from MIDI contents.
- The user-supplied tap WAV is converted to mono 44.1 kHz/16-bit PCM without
  changing its speed. Each new gameplay key/pointer press triggers it, even
  when no note is hit. Holding a key does not retrigger. Tap volume is separate from music volume. The output limiter controls overlapping peaks.

Run `node --test rhythm/*.test.mjs` to include MIDI parsing and tempo-map tests.

## Public rankings

The separate ranking window appears to the right on desktop (1000px and wider),
and below on narrow/mobile screens. It lists the selected chart's top 10 scores.
Each completed play offers a name field and an explicit skip button. Submission
is optional, confirmed by the server, and uses an idempotent play ID for retries.
Chart contents are hashed with SHA-256 so different arrangements are not mixed.
See `ranking/README.md` for the one-time Google Apps Script deployment and
`設定!B2` endpoint configuration in the original ranking spreadsheet.

## Verification

`node --test rhythm/engine.test.mjs` from the repository root checks full-chart
perfect/miss outcomes, lane overlap, held-key repeats, chords, sustain duration,
automatic completion, release timing independence, and pause/re-grip behavior.
Browser checks should cover start, keyboard input, pause/resume, retry, the
30-second result screen, and mobile layout. Subjective audio alignment should
also be checked on the player's actual output device.


## T4P / 結果の共有

正式名称は **T4P**。採用ロゴは `rhythm/t4p-logo.png` です。
共有欄の先頭に「演奏結果をXでポストしよう！」を表示します。Xへのリンクはアプリ起動用・ブラウザ用とも `target=_blank` で、元のゲームタブを移動しません。結果画面の「Xに投稿」は、指定テンプレートの本文とスコア画像を準備します。共有メニューを使わず、PCはXの投稿画面、iPhone / iPadは `twitter://post?message=`、Androidは公式の `https://x.com/intent/tweet?text=` をXのパッケージ指定Intent（scheme=https）でアプリに渡します。旧 `twitter://post?message=` をAndroidで使うと、本文なしでアプリが開くという実機報告があり変更しました。本文がXアプリで受け取られるかは修正後の実機確認が必要です。アプリ未導入・起動非対応の環境向けに、タップ後だけブラウザ用リンクを表示します。Android ChromeはIntent内のブラウザfallbackにも対応します。OS・ブラウザ・Xアプリのバージョンによって起動確認や非対応になる場合があるため、実機検証が必要です。「Xに投稿」は投稿文の受け渡しのみを行い、画像コピーを自動で行いません。登録成功後、プレイIDで実順位が取得できた場合のみ順位の1行を追加します。投稿の確定はプレイヤーが行います。

画像は端末内で生成したPNGです。右上のジャケット（320px角）、難易度（36px）、同じ行の曲名（64px）とアーティスト（46px）、点数・ランク・精度・最大コンボ・判定内訳を収録し、名前やランキング登録情報は含めません。背景は `result-background.svg` の固定画像です。4レーン・4ノーツ・4つの操作ボタンを描き、結果画面とスコア画像で共用します。プレイ中の画面キャプチャは行いません。空押しは画像のMISSに合算し、プレイ中のラベルもMISSに統一します（採点・ランキングの検証用データは従来どおり保持）。スコア画像は結果画面に常時表示し、「結果画像を保存」「結果画像をコピー」の2つのボタンを表示します。保存はPNGのダウンロード、コピーはPNGのクリップボード書き込みです。非対応・拒否時は保存を案内し、X側での画像選択・貼り付け方法も画面に表示します。「Xに投稿」はコピーの成否にかかわらずリンクとしてXを開きます。navigator.share / canShare は使用しません。XのWeb Intentにローカル画像を自動添付する機能はありません。

共有はランキングの順位・登録の有無に関係なく利用できます。次の曲や再プレイを始めると、前の結果と画像URLを破棄します。

## 30秒テスト（2026-09-21）

現在は `catalog.mjs` の `PLAY_DURATION_LIMIT = 30` で全曲を冒頭30秒に制限しています。シートの元のプレイ時間は保持し、MIDIも30秒で切り詰めます。元の長さへ戻す場合はこの上限を `Infinity` に戻します。譜面識別子には演奏時間とノーツ内容が入るため、2分版のランキングとは別集計です。

結果画面は画面全体に表示し、判定内訳の欄を削除してX投稿を見つけやすくしました。動きを減らす端末設定でも、成功したレーンと判定ラインの静止した光は表示します。

公開URLは `https://kaichi-naito.github.io/website/T4P.html`。旧 `RhythmGame.html` はクエリ・ハッシュを保持して新URLへ転送します。

X投稿文とスコア画像の表示URLは `https://x.gd/T4P_game` を使用します。ゲーム本体のURLと旧URL転送は維持します。

曲選択のスクロール予約はプレイ開始時に破棄します。非表示の曲選択イベントや遅れて返るMIDI読み込みは、演奏中・一時停止中・結果表示中の譜面や結果を上書きしません。
