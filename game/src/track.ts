import type { Point, TrackPoint } from './types';
export const ROAD_WIDTH = 17;
export const CHECKPOINTS = 12;
export const CONTROL_POINTS: Point[] = [
  [0, 105],
  [55, 110],
  [112, 90],
  [150, 45],
  [160, -8],
  [143, -45],
  [105, -42],
  [94, -85],
  [122, -116],
  [82, -143],
  [22, -146],
  [-25, -122],
  [-65, -140],
  [-123, -117],
  [-150, -66],
  [-128, -12],
  [-85, 0],
  [-75, 44],
  [-114, 64],
  [-104, 103],
  [-50, 120],
].map(([x, z]) => ({ x, z }));
export const mod = (n: number, m = 1) => ((n % m) + m) % m;
export const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export const angleDelta = (a: number, b: number) => mod(a - b + Math.PI, Math.PI * 2) - Math.PI;
const catmull = (a: number, b: number, c: number, d: number, t: number) =>
  0.5 *
  (2 * b +
    (-a + c) * t +
    (2 * a - 5 * b + 4 * c - d) * t * t +
    (-a + 3 * b - 3 * c + d) * t * t * t);
function spline(t: number): Point {
  const f = mod(t) * CONTROL_POINTS.length,
    i = Math.floor(f),
    u = f - i,
    n = CONTROL_POINTS.length;
  const a = CONTROL_POINTS[mod(i - 1, n)],
    b = CONTROL_POINTS[i],
    c = CONTROL_POINTS[(i + 1) % n],
    d = CONTROL_POINTS[(i + 2) % n];
  return { x: catmull(a.x, b.x, c.x, d.x, u), z: catmull(a.z, b.z, c.z, d.z, u) };
}
export class Track {
  readonly samples: TrackPoint[] = [];
  readonly length: number;
  constructor() {
    const raw = Array.from({ length: 2001 }, (_, i) => spline(i / 2000)),
      dist = [0];
    for (let i = 1; i < raw.length; i++)
      dist.push(dist[i - 1] + Math.hypot(raw[i].x - raw[i - 1].x, raw[i].z - raw[i - 1].z));
    this.length = dist[dist.length - 1];
    let j = 0;
    for (let i = 0; i < 900; i++) {
      const target = (this.length * i) / 900;
      while (j < dist.length - 2 && dist[j + 1] < target) j++;
      const a = (target - dist[j]) / (dist[j + 1] - dist[j]);
      const x = raw[j].x + (raw[j + 1].x - raw[j].x) * a,
        z = raw[j].z + (raw[j + 1].z - raw[j].z) * a;
      this.samples.push({ x, z, y: this.height(x, z), yaw: 0, progress: i / 900 });
    }
    for (let i = 0; i < this.samples.length; i++) {
      const a = this.samples[mod(i - 1, 900)],
        b = this.samples[(i + 1) % 900];
      this.samples[i].yaw = Math.atan2(b.x - a.x, b.z - a.z);
    }
  }
  height(x: number, z: number) {
    return 1.2 + 1.8 * Math.exp(-((x + 105) ** 2 + (z + 100) ** 2) / 2200);
  }
  at(progress: number, offset = 0): TrackPoint {
    const f = mod(progress) * this.samples.length,
      i = Math.floor(f),
      t = f - i,
      a = this.samples[i],
      b = this.samples[(i + 1) % this.samples.length];
    const yaw = a.yaw + angleDelta(b.yaw, a.yaw) * t;
    const x = a.x + (b.x - a.x) * t + Math.cos(yaw) * offset,
      z = a.z + (b.z - a.z) * t - Math.sin(yaw) * offset;
    return { x, z, y: this.height(x, z), yaw, progress: mod(progress) };
  }
  nearest(
    x: number,
    z: number,
    hint?: number,
  ): { point: TrackPoint; distance: number; offset: number } {
    let best = Infinity,
      index = 0;
    const center = hint === undefined ? 0 : Math.round(mod(hint) * 900),
      range = hint === undefined ? 450 : 40;
    for (let k = -range; k <= range; k++) {
      const i = mod(center + k, 900),
        p = this.samples[i],
        d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < best) {
        best = d;
        index = i;
      }
    }
    const a = this.samples[index],
      b = this.samples[(index + 1) % 900],
      prev = this.samples[mod(index - 1, 900)];
    const candidate = (p: TrackPoint, q: TrackPoint, base: number) => {
      const dx = q.x - p.x,
        dz = q.z - p.z,
        t = clamp(((x - p.x) * dx + (z - p.z) * dz) / (dx * dx + dz * dz), 0, 1);
      const xx = p.x + dx * t,
        zz = p.z + dz * t;
      return { d: (xx - x) ** 2 + (zz - z) ** 2, progress: mod((base + t) / 900) };
    };
    const c = candidate(a, b, index),
      d = candidate(prev, a, index - 1),
      chosen = c.d < d.d ? c : d,
      point = this.at(chosen.progress);
    return {
      point,
      distance: Math.sqrt(chosen.d),
      offset: (x - point.x) * Math.cos(point.yaw) - (z - point.z) * Math.sin(point.yaw),
    };
  }
}
export const TRACK = new Track();
export const BOOST_PADS = [0.065, 0.37, 0.715];
export const BRIDGE_START = 0.185;
export const BRIDGE_END = 0.245;

export const LANE_OFFSETS = [-4.6, 0, 4.6] as const;
export const ROUTE_GATES = [
  { id: 'coast', progress: 0.115 },
  { id: 'grove', progress: 0.67 },
];
export const INTERACTIONS = [
  { id: 'bridge-jump', progress: 0.215, kind: 'jump' as const, title: '木桥飞跃' },
  { id: 'canyon-drift', progress: 0.51, kind: 'drift' as const, title: '砂岩漂移' },
  { id: 'village-spin', progress: 0.87, kind: 'spin' as const, title: '海风回旋' },
];
export const NITRO_PICKUPS = [
  { progress: 0.055, lane: -1 as const },
  { progress: 0.16, lane: 1 as const },
  { progress: 0.3, lane: 1 as const },
  { progress: 0.4, lane: -1 as const },
  { progress: 0.58, lane: 0 as const },
  { progress: 0.74, lane: -1 as const },
  { progress: 0.81, lane: 1 as const },
  { progress: 0.95, lane: 0 as const },
];
export const forwardDistance = (from: number, to: number) =>
  (mod(to - from + 0.5) - 0.5) * TRACK.length;
