# Rolling — 4-key rhythm game, test version 01

Entry point: `../RhythmGame.html`. The shared site navigation links to the game.
No backend, build step, external game library, telemetry, or account is required.
Serve the repository over HTTP (for example `python -m http.server`); ES modules and
audio fetching are not supported by opening the HTML as a `file://` URL.

## Test song and chart

- Source: user-supplied `Rolling_MV_ReMix_fix.wav`, PHALUX.
- Scope: first 60 seconds. 192 kbps stereo MP3; last 0.4 seconds fade out.
- Timing: 162 BPM, refined against spectral onset measurements of the source WAV.
- Chart: `rolling-chart.json`, explicit time in seconds, lane 0–3 = Q/W/E/R.
  Optional `end` is a hold's end timestamp. Times are relative to the audio start.
- This first chart is an estimate from the finished stereo mix, not a verified
  transcription of isolated vocal or lead-guitar stems. Center-channel harmonic
  attacks and predominant-pitch changes guide melody placement; strong band
  accents add occasional chords. Sustained estimates become holds. It still
  needs musician playtesting, particularly where vocals and guitars overlap.
- Editing a chart does not require regenerating or replacing the audio. Increment
  the chart `id` if score totals change so personal bests remain comparable.

## Timing and controls

- Q/W/E/R use physical `KeyboardEvent.code`; OS key repeat is ignored.
- Touch/pointer lane buttons also work. Inputs are tracked per source.
- Web Audio decodes the song before starting. One audio clock drives rendering
  and scoring; `getOutputTimestamp()` compensates for device buffering where available.
- PERFECT ±45 ms, GREAT ±90 ms, GOOD ±140 ms; positive user offset delays the target.
- Holds score a head and a tail. Early releases miss; tail grace is 100 ms.
- Missing notes never ends a song early. Score is normalized to 1,000,000.
- Escape/pause, tab hiding, and focus loss pause the audio and chart. Resume gives
  a countdown; a hold in progress can be re-gripped before the timeline resumes.
- Speed, offset, volume, and personal best are stored locally when storage is available.

## User MIDI charts and tap sound

The page accepts `.mid`/`.midi` files locally through MY MIDI CHART. File contents
are parsed in the browser; choosing a file does not upload it or replace the
public chart. The existing test chart remains the default on reload.

- MIDI note numbers **60, 62, 64, 65** map to **Q, W, E, R** respectively.
  These are C/D/E/F starting at middle C. Octave labels vary by DAW settings;
  the numbers are authoritative. Other pitches are ignored and reported.
- Note-on sets the hit time. Notes shorter than one quarter note are taps.
  Notes at least one quarter note long are holds, ending at note-off. Use
  1/16 notes for consistent tap entry. Velocity is ignored except that zero
  velocity note-on is a note-off, as specified by MIDI.
- Type 0/1 Standard MIDI Files with PPQ timing are supported. The parser merges
  tempo maps across tracks and channels, handles running status, and rejects
  missing note-offs and overlapping inputs on the same lane. SMPTE and type 2
  are rejected with a user-visible explanation.
- Align MIDI zero with the audio zero; do not trim the leading rest. Export the
  tempo map from REAPER. Missing initial tempo is explicitly reported and uses
  Rolling's 162 BPM fallback. MIDI duration need not equal the audio duration.
- Playback remains the first **60 seconds**. Later notes are excluded and holds
  crossing the end are shortened; these adjustments are reported after import.
- Imported chart scores have separate IDs derived from MIDI contents.
- The user-supplied tap WAV is converted to mono 44.1 kHz/16-bit PCM without
  changing its speed. Each new gameplay key/pointer press triggers it, even
  when no note is hit. Holding a key does not retrigger. Tap volume and preview
  are separate from music volume. The output limiter controls overlapping peaks.

Run `node --test rhythm/*.test.mjs` to include MIDI parsing and tempo-map tests.

## Verification

`node --test rhythm/engine.test.mjs` from the repository root checks full-chart
perfect/miss outcomes, lane overlap, held-key repeats, chords, and hold tails.
Browser checks should cover start, keyboard input, pause/resume, retry, the
one-minute result screen, and mobile layout. Subjective audio alignment should
also be checked on the player's actual output device.
