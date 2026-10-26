import { describe, it, expect, vi } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { RaceSimulation } from '../src/simulation';
import { TRACK, LANE_OFFSETS, ROUTE_GATES } from '../src/track';
import { EMPTY_INPUT } from '../src/types';
import type { DrivingMode, Lane } from '../src/types';
import { KeyboardInput } from '../src/input';
it('retains edge actions across render frames until a physics step consumes them', () => {
  const target = new EventTarget();
  vi.stubGlobal('window', target);
  try {
    const input = new KeyboardInput(() => {});
    input.active = true;
    const event = Object.assign(new Event('keydown'), { code: 'KeyE', repeat: false });
    target.dispatchEvent(event);
    expect(input.read().item).toBe(true);
    expect(input.read().item).toBe(true);
    input.consumeActions();
    expect(input.read().item).toBe(false);
  } finally {
    vi.unstubAllGlobals();
  }
});
it('clear removes held controls and pending actions before pause or restart', () => {
  const target = new EventTarget();
  vi.stubGlobal('window', target);
  try {
    const input = new KeyboardInput(() => {});
    input.active = true;
    for (const code of ['KeyW', 'KeyE', 'KeyR'])
      target.dispatchEvent(Object.assign(new Event('keydown'), { code, repeat: false }));
    expect(input.read()).toMatchObject({ throttle: 1, item: true, recover: true });
    input.clear();
    expect(input.read()).toMatchObject({ throttle: 0, item: false, recover: false });
  } finally {
    vi.unstubAllGlobals();
  }
});
it('routes keyboard and buttons to the same single-use assisted actions', () => {
  const target = new EventTarget();
  vi.stubGlobal('window', target);
  try {
    const input = new KeyboardInput(() => {});
    input.active = true;
    for (const code of ['ArrowLeft', 'Space', 'KeyF'])
      target.dispatchEvent(Object.assign(new Event('keydown'), { code, repeat: false }));
    expect(input.read()).toMatchObject({ lane: -1, nitro: true, interact: true, drift: true });
    input.consumeActions();
    for (const code of ['ArrowLeft', 'Space', 'KeyF'])
      target.dispatchEvent(Object.assign(new Event('keydown'), { code, repeat: true }));
    expect(input.read()).toMatchObject({ lane: null, nitro: false, interact: false, drift: true });
    input.trigger(1);
    input.trigger('nitro');
    input.trigger('interact');
    expect(input.read()).toMatchObject({ lane: 1, nitro: true, interact: true });
    input.clear();
    expect(input.read()).toMatchObject({ lane: null, nitro: false, interact: false, drift: false });
  } finally {
    vi.unstubAllGlobals();
  }
});

function controlHarness() {
  const target = new EventTarget();
  vi.stubGlobal('window', target);
  const input = new KeyboardInput(() => {});
  input.active = true;
  return {
    input,
    press(code: string) {
      target.dispatchEvent(Object.assign(new Event('keydown'), { code, repeat: false }));
    },
  };
}
function positionedRace(driving: DrivingMode, progress: number) {
  const s = new RaceSimulation({
    characterId: 'panda',
    difficulty: 'normal',
    mode: 'time',
    driving,
  });
  const p = TRACK.at(progress);
  Object.assign(s.racers[0], {
    x: p.x,
    z: p.z,
    yaw: p.yaw,
    velocityYaw: p.yaw,
    previousX: p.x,
    previousZ: p.z,
    previousYaw: p.yaw,
    progress,
    lastProgress: progress,
    lane: 0,
    targetLane: 0,
    speed: 18,
    nextCheckpoint: Math.floor(progress * 12) + 1,
    completedDistance: progress * TRACK.length,
  });
  s.startImmediately();
  return s;
}
// Use Three's actual camera projection, independently of Track.at's normal signs.
function chaseCamera(progress: number) {
  const p = TRACK.at(progress);
  const forward = new Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
  const position = new Vector3(p.x, p.y, p.z);
  const camera = new PerspectiveCamera(58, 16 / 9, 0.15, 1300);
  camera.position
    .copy(position)
    .addScaledVector(forward, -8.1)
    .add(new Vector3(0, 4.35, 0));
  camera.lookAt(
    position
      .clone()
      .addScaledVector(forward, 7)
      .add(new Vector3(0, 1.35, 0)),
  );
  camera.updateMatrixWorld(true);
  return camera;
}
function screenX(s: RaceSimulation, camera: PerspectiveCamera) {
  const r = s.racers[0];
  return new Vector3(r.x, TRACK.height(r.x, r.z), r.z).project(camera).x;
}
const directions = [
  { code: 'ArrowLeft', lane: -1 as Lane },
  { code: 'ArrowRight', lane: 1 as Lane },
  { code: 'KeyA', lane: -1 as Lane },
  { code: 'KeyD', lane: 1 as Lane },
];
describe('driver directions in the real chase camera frame', () => {
  it.each([0, 0.25, 0.5, 0.75])(
    'places left and right lanes on their screen sides at %s',
    (progress) => {
      const camera = chaseCamera(progress);
      const center = TRACK.at(progress);
      const centerX = new Vector3(center.x, center.y, center.z).project(camera).x;
      for (const lane of [-1, 1] as const) {
        const p = TRACK.at(progress, LANE_OFFSETS[lane + 1]);
        expect((new Vector3(p.x, p.y, p.z).project(camera).x - centerX) * lane).toBeGreaterThan(
          0.1,
        );
        expect(TRACK.nearest(p.x, p.z, progress).offset).toBeCloseTo(LANE_OFFSETS[lane + 1], 1);
      }
    },
  );
  it.each(
    directions.flatMap((direction) =>
      [0, 0.25, 0.5, 0.75].map((progress) => ({ ...direction, progress })),
    ),
  )(
    'makes $code and its click select the same visible lane at $progress',
    ({ code, lane, progress }) => {
      const { input, press } = controlHarness();
      try {
        const keyboard = positionedRace('assisted', progress);
        const button = positionedRace('assisted', progress);
        const neutral = positionedRace('assisted', progress);
        const camera = chaseCamera(progress);
        press(code);
        keyboard.step(1 / 60, input.read());
        input.clear();
        input.trigger(lane);
        button.step(1 / 60, input.read());
        neutral.step(1 / 60);
        for (let i = 1; i < 18; i++) {
          keyboard.step(1 / 60);
          button.step(1 / 60);
          neutral.step(1 / 60);
        }
        expect((screenX(keyboard, camera) - screenX(neutral, camera)) * lane).toBeGreaterThan(0.02);
        expect(button.racers[0].x).toBeCloseTo(keyboard.racers[0].x, 8);
        expect(button.racers[0].z).toBeCloseTo(keyboard.racers[0].z, 8);
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );
  it.each(
    directions.flatMap((direction) =>
      [0, 0.25, 0.5, 0.75].flatMap((progress) =>
        [false, true].map((drift) => ({ ...direction, progress, drift })),
      ),
    ),
  )(
    'turns $code toward its screen side at $progress with drift=$drift',
    ({ code, lane, progress, drift }) => {
      const { input, press } = controlHarness();
      try {
        const turning = positionedRace('manual', progress);
        const neutral = positionedRace('manual', progress);
        const camera = chaseCamera(progress);
        press(code);
        if (drift) press('Space');
        for (let i = 0; i < 18; i++) {
          turning.step(1 / 60, input.read());
          neutral.step(1 / 60, EMPTY_INPUT);
          // Starting a drift must not first kick the kart toward the opposite side.
          expect((screenX(turning, camera) - screenX(neutral, camera)) * lane).toBeGreaterThan(0);
        }
        expect((screenX(turning, camera) - screenX(neutral, camera)) * lane).toBeGreaterThan(0.001);
        const r = turning.racers[0];
        const nose = new Vector3(
          r.x + Math.sin(r.yaw) * 2,
          TRACK.height(r.x, r.z),
          r.z + Math.cos(r.yaw) * 2,
        );
        const neutralRacer = neutral.racers[0];
        const neutralNose = new Vector3(
          neutralRacer.x + Math.sin(neutralRacer.yaw) * 2,
          TRACK.height(neutralRacer.x, neutralRacer.z),
          neutralRacer.z + Math.cos(neutralRacer.yaw) * 2,
        );
        expect((nose.project(camera).x - neutralNose.project(camera).x) * lane).toBeGreaterThan(0);
        expect(r.drifting).toBe(drift);
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );
  it.each(directions.slice(0, 2))(
    'keeps $code drift slip and releases a charged boost',
    ({ code }) => {
      const { input, press } = controlHarness();
      try {
        const drifting = positionedRace('manual', 0);
        const gripping = positionedRace('manual', 0);
        press(code);
        press('Space');
        for (let i = 0; i < 45; i++) {
          drifting.step(1 / 60, input.read());
          gripping.step(1 / 60, { ...input.read(), drift: false });
        }
        const slide = drifting.racers[0];
        const grip = gripping.racers[0];
        const slideAngle = Math.abs(
          Math.atan2(
            Math.sin(slide.yaw - slide.velocityYaw),
            Math.cos(slide.yaw - slide.velocityYaw),
          ),
        );
        const gripAngle = Math.abs(
          Math.atan2(Math.sin(grip.yaw - grip.velocityYaw), Math.cos(grip.yaw - grip.velocityYaw)),
        );
        expect(slide.drifting).toBe(true);
        expect(slideAngle).toBeGreaterThan(0.1);
        expect(slideAngle).toBeGreaterThan(gripAngle * 2);
        expect(slide.driftCharge).toBeCloseTo(0.75);
        drifting.step(1 / 60, EMPTY_INPUT);
        expect(slide.drifting).toBe(false);
        expect(slide.driftCharge).toBe(0);
        expect(slide.boost).toBe(1.1);
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );
  it.each([-1, 1] as const)('awards the visible route side %s the matching gate reward', (lane) => {
    const progress = ROUTE_GATES[0].progress;
    const s = positionedRace('assisted', progress - 0.1 / TRACK.length);
    const r = s.racers[0];
    const p = TRACK.at(r.progress, LANE_OFFSETS[lane + 1]);
    Object.assign(r, { x: p.x, z: p.z, lane: LANE_OFFSETS[lane + 1], targetLane: lane, nitro: 0 });
    const camera = chaseCamera(progress);
    const gate = TRACK.at(progress, LANE_OFFSETS[lane + 1]);
    expect(new Vector3(gate.x, gate.y, gate.z).project(camera).x * lane).toBeGreaterThan(0.1);
    s.step(1 / 60);
    if (lane === -1) {
      expect(r.nitro).toBeCloseTo(35.1);
      expect(r.boost).toBe(0);
    } else {
      expect(r.nitro).toBeCloseTo(0.1);
      expect(r.boost).toBe(1.5);
    }
  });
});
