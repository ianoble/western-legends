/**
 * Board edge tracks in normalized 0–100 coordinates (same space as {@link BOARD_VIEWBOX_SIZE}).
 *
 * **Wanted** — 3×3 grid, values 1–9, row-major from top-left. Player’s `wantedPoints` maps to
 * that cell (clamped).0 = no marker on the track.
 *
 * **Marshal** — same 3×3 ordering; {@link MARSHAL_TRACK_CENTERS} holds nine authored `[x,y]` pairs.
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

export function trackSlotIndex(points: number, maxSlot: number): number | null {
  if (points <= 0) return null;
  return Math.min(points, maxSlot) - 1;
}
