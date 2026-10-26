import { describe, it, expect } from 'vitest';
import { RaceSimulation, applyHit } from '../src/simulation';
import { TRACK, LANE_OFFSETS, ROUTE_GATES, INTERACTIONS, NITRO_PICKUPS } from '../src/track';
import { CHARACTERS, EMPTY_INPUT } from '../src/types';
import type { InputState, RaceConfig, Lane } from '../src/types';
import { SaveStore } from '../src/storage';
const config: RaceConfig = {
  characterId: 'panda',
  difficulty: 'normal',
  mode: 'time',
  driving: 'assisted',
};
function make(extra: Partial<RaceConfig> = {}) {
  const s = new RaceSimulation({ ...config, ...extra });
  s.startImmediately();
  return s;
}
function step(s: RaceSimulation, seconds: number, input: InputState = EMPTY_INPUT) {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) s.step(1 / 60, input);
}
function place(s: RaceSimulation, progress: number, lane: Lane = 0) {
  const r = s.racers[0],
    p = TRACK.at(progress, LANE_OFFSETS[lane + 1]);
  Object.assign(r, {
    x: p.x,
    z: p.z,
    yaw: p.yaw,
    progress,
    lastProgress: progress,
    lane: LANE_OFFSETS[lane + 1],
    targetLane: lane,
    speed: 20,
    completedDistance: (r.laps + progress) * TRACK.length,
  });
}
function finish(s: RaceSimulation, active = false) {
  while (s.phase !== 'finished' && s.elapsed < 220) {
    const r = s.racers[0],
      prompt = s.interactionPrompt();
    s.step(
      1 / 60,
      active
        ? {
            ...EMPTY_INPUT,
            nitro: r.nitro >= 30 && r.nitroTime === 0,
            interact: !!prompt?.perfect,
            lane: s.routePrompt() ? 1 : 0,
            item: !!r.item,
          }
        : EMPTY_INPUT,
    );
  }
  return s.racers[0];
}
describe('accessible assisted racing', () => {
  it.each(
    CHARACTERS.flatMap((c) => (['easy', 'normal', 'hard'] as const).map((d) => [c.id, d] as const)),
  )('%s / %s finishes all three valid laps without player input', (characterId, difficulty) => {
    const s = make({ characterId, difficulty, mode: 'race' });
    const r = finish(s);
    expect(s.phase).toBe('finished');
    expect(r.lapTimes).toHaveLength(3);
    expect(r.nextCheckpoint).toBe(1);
    expect(r.finishTime).toBeGreaterThan(90);
    expect(r.finishTime).toBeLessThan(200);
    expect(r.nitroUses).toBe(0);
    expect(r.successfulActions).toBe(0);
    expect(TRACK.nearest(r.x, r.z, r.progress).distance).toBeLessThan(8.5);
  });
  it('rewards active decisions with substantially faster completion', () => {
    const passive = finish(make()),
      active = finish(make(), true);
    expect(active.finishTime!).toBeLessThan(passive.finishTime! * 0.9);
    expect(active.perfectActions).toBe(9);
    expect(active.nitroUses).toBeGreaterThan(20);
    console.info(
      'ASSISTED PACE',
      JSON.stringify({
        passive: passive.finishTime,
        active: active.finishTime,
        perfect: active.perfectActions,
        nitro: active.nitroUses,
      }),
    );
  });
  it.each([-1, 0, 1] as const)(
    'keeps selected lane %s through a full lap with no steering',
    (lane) => {
      const s = make();
      s.step(1 / 60, { ...EMPTY_INPUT, lane });
      let maximumOffset = 0;
      while (s.racers[0].laps < 1 && s.elapsed < 80) {
        s.step(1 / 60);
        const r = s.racers[0];
        maximumOffset = Math.max(maximumOffset, TRACK.nearest(r.x, r.z, r.progress).distance);
      }
      expect(s.racers[0].laps).toBe(1);
      expect(maximumOffset).toBeLessThan(6);
      expect(s.racers[0].targetLane).toBe(lane);
    },
  );
  it('changes lanes smoothly with one press and holds the chosen line', () => {
    const s = make(),
      r = s.racers[0];
    step(s, 1);
    const oldX = r.x,
      oldZ = r.z;
    s.step(1 / 60, { ...EMPTY_INPUT, lane: 1 });
    expect(Math.hypot(r.x - oldX, r.z - oldZ)).toBeLessThan(1);
    step(s, 2);
    expect(r.lane).toBeCloseTo(LANE_OFFSETS[2], 1);
    expect(r.targetLane).toBe(1);
    s.step(1 / 60, { ...EMPTY_INPUT, lane: -1 });
    step(s, 2);
    expect(r.lane).toBeCloseTo(LANE_OFFSETS[0], 1);
  });
  it('spends one nitro charge per action, speeds up and recharges', () => {
    const s = make(),
      r = s.racers[0];
    step(s, 2);
    const speed = r.speed,
      nitro = r.nitro;
    s.step(1 / 60, { ...EMPTY_INPUT, nitro: true });
    expect(r.nitro).toBeCloseTo(nitro - 30 + 0.1);
    expect(r.nitroUses).toBe(1);
    s.step(1 / 60, { ...EMPTY_INPUT, nitro: true });
    expect(r.nitroUses).toBe(1);
    step(s, 0.7);
    expect(r.speed).toBeGreaterThan(speed + 7);
    r.nitro = 5;
    r.nitroTime = 0;
    s.step(1 / 60, { ...EMPTY_INPUT, nitro: true });
    expect(r.nitroUses).toBe(1);
    step(s, 1);
    expect(r.nitro).toBeGreaterThan(10);
  });
  it('retains items until the player explicitly uses them', () => {
    const s = make(),
      r = s.racers[0];
    r.item = 'shield';
    step(s, 5);
    expect(r.item).toBe('shield');
    expect(r.shield).toBe(0);
    s.step(1 / 60, { ...EMPTY_INPUT, item: true });
    expect(r.item).toBe(null);
    expect(r.shield).toBe(6);
  });
  it('recovers from a hit and collision displacement without steering input', () => {
    const s = make(),
      r = s.racers[0];
    step(s, 4);
    const before = r.completedDistance;
    expect(applyHit(r)).toBe('hit');
    const p = TRACK.at(r.progress, 9);
    r.x = p.x;
    r.z = p.z;
    step(s, 3);
    expect(r.completedDistance).toBeGreaterThan(before + 35);
    expect(Math.abs(r.lane)).toBeLessThan(0.2);
    expect(r.speed).toBeGreaterThan(15);
  });
  it('pauses nitro, animations, energy regeneration and progress together', () => {
    const s = make(),
      r = s.racers[0];
    s.step(1 / 60, { ...EMPTY_INPUT, nitro: true });
    const before = JSON.stringify(s.snapshot());
    s.pause();
    const paused = JSON.stringify(s.snapshot());
    step(s, 5, { ...EMPTY_INPUT, lane: 1, interact: true, nitro: true });
    expect(JSON.stringify(s.snapshot())).toBe(paused);
    s.resume();
    expect(JSON.stringify(s.snapshot())).toBe(before);
  });
  it('preserves manual throttle and steering behavior', () => {
    const s = make({ driving: 'manual' });
    step(s, 3);
    expect(s.racers[0].speed).toBe(0);
    step(s, 1, { ...EMPTY_INPUT, throttle: 1 });
    expect(s.racers[0].speed).toBeGreaterThan(10);
    expect(s.snapshot().route).toBe(null);
    expect(s.snapshot().pickups).toHaveLength(0);
  });
});
describe('assisted difficulty balance', () => {
  it.each(CHARACTERS)('$id does not win normal difficulty without active decisions', ({ id }) => {
    const s = make({ characterId: id, difficulty: 'normal', mode: 'race' });
    finish(s);
    expect(s.phase).toBe('finished');
    expect(s.snapshot().standings[0].id).not.toBe(0);
  });
  it.each(CHARACTERS)(
    '$id benefits from active decisions on hard while opponents stay competitive',
    ({ id }) => {
      const passive = make({ characterId: id, difficulty: 'hard', mode: 'race' });
      const active = make({ characterId: id, difficulty: 'hard', mode: 'race' });
      const passivePlayer = finish(passive);
      const activePlayer = finish(active, true);
      expect(passive.phase).toBe('finished');
      expect(active.phase).toBe('finished');
      expect(activePlayer.finishTime!).toBeLessThan(passivePlayer.finishTime! * 0.9);
      const bestOpponentDistance = Math.max(
        ...active.racers.slice(1).map((r) => r.completedDistance),
      );
      expect(bestOpponentDistance).toBeGreaterThan(
        activePlayer.completedDistance - TRACK.length * 0.2,
      );
    },
  );
});
describe('route rewards and timing interactions', () => {
  it.each(INTERACTIONS)('$title accepts one perfect action each lap', (point) => {
    const s = make(),
      r = s.racers[0];
    place(s, point.progress);
    r.nitro = 20;
    s.step(1 / 60, { ...EMPTY_INPUT, interact: true });
    expect(r.perfectActions).toBe(1);
    expect(r.nitro).toBeCloseTo(45.1);
    expect(r.actionKind).toBe(point.kind);
    expect(r.boost).toBe(2.2);
    s.step(1 / 60, { ...EMPTY_INPUT, interact: true });
    expect(r.perfectActions).toBe(1);
    s.recover(r);
    place(s, point.progress);
    s.step(1 / 60, { ...EMPTY_INPUT, interact: true });
    expect(r.perfectActions).toBe(1);
    r.laps = 1;
    place(s, point.progress);
    s.step(1 / 60, { ...EMPTY_INPUT, interact: true });
    expect(r.perfectActions).toBe(2);
  });
  it('distinguishes early, good and missed timing without stopping the player', () => {
    const s = make(),
      r = s.racers[0],
      p = INTERACTIONS[0].progress;
    place(s, p - 40 / TRACK.length);
    s.step(1 / 60, { ...EMPTY_INPUT, interact: true });
    expect(r.successfulActions).toBe(0);
    place(s, p - 15 / TRACK.length);
    s.step(1 / 60, { ...EMPTY_INPUT, interact: true });
    expect(r.successfulActions).toBe(1);
    expect(r.perfectActions).toBe(0);
    const missed = make();
    place(missed, p + 30 / TRACK.length);
    missed.step(1 / 60, { ...EMPTY_INPUT, interact: true });
    expect(missed.racers[0].successfulActions).toBe(0);
    expect(missed.racers[0].speed).toBeGreaterThan(19);
  });
  it.each([-1, 0, 1] as const)(
    'resolves lane %s rewards once per lap and cannot farm recovery',
    (lane) => {
      const s = make({ mode: 'race' }),
        r = s.racers[0];
      s.racers.splice(1);
      const p = ROUTE_GATES[0].progress;
      place(s, p - 0.1 / TRACK.length, lane);
      r.nitro = 0;
      r.item = null;
      s.step(1 / 60);
      const energy = r.nitro,
        item = r.item;
      if (lane < 0) expect(energy).toBeCloseTo(35.1);
      else if (lane === 0) expect(energy).toBeCloseTo(10.1);
      else expect(item).not.toBe(null);
      s.recover(r);
      place(s, p - 0.1 / TRACK.length, lane);
      s.step(1 / 60);
      expect(r.nitro).toBeCloseTo(energy + 0.1);
      expect(r.item).toBe(item);
    },
  );
  it('gives time-trial boost instead of items on the outer route', () => {
    const s = make(),
      r = s.racers[0];
    place(s, ROUTE_GATES[0].progress - 0.1 / TRACK.length, 1);
    s.step(1 / 60);
    expect(r.boost).toBe(1.5);
    expect(r.item).toBe(null);
  });
  it('collects energy crystals only on the matching line, once per lap', () => {
    const s = make(),
      r = s.racers[0],
      p = NITRO_PICKUPS[0];
    r.nitro = 0;
    place(s, p.progress, 1);
    s.step(1 / 60);
    expect(s.pickups[0].collectedLap).toBe(-1);
    place(s, p.progress, p.lane);
    s.step(1 / 60);
    expect(s.pickups[0].collectedLap).toBe(0);
    expect(r.nitro).toBeCloseTo(20.2);
    place(s, p.progress, p.lane);
    s.step(1 / 60);
    expect(r.nitro).toBeCloseTo(20.3);
    r.laps = 1;
    place(s, p.progress, p.lane);
    s.step(1 / 60);
    expect(s.pickups[0].collectedLap).toBe(1);
    expect(r.nitro).toBeCloseTo(40.4);
  });
  it('restarts with fresh rewards, charge, timing and lane state', () => {
    const old = make();
    place(old, INTERACTIONS[0].progress);
    old.step(1 / 60, { ...EMPTY_INPUT, interact: true, lane: 1, nitro: true });
    const fresh = make();
    expect(fresh.racers[0]).toMatchObject({
      nitro: 60,
      targetLane: 0,
      nitroTime: 0,
      actionKind: null,
      actionTime: 0,
      perfectActions: 0,
      nitroUses: 0,
    });
    place(fresh, INTERACTIONS[0].progress);
    expect(fresh.interactionPrompt()?.available).toBe(true);
    expect(fresh.pickups.every((p) => p.collectedLap === -1)).toBe(true);
  });
});
describe('records across driving styles', () => {
  it('defaults old saves to assisted while keeping original manual records intact', () => {
    let raw = JSON.stringify({
      settings: { characterId: 'fox' },
      records: { 'time:fox': { lap: 50, race: 155 } },
    });
    const storage = {
      getItem: () => raw,
      setItem: (_key: string, value: string) => {
        raw = value;
      },
    };
    const store = new SaveStore(storage);
    expect(store.data.settings.driving).toBe('assisted');
    expect(store.record('fox', 'time', 'manual').race).toBe(155);
    expect(store.record('fox', 'time', 'assisted').race).toBe(null);
    store.updateRecord('fox', 'time', 40, 120, 'assisted');
    store.setSettings({ driving: 'manual' });
    const reloaded = new SaveStore(storage);
    expect(reloaded.data.settings.driving).toBe('manual');
    expect(reloaded.record('fox', 'time', 'manual').race).toBe(155);
    expect(reloaded.record('fox', 'time', 'assisted').race).toBe(120);
  });
});
