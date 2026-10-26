import { describe, it, expect } from 'vitest';
import {
  RaceSimulation,
  advanceCheckpoints,
  chargeBoost,
  applyHit,
  rankRacers,
} from '../src/simulation';
import { TRACK, CHECKPOINTS } from '../src/track';
import { EMPTY_INPUT } from '../src/types';
import type { Difficulty } from '../src/types';
import { SaveStore, DEFAULT_SETTINGS } from '../src/storage';
const config = {
  characterId: 'panda',
  difficulty: 'normal',
  mode: 'race',
  driving: 'manual',
} as const;
const make = () => new RaceSimulation(config);
describe('track and lap rules', () => {
  it('has a closed continuous route of a playable length', () => {
    expect(TRACK.length).toBeGreaterThan(900);
    expect(TRACK.length).toBeLessThan(1250);
    const a = TRACK.at(0),
      b = TRACK.at(1);
    expect(a.x).toBeCloseTo(b.x);
    expect(a.z).toBeCloseTo(b.z);
  });
  it('does not award a lap on the starting grid crossing', () => {
    const racer = make().racers[0];
    racer.lastProgress = 0.999;
    advanceCheckpoints(racer, 0.001, 0, 1);
    expect(racer.laps).toBe(0);
    expect(racer.beforeStart).toBe(false);
  });
  it('requires every checkpoint in the forward direction', () => {
    const racer = make().racers[0];
    racer.beforeStart = false;
    for (let i = 1; i <= CHECKPOINTS; i++) {
      racer.lastProgress = i / CHECKPOINTS - 0.002;
      advanceCheckpoints(racer, (i / CHECKPOINTS + 0.002) % 1, 0, i * 4);
    }
    expect(racer.laps).toBe(1);
    expect(racer.lapTimes).toEqual([48]);
    expect(racer.nextCheckpoint).toBe(1);
  });
  it('rejects reverse finish crossings and skipped checkpoints', () => {
    const racer = make().racers[0];
    racer.lastProgress = 0.002;
    advanceCheckpoints(racer, 0.998, 0, 10);
    expect(racer.laps).toBe(0);
    racer.lastProgress = 0.998;
    advanceCheckpoints(racer, 0.002, 0, 12);
    expect(racer.laps).toBe(0);
  });
  it('rejects checkpoints crossed outside the track', () => {
    const racer = make().racers[0];
    racer.lastProgress = 1 / CHECKPOINTS - 0.002;
    advanceCheckpoints(racer, 1 / CHECKPOINTS + 0.002, 23, 10);
    expect(racer.nextCheckpoint).toBe(1);
  });
  it('ranks completed laps before current-track progress', () => {
    const sim = make();
    sim.racers[0].laps = 1;
    sim.racers[0].progress = 0.01;
    sim.racers[0].beforeStart = false;
    sim.racers[0].completedDistance = 1.01 * TRACK.length;
    sim.racers[1].progress = 0.98;
    sim.racers[1].beforeStart = false;
    sim.racers[1].completedDistance = 0.98 * TRACK.length;
    sim.racers[1].nextCheckpoint = 12;
    expect(rankRacers(sim.racers)[0].id).toBe(0);
  });
  it('does not promote a racer reversing back across the starting line', () => {
    const sim = make(),
      r = sim.racers[0],
      other = sim.racers[1];
    r.lastProgress = 0.999;
    r.completedDistance = -0.001 * TRACK.length;
    advanceCheckpoints(r, 0.001, 0, 1);
    advanceCheckpoints(r, 0.999, 0, 2);
    other.completedDistance = 0.02 * TRACK.length;
    other.progress = 0.02;
    expect(rankRacers([r, other])[0].id).toBe(other.id);
    expect(r.completedDistance).toBeLessThan(0);
  });
  it('ranks finishers by finish time before unfinished racers', () => {
    const sim = make();
    sim.racers[3].finishTime = 145;
    sim.racers[4].finishTime = 140;
    expect(
      rankRacers(sim.racers)
        .slice(0, 2)
        .map((r) => r.id),
    ).toEqual([4, 3]);
  });
});
describe('driving, items and lifecycle', () => {
  it('has two drift boost tiers and no boost before charging', () => {
    expect(chargeBoost(0.69)).toBe(0);
    expect(chargeBoost(0.7)).toBe(1.1);
    expect(chargeBoost(1.8)).toBe(2.1);
  });
  it('releases a charged drift into acceleration', () => {
    const sim = make();
    sim.startImmediately();
    const r = sim.racers[0];
    r.speed = 20;
    r.drifting = true;
    r.driftCharge = 1.9;
    sim.step(1 / 60, { ...EMPTY_INPUT, throttle: 1 });
    expect(r.boost).toBeGreaterThan(2);
    expect(r.driftCharge).toBe(0);
  });
  it('absorbs one attack with a shield then allows a later hit', () => {
    const r = make().racers[0];
    r.speed = 25;
    r.shield = 6;
    expect(applyHit(r)).toBe('shield');
    expect(r.speed).toBe(25);
    expect(r.shield).toBe(0);
    expect(applyHit(r)).toBe('ignored');
    r.invulnerable = 0;
    expect(applyHit(r)).toBe('hit');
    expect(r.speed).toBe(10);
  });
  it('consumes every item once and creates the intended effect', () => {
    const sim = make(),
      r = sim.racers[0];
    for (const item of ['boost', 'shield', 'water', 'banana'] as const) {
      r.item = item;
      r.itemCooldown = 0;
      sim.useItem(r);
      expect(r.item).toBe(null);
    }
    expect(r.boost).toBeGreaterThan(0);
    expect(r.shield).toBe(6);
    expect(sim.projectiles.map((p) => p.type)).toEqual(['water', 'banana']);
  });
  it('pauses both race time and countdown, and resumes the previous phase', () => {
    const sim = make();
    sim.pause();
    sim.step(1);
    expect(sim.countdown).toBe(3.5);
    sim.resume();
    expect(sim.phase).toBe('countdown');
    sim.startImmediately();
    sim.step(0.1);
    sim.pause();
    const time = sim.elapsed;
    sim.step(2);
    expect(sim.elapsed).toBe(time);
    sim.resume();
    expect(sim.phase).toBe('racing');
  });
  it('recovers to the last validated checkpoint without awarding a lap', () => {
    const sim = make(),
      r = sim.racers[0];
    r.nextCheckpoint = 5;
    r.laps = 1;
    r.x = 999;
    sim.recover(r);
    expect(r.progress).toBeCloseTo(4 / CHECKPOINTS + 0.003);
    expect(r.laps).toBe(1);
    expect(r.nextCheckpoint).toBe(5);
    expect(r.speed).toBe(0);
  });
  it('restarting creates a clean race with no lingering effects', () => {
    const first = make();
    first.startImmediately();
    first.racers[0].item = 'water';
    first.useItem(first.racers[0]);
    first.elapsed = 70;
    const second = make();
    expect(second.projectiles).toHaveLength(0);
    expect(second.elapsed).toBe(0);
    expect(second.racers.every((r) => r.laps === 0 && r.boost === 0 && r.shield === 0)).toBe(true);
  });
  it('keeps kart bodies separated in a front-to-back collision', () => {
    const sim = new RaceSimulation({ ...config, mode: 'time' });
    const a = sim.racers[0];
    Object.assign(a, { x: 0, z: 105, yaw: 0, velocityYaw: 0 });
    const b = { ...structuredClone(a), id: 1, z: 108 };
    sim.racers.push(b);
    sim.startImmediately();
    sim.step(1 / 60);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(3.8);
  });
  it('time trial has one racer, no item boxes and no opponents', () => {
    const sim = new RaceSimulation({ ...config, mode: 'time' });
    expect(sim.racers).toHaveLength(1);
    expect(sim.boxes).toHaveLength(0);
  });
});
describe('personal storage', () => {
  const storageWith = (raw: string) => ({
    getItem: () => raw,
    setItem: (_key: string, value: string) => {
      raw = value;
    },
  });
  it.each(['invalid', 7, null, []])('recovers a malformed records container (%j)', (records) => {
    const storage = storageWith(JSON.stringify({ records }));
    const save = new SaveStore(storage);
    expect(save.record('panda', 'time', 'assisted')).toEqual({ lap: null, race: null });
    expect(save.updateRecord('panda', 'time', 40, 120, 'assisted')).toEqual({
      lap: true,
      race: true,
    });
    expect(new SaveStore(storage).record('panda', 'time', 'assisted')).toEqual({
      lap: 40,
      race: 120,
    });
  });
  it.each([
    [{ lap: 35 }, { lap: 35, race: null }, { lap: 35, race: 120 }],
    [{ race: 100 }, { lap: null, race: 100 }, { lap: 40, race: 100 }],
  ])('repairs partial records and retains valid times (%j)', (record, before, after) => {
    const storage = storageWith(JSON.stringify({ records: { 'time:panda': record } }));
    const save = new SaveStore(storage);
    expect(save.record('panda', 'time')).toEqual(before);
    save.updateRecord('panda', 'time', 40, 120);
    expect(new SaveStore(storage).record('panda', 'time')).toEqual(after);
  });
  it('replaces nonfinite, negative, nonnumeric and absent times with new results', () => {
    const storage = storageWith(
      '{"records":{"time:panda":{"lap":1e400,"race":-5},"assisted:time:panda":{"lap":"40","race":null}}}',
    );
    const save = new SaveStore(storage);
    for (const driving of ['manual', 'assisted'] as const) {
      expect(save.record('panda', 'time', driving)).toEqual({ lap: null, race: null });
      expect(save.updateRecord('panda', 'time', 40, 120, driving)).toEqual({
        lap: true,
        race: true,
      });
      expect(new SaveStore(storage).record('panda', 'time', driving)).toEqual({
        lap: 40,
        race: 120,
      });
    }
  });
  it('preserves v1 manual keys independently from assisted records', () => {
    const storage = storageWith(
      JSON.stringify({
        records: {
          'time:panda': { lap: 38, race: 115 },
          'assisted:time:panda': { lap: 35, race: 125 },
        },
      }),
    );
    const save = new SaveStore(storage);
    save.updateRecord('panda', 'time', 40, 120, 'assisted');
    const restored = new SaveStore(storage);
    expect(restored.record('panda', 'time')).toEqual({ lap: 38, race: 115 });
    expect(restored.record('panda', 'time', 'assisted')).toEqual({ lap: 35, race: 120 });
  });
  it('starts with in-memory records when the localStorage getter is blocked', () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Storage access denied', 'SecurityError');
      },
    });
    try {
      const save = new SaveStore();
      expect(save.data.settings).toEqual(DEFAULT_SETTINGS);
      save.updateRecord('panda', 'race', 50, 151);
      expect(save.record('panda', 'race')).toEqual({ lap: 50, race: 151 });
    } finally {
      if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });
  it('restores settings and retains the faster lap and race only', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        data.set(k, v);
      },
    };
    const save = new SaveStore(storage);
    save.setSettings({ sound: false, characterId: 'fox' });
    save.updateRecord('fox', 'time', 48, 148);
    save.updateRecord('fox', 'time', 50, 155);
    const loaded = new SaveStore(storage);
    expect(loaded.data.settings.sound).toBe(false);
    expect(loaded.data.settings.characterId).toBe('fox');
    expect(loaded.record('fox', 'time')).toEqual({ lap: 48, race: 148 });
    expect(loaded.record('fox', 'race').race).toBe(null);
  });
  it('still works when browser storage is unavailable', () => {
    const save = new SaveStore({
      getItem: () => {
        throw new Error('disabled');
      },
      setItem: () => {
        throw new Error('disabled');
      },
    });
    expect(save.data.settings).toEqual(DEFAULT_SETTINGS);
    expect(() => save.updateRecord('panda', 'race', 50, 151)).not.toThrow();
  });
});
describe('full-race AI integration', () => {
  for (const difficulty of ['easy', 'normal', 'hard'] as Difficulty[])
    it(
      'all seven AI racers can finish on ' + difficulty,
      () => {
        const sim = new RaceSimulation({ ...config, difficulty });
        sim.startImmediately();
        for (
          let i = 0;
          i < 60 * 270 && !sim.racers.slice(1).every((r) => r.finishTime !== null);
          i++
        )
          sim.step(1 / 60, EMPTY_INPUT);
        const results = sim.racers.slice(1).map((r) => ({
          id: r.id,
          laps: r.laps,
          time: r.finishTime,
          checkpoint: r.nextCheckpoint,
          progress: Number(r.progress.toFixed(2)),
        }));
        expect(
          results.every((r) => r.time !== null),
          JSON.stringify(results),
        ).toBe(true);
      },
      20000,
    );
  it('a driver following the same controls completes three laps and ends the race', () => {
    const sim = make();
    sim.startImmediately();
    for (let i = 0; i < 60 * 260 && sim.phase !== 'finished'; i++)
      sim.step(1 / 60, EMPTY_INPUT, true);
    expect(sim.phase).toBe('finished');
    expect(sim.racers[0].lapTimes).toHaveLength(3);
    expect(sim.racers[0].finishTime).toBeLessThan(240);
  }, 20000);
});
