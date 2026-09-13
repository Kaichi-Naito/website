// Perspective motion: slower near the horizon, faster near the judgment line.
// Keep 0 (spawn) and 1 (hit time) fixed, independently of the scoring clock.
export function projectDepth(depth) { return depth / (2 - depth); }
