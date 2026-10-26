export type IconName =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'fullscreen'
  | 'pause'
  | 'boost'
  | 'shield'
  | 'water'
  | 'banana'
  | 'homing'
  | 'pulse'
  | 'oil'
  | 'road'
  | 'sand'
  | 'wood'
  | 'wet'
  | 'air'
  | 'impact'
  | 'wind'
  | 'box'
  | 'clock'
  | 'wheel'
  | 'spark'
  | 'check';
const paths: Record<IconName, string> = {
  left: '<path d="M20 12H4m7-7-7 7 7 7"/>',
  right: '<path d="M4 12h16m-7-7 7 7-7 7"/>',
  up: '<path d="M12 20V4m-7 7 7-7 7 7"/>',
  down: '<path d="M12 4v16m-7-7 7 7 7-7"/>',
  fullscreen: '<path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  boost: '<path d="M9 3h6m-5 0v5l-4 5v7h12v-7l-4-5V3M6 14h12m-6 1-2 2h3l-2 2"/>',
  shield: '<path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  water: '<path d="M12 3S5 11 5 15a7 7 0 0 0 14 0c0-4-7-12-7-12Z"/><path d="M8 15a4 4 0 0 0 4 4"/>',
  banana:
    '<path d="M17 3c0 8-4 13-12 14 4 5 13 5 15-4 1-4 0-7-1-10h-2Z"/><path d="m17 3 2-1M5 17l-2 1"/>',
  homing:
    '<path d="M12 20c-5 0-9-4-8-9S10 2 15 4s7 7 4 11-9 3-10 0 1-6 4-5 2 4 0 4"/><path d="m4 17-2 3 5-1"/>',
  pulse:
    '<circle cx="12" cy="12" r="3"/><path d="M6 6a8.5 8.5 0 0 0 0 12M18 6a8.5 8.5 0 0 1 0 12M3 3a13 13 0 0 0 0 18M21 3a13 13 0 0 1 0 18"/>',
  oil: '<path d="M12 3c-3 4-5 6-5 9a5 5 0 0 0 10 0c0-3-2-5-5-9Z"/><path d="M6 16c-5 1-4 5 6 5s11-4 6-5M10 12c0 1 1 2 2 2"/>',
  road: '<path d="M7 3 3 21m14-18 4 18M12 3v3m0 4v4m0 4v3"/>',
  sand: '<path d="M3 14c3-5 6-5 9 0s6 5 9 0M3 20h18"/><circle cx="5" cy="8" r=".7"/><circle cx="12" cy="5" r=".7"/><circle cx="19" cy="9" r=".7"/>',
  wood: '<path d="M3 6h18v12H3V6Zm0 6h18M8 6v6m8 0v6M6 9h1m10 6h1"/>',
  wet: '<path d="M12 3s-5 5-5 8a5 5 0 0 0 10 0c0-3-5-8-5-8ZM3 20c3-3 6 3 9 0s6 3 9 0"/>',
  air: '<path d="M3 17c4-11 14-11 18 0M3 21h18m-12-4h6m-4-7h2"/>',
  impact: '<path d="m12 2 2 6 6-3-3 6 5 3-7 1-1 7-4-6-6 3 3-7-5-3 7-1 3-6Z"/>',
  wind: '<path d="M3 8h12a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h6a3 3 0 1 1-3 3"/>',
  box: '<path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm0 10v9M3 8l9 5 9-5M8 5l9 5"/>',
  clock: '<circle cx="12" cy="13" r="8"/><path d="M9 2h6m-3 0v3m0 4v5l3 2M18 5l2 2"/>',
  wheel:
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="m4 8 6 3m4 0 6-3m-8 6v7"/>',
  spark: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
};
/** Shared geometric icons. Text labels remain on the surrounding controls. */
export function icon(name: IconName, className = '') {
  return (
    '<svg class="ui-icon ' +
    className +
    '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    paths[name] +
    '</svg>'
  );
}
export function directionKey(direction: 'left' | 'right' | 'up' | 'down') {
  const labels = { left: '左方向键', right: '右方向键', up: '上方向键', down: '下方向键' };
  return (
    '<kbd class="direction-key">' +
    icon(direction) +
    '<span class="sr-only">' +
    labels[direction] +
    '</span></kbd>'
  );
}
