# SNAP Web UI 0.4.134

The browser demo now uses the VST 0.4.134 WATER and WOOD FLOOR scenes, supplied
dot-text artwork, lower-left pedal names, smaller BOOST label, relocated utility
controls, and a five-position CAB knob (OFF, A, B, C, D).

WATER uses #D01645 for the main labels, selected preset, save icon, and gear.
The GoodTarget backing is #DDF3EF at 90% opacity, above the moving meter fill.
WOOD FLOOR keeps grey labels and a white GoodTarget label. Background buttons
store the chosen theme locally. The save icon stores one preset in the current
browser; the original built-in presets remain available.
Startup selects and applies Snap + CAB before initializing audio. Pointer/touch
interaction does not outline the knobs; keyboard navigation retains a focus ring.
Pedal LEDs use the VST's broad mist and inner bloom, switched off with each effect.

EQ keeps its frequency labels, hides all eleven numeric readouts, and uses the
supplied OFF artwork. The original sample player, Coming Soon gate, page window
manager, download availability, MONO/LOW restrictions, sample gain calibration,
IR routing, and DSP remain in place. UI version and DSP version are separate:
the Web DSP remains v0.4.109.

## Assets

`ui/v134/scene-water.png` and `scene-wood.png` were exported using the existing
JUCE SceneRenderer with the original COMP_FluidArt / DRIVE_FluidArt images.
The 54 PNGs under `ui/v134/labels` are copied from the approved VST text assets.
CSS applies colour through their alpha masks without modifying the source PNGs.
`labels.json` records the complete-word labels and their aspect ratios.

## Validation

Run `node --test Plugin/snap-web/snap-ui.test.mjs` from the repository root.
This exercises all five real CAB gain routes, detent clamping, MONO/LOW
restrictions, and the actual WASM/AudioWorklet processing with parameter changes.

Browser checks: sample play/stop and sample switching, CAB keyboard detents,
built-in preset/CAB synchronisation, saved preset restoration, theme switching,
EQ on/off and reset, numeric readout hiding, desktop and 390px mobile layout.
Use the existing ten-click Coming Soon preview to inspect the page locally.
The UI update does not remove that gate or enable the VST download.
