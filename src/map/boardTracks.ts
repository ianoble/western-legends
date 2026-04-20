/**
 * Board edge tracks in normalized 0–100 coordinates (same space as {@link BOARD_VIEWBOX_SIZE}).
 *
 * **Wanted** — 3×3 grid, values 1–9, row-major from top-left. Player’s `wantedPoints` maps to
 * that cell (clamped).0 = no marker on the track.
 *
 * **Marshal** — same 3×3 ordering; {@link MARSHAL_TRACK_CENTERS} holds nine authored `[x,y]` pairs.
 *
 * **Legend (LP)** — bottom track, spaces 1–30. `legendaryPoints` maps to that space via
 * {@link trackSlotIndex}: values **1…30** use spaces 1…30, **&gt; 30** clamps to space 30, **≤ 0** = no marker.
 */

/** Nine cell centers for Wanted levels 1–9 (user-authored; third row middle corrects a duplicate in the source list). */
export const WANTED_TRACK_CENTERS: readonly [number, number][] = [
  [7.32, 12.58],
  [10.55, 12.42],
  [13.96, 12.73],
  [7.32, 17.84],
  [10.74, 17.84],
  [13.96, 17.69],
  [7.42, 22.95],
  [10.55, 23.55],
  [13.87, 23.1],
];

/** Nine cell centers for Marshal levels 1–9 (row-major from top-left). */
export const MARSHAL_TRACK_CENTERS: readonly [number, number][] = [
  [6.74, 69.27],
  [10.16, 69.42],
  [13.38, 68.97],
  [6.93, 74.68],
  [9.96, 74.53],
  [13.38, 74.68],
  [6.74, 79.94],
  [10.16, 80.09],
  [13.28, 79.94],
];

/** Thirty cell centers for Legend Points along the bottom edge (space 1 = index 0). Space 26 x is interpolated (duplicate samples at 25–26); one extra tail sample was dropped so the list stays 30 long. */
export const LEGEND_TRACK_CENTERS: readonly [number, number][] = [
  [7.81, 93.48],
  [10.94, 93.63],
  [13.96, 93.33],
  [16.89, 93.63],
  [20.61, 93.78],
  [24.02, 93.48],
  [27.15, 93.48],
  [30.27, 93.63],
  [33.2, 93.48],
  [36.13, 93.48],
  [39.26, 93.33],
  [42.19, 93.63],
  [45.12, 93.63],
  [48.05, 93.63],
  [51.17, 93.63],
  [54.3, 93.63],
  [57.23, 93.78],
  [60.16, 93.48],
  [63.09, 93.48],
  [66.21, 93.33],
  [69.24, 93.33],
  [71.97, 93.33],
  [75.1, 93.48],
  [78.13, 93.63],
  [81.05, 93.63],
  [82.52, 93.63],
  [83.98, 93.63],
  [87.01, 94.08],
  [90.04, 93.48],
  [96.29, 93.48],
];

export function trackSlotIndex(points: number, maxSlot: number): number | null {
  if (points <= 0) return null;
  return Math.min(points, maxSlot) - 1;
}
