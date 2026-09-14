import './effects.mjs?v=compact-hud-v1';
import './song-wheel-fix.mjs?v=scroll-sync-v1';

export const DEFAULT_SETTINGS = Object.freeze({speed:8,offset:0,volume:75,tapVolume:75});
export function readSettings(saved) {
  const result={...DEFAULT_SETTINGS};
  for(const [key,min,max] of [['speed',2,14],['offset',-250,250],['volume',0,100],['tapVolume',0,100]]) {
    if(Number.isFinite(saved?.[key])) result[key]=Math.max(min,Math.min(max,saved[key]));
  }
  return result;
}
// Same slider value now gives 2.5 times the previous tap gain (.6 at 70%).
export function tapLevel(percent) { return percent / 70 * 1.5; }
// Old speed 8 gave 1.24 seconds of visibility. Center the extended scale there.
// Exponential scaling stays positive even at the new high end.
export function approachSeconds(speed) { return 1.24 * 2 ** ((8-speed)/6); }
