export const DEFAULT_SETTINGS = Object.freeze({speed:8,offset:0,volume:70,tapVolume:70});
export function readSettings(saved) {
  const result={...DEFAULT_SETTINGS};
  for(const [key,min,max] of [['speed',2,14],['offset',-250,250],['volume',0,100],['tapVolume',0,100]]) {
    if(Number.isFinite(saved?.[key])) result[key]=Math.max(min,Math.min(max,saved[key]));
  }
  return result;
}
// The old maximum tap gain was .4. New 70% equals 150% of that maximum.
export function tapLevel(percent) { return percent / 70 * .6; }
// Old speed 8 gave 1.24 seconds of visibility. Center the extended scale there.
// Exponential scaling stays positive even at the new high end.
export function approachSeconds(speed) { return 1.24 * 2 ** ((8-speed)/6); }
