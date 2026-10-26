import { describe, expect, it } from 'vitest';
import { RaceSimulation, advanceDrive, applyWorldImpulse } from '../src/simulation';
import {
  BRIDGE_END,
  BRIDGE_START,
  INTERACTIONS,
  SURFACE_ZONES,
  TRACK,
  WIND_ZONE,
  surfaceAt,
} from '../src/track';
import { EMPTY_INPUT } from '../src/types';
import type { InputState, ItemType, Projectile, Racer } from '../src/types';

function make(driving: 'manual' | 'assisted' = 'manual') {
  const sim = new RaceSimulation({
    characterId: 'panda',
    difficulty: 'normal',
    mode: 'time',
    driving,
  });
  sim.startImmediately();
  sim.aiInput = () => EMPTY_INPUT;
  place(sim.racers[0], 0.08);
  return sim;
}
function place(r: Racer, progress: number, offset = 0, speed = 22) {
  const p = TRACK.at(progress, offset);
  Object.assign(r, {
    x: p.x,
    z: p.z,
    previousX: p.x,
    previousZ: p.z,
    yaw: p.yaw,
    previousYaw: p.yaw,
    velocityYaw: p.yaw,
    progress,
    lastProgress: progress,
    lane: offset,
    speed,
    beforeStart: false,
    completedDistance: progress * TRACK.length,
  });
}
function opponent(sim: RaceSimulation, ahead = 12, offset = 0) {
  const r = { ...structuredClone(sim.racers[0]), id: 1, characterId: 'fox' as const };
  place(r, sim.racers[0].progress + ahead / TRACK.length, offset);
  sim.racers.push(r);
  return r;
}
function run(sim: RaceSimulation, seconds: number, input: InputState = EMPTY_INPUT) {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) sim.step(1 / 60, input);
}
function hazard(sim: RaceSimulation, type: Projectile['type'], racer = sim.racers[0]) {
  const p: Projectile = {
    id: 100,
    type,
    owner: 99,
    x: racer.x,
    z: racer.z,
    yaw: racer.yaw,
    ttl: 3,
    heightOffset: type === 'water' || type === 'homing' ? 0.75 : 0,
    ...(type === 'oil' ? { radius: 3.2 } : {}),
    ...(type === 'pulse' ? { radius: 4, hitRacers: [] } : {}),
  };
  sim.projectiles.push(p);
  return p;
}

function worldVelocity(r: Racer) {
  return [
    Math.sin(r.velocityYaw) * r.speed + Math.cos(r.yaw) * r.lateralSpeed,
    Math.cos(r.velocityYaw) * r.speed - Math.sin(r.yaw) * r.lateralSpeed,
  ] as const;
}

describe('world impulses preserve drift momentum in a single body frame', () => {
  it.each([0, Math.PI / 4, -Math.PI / 3, Math.PI / 2])(
    'adds exactly the requested world velocity at drift angle %s',
    (slip) => {
      const r = make().racers[0];
      r.yaw = 0;
      r.velocityYaw = slip;
      r.speed = 12;
      r.lateralSpeed = 2;
      const before = worldVelocity(r);
      applyWorldImpulse(r, 1, -0.4);
      const after = worldVelocity(r);
      expect(after[0] - before[0]).toBeCloseTo(1, 12);
      expect(after[1] - before[1]).toBeCloseTo(-0.4, 12);
      expect(r.velocityYaw).toBe(r.yaw);
      expect(r.lateralSpeed).toBeCloseTo(before[0] + 1, 12);
    },
  );
  it('conserves world momentum across a collision between different masses and drift angles', () => {
    const sim = make(),
      a = sim.racers[0],
      b = opponent(sim, 3.3);
    a.speed = 30;
    a.velocityYaw = a.yaw + 0.6;
    b.speed = 12;
    b.velocityYaw = b.yaw - 0.2;
    const va = worldVelocity(a),
      vb = worldVelocity(b);
    const momentum = [va[0] * 1.08 + vb[0] * 0.92, va[1] * 1.08 + vb[1] * 0.92];
    const energy = (1.08 * (va[0] ** 2 + va[1] ** 2) + 0.92 * (vb[0] ** 2 + vb[1] ** 2)) / 2;
    (sim as unknown as { resolveCollisions(): void }).resolveCollisions();
    const afterA = worldVelocity(a),
      afterB = worldVelocity(b);
    expect(afterA[0] * 1.08 + afterB[0] * 0.92).toBeCloseTo(momentum[0], 10);
    expect(afterA[1] * 1.08 + afterB[1] * 0.92).toBeCloseTo(momentum[1], 10);
    expect(
      (1.08 * (afterA[0] ** 2 + afterA[1] ** 2) + 0.92 * (afterB[0] ** 2 + afterB[1] ** 2)) / 2,
    ).toBeLessThan(energy);
    expect(sim.drainEvents().some((e) => e.type === 'collision')).toBe(true);
  });
  it('reflects only the rail normal and damps only its tangent during a drifting wall contact', () => {
    const sim = make(),
      r = sim.racers[0];
    place(r, 0.08, 13, 22);
    r.yaw += 0.3;
    r.velocityYaw += 0.9;
    r.lateralSpeed = 2;
    const projection = TRACK.nearest(r.x, r.z, r.progress);
    const nx = Math.cos(projection.point.yaw),
      nz = -Math.sin(projection.point.yaw);
    const before = worldVelocity(r),
      normal = before[0] * nx + before[1] * nz,
      tangent = before[0] * -nz + before[1] * nx;
    expect(normal).toBeGreaterThan(0);
    (sim as unknown as { resolveBarriers(dt: number): void }).resolveBarriers(1 / 60);
    const after = worldVelocity(r);
    expect(after[0] * nx + after[1] * nz).toBeCloseTo(-normal * 0.06, 10);
    expect(after[0] * -nz + after[1] * nx).toBeCloseTo(tangent * Math.exp(-0.85 / 60), 10);
    expect(Math.hypot(...after)).toBeLessThan(Math.hypot(...before));
  });
});

describe('shared finite engine and braking response', () => {
  it('launches the assisted panda progressively to 60–65 km/h after 1.55 seconds', () => {
    const sim = make('assisted'),
      r = sim.racers[0];
    r.speed = 0;
    run(sim, 1.55);
    expect(r.speed * 3.6).toBeGreaterThanOrEqual(60);
    expect(r.speed * 3.6).toBeLessThanOrEqual(65);
    expect(r.acceleration).toBeLessThan(11);
    console.info(
      'WEIGHTED LAUNCH',
      JSON.stringify({ seconds: sim.elapsed, kmh: r.speed * 3.6, acceleration: r.acceleration }),
    );
  });
  it('gives manual, AI and assisted racers identical acceleration for the same full pedal', () => {
    const manual = make(),
      ai = make(),
      assisted = make('assisted');
    for (const sim of [manual, ai, assisted]) sim.racers[0].speed = 0;
    ai.aiInput = () => ({ ...EMPTY_INPUT, throttle: 1 });
    for (let frame = 0; frame < 93; frame++) {
      manual.step(1 / 60, { ...EMPTY_INPUT, throttle: 1 });
      ai.step(1 / 60, EMPTY_INPUT, true);
      assisted.step(1 / 60);
      expect(ai.racers[0].speed).toBeCloseTo(manual.racers[0].speed, 10);
      expect(assisted.racers[0].speed).toBeCloseTo(manual.racers[0].speed, 10);
    }
  });
  it('has less acceleration at higher speed and preserves a clear boost advantage', () => {
    const low = make().racers[0],
      high = structuredClone(low),
      boost = structuredClone(low);
    low.speed = 5;
    high.speed = 23;
    boost.speed = 23;
    boost.boost = 1;
    for (let frame = 0; frame < 20; frame++) {
      advanceDrive(low, 1, 1 / 60, 31);
      advanceDrive(high, 1, 1 / 60, 31);
      advanceDrive(boost, 1, 1 / 60, 44);
    }
    expect(low.speed - 5).toBeGreaterThan(high.speed - 23 + 0.8);
    expect(boost.speed - 23).toBeGreaterThan(high.speed - 23 + 4);
  });
  it('uses finite grip dependent brakes instead of a velocity clamp', () => {
    const dry = make().racers[0],
      wet = structuredClone(dry);
    dry.speed = wet.speed = 27;
    wet.grip = 0.56;
    advanceDrive(dry, -1, 0.1, 31);
    advanceDrive(wet, -1, 0.1, 31);
    expect((27 - dry.speed) / 0.1).toBeGreaterThan(16);
    expect((27 - dry.speed) / 0.1).toBeLessThanOrEqual(20);
    expect(wet.speed).toBeGreaterThan(dry.speed);
  });
  it('bleeds collision and offroad overspeed over time without instant hard caps', () => {
    const r = make().racers[0];
    r.speed = 44;
    advanceDrive(r, 1, 1 / 60, 13);
    expect(r.speed).toBeGreaterThan(43);
    expect(44 - r.speed).toBeLessThanOrEqual(20 / 60 + 0.00001);
    for (let frame = 0; frame < 120; frame++) advanceDrive(r, 1, 1 / 60, 13);
    expect(r.speed).toBeCloseTo(13, 10);
  });
  it('keeps reverse impact velocity and returns it with finite force', () => {
    const r = make().racers[0];
    r.speed = -12;
    advanceDrive(r, -1, 1 / 60, 31);
    expect(r.speed).toBeLessThan(-11);
    expect(r.speed).toBeGreaterThan(-12);
  });
  it.each([0, 1, -1])(
    'airborne pedal %s preserves momentum without tyre acceleration or braking',
    (pedal) => {
      const r = make().racers[0];
      r.speed = 22;
      r.heightOffset = 2;
      advanceDrive(r, pedal, 0.25, 31);
      expect(r.speed).toBeCloseTo(22 * Math.exp(-0.025 * 0.25), 10);
    },
  );
  it('retains boosted air thrust and dissipates airborne overspeed through air drag', () => {
    const boost = make().racers[0],
      overspeed = structuredClone(boost);
    boost.heightOffset = overspeed.heightOffset = 2;
    boost.speed = 22;
    boost.boost = 1;
    overspeed.speed = 44;
    advanceDrive(boost, 1, 0.25, 44);
    advanceDrive(overspeed, 0, 0.25, 13);
    expect(boost.speed).toBeGreaterThan(24);
    expect(overspeed.speed).toBeCloseTo(44 * Math.exp(-0.025 * 0.25), 10);
  });
});

describe('weighted kart contact and road feel', () => {
  it('transfers forward momentum from a faster rear kart to the leading kart', () => {
    const sim = make(),
      a = sim.racers[0],
      b = opponent(sim, 3.3);
    a.speed = 30;
    b.speed = 12;
    sim.step(1 / 60);
    expect(a.speed).toBeLessThan(26);
    expect(b.speed).toBeGreaterThan(18);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(3.8);
    expect(sim.drainEvents().filter((e) => e.type === 'collision')).toHaveLength(1);
  });
  it('transfers side momentum and lets both bodies separate without repeated impacts', () => {
    const sim = make(),
      a = sim.racers[0],
      b = opponent(sim, 0, 2.1);
    a.lateralSpeed = 7;
    sim.step(1 / 60);
    expect(b.lateralSpeed).toBeGreaterThan(2);
    expect(a.lateralSpeed).toBeLessThan(5);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(2.3);
    const collisions = sim.drainEvents().filter((e) => e.type === 'collision').length;
    run(sim, 0.3);
    expect(sim.drainEvents().filter((e) => e.type === 'collision').length).toBeLessThanOrEqual(1);
    expect(collisions).toBe(1);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(2.3);
  });
  it('moves an assisted kart under a side impact before smoothly recovering its line', () => {
    const sim = make('assisted'),
      a = sim.racers[0],
      b = opponent(sim, 0, -2.1);
    b.lateralSpeed = 9;
    sim.step(1 / 60);
    expect(a.lateralSpeed).toBeGreaterThan(1);
    const afterContact = TRACK.nearest(a.x, a.z, a.progress).offset;
    sim.racers.splice(1);
    sim.step(1 / 60);
    expect(a.lateralSpeed).toBeGreaterThan(0.5);
    expect(TRACK.nearest(a.x, a.z, a.progress).offset).toBeGreaterThan(afterContact);
    run(sim, 3);
    expect(Math.abs(a.lane)).toBeLessThan(0.15);
    expect(a.speed).toBeGreaterThan(15);
  });
  it('keeps braking noticeably stronger than coasting while retaining low speed steering', () => {
    const coast = make(),
      brake = make();
    run(coast, 0.5);
    run(brake, 0.5, { ...EMPTY_INPUT, throttle: -1 });
    expect(brake.racers[0].speed).toBeLessThan(coast.racers[0].speed - 8);
    const r = brake.racers[0],
      yaw = r.yaw;
    run(brake, 0.2, { ...EMPTY_INPUT, throttle: 1, steer: 1 });
    expect(r.yaw).toBeGreaterThan(yaw);
  });
  it('keeps surface definitions and bridge geometry aligned', () => {
    const wood = SURFACE_ZONES.find((zone) => zone.kind === 'wood')!;
    expect([wood.start, wood.end]).toEqual([BRIDGE_START, BRIDGE_END]);
    expect(surfaceAt(0.51).kind).toBe('sand');
    expect(surfaceAt(0.78).grip).toBeLessThan(surfaceAt(0.08).grip);
    expect(surfaceAt(0.08, 14).kind).toBe('sand');
  });
  it.each(['manual', 'assisted'] as const)(
    '%s feels lower grip and persistent lateral momentum on sand',
    (driving) => {
      const road = make(driving),
        sand = make(driving);
      place(sand.racers[0], 0.51);
      road.racers[0].lateralSpeed = sand.racers[0].lateralSpeed = 5;
      run(road, 0.2);
      run(sand, 0.2);
      expect(sand.racers[0].surface).toBe('sand');
      expect(sand.racers[0].grip).toBeLessThan(road.racers[0].grip);
      expect(sand.racers[0].lateralSpeed).toBeGreaterThan(road.racers[0].lateralSpeed);
    },
  );
});

describe('visible guardrails share physical contact bounds', () => {
  it.each([0.08, 0.215])(
    'keeps a grounded kart body inside the rail at progress %s',
    (progress) => {
      const sim = make(),
        r = sim.racers[0];
      const rail = progress === 0.215 ? 9.5 : 13.5;
      place(r, progress, rail - 0.7, 22);
      r.lateralSpeed = 8;
      sim.step(1 / 60);
      const projected = TRACK.nearest(r.x, r.z, r.progress);
      expect(projected.distance).toBeLessThanOrEqual(rail - 1.18);
      expect(r.lateralSpeed).toBeLessThan(1);
      expect(r.speed).toBeGreaterThan(12);
      expect(
        sim
          .drainEvents()
          .some((event) => event.type === 'collision' && event.otherId === undefined),
      ).toBe(true);
    },
  );
  it('preserves the ordinary sandy verge and lets an airborne kart clear a low rail', () => {
    const verge = make(),
      air = make();
    place(verge.racers[0], 0.08, 10.5, 16);
    place(air.racers[0], 0.08, 13, 16);
    air.racers[0].heightOffset = 2;
    simStep(verge);
    simStep(air);
    expect(
      TRACK.nearest(verge.racers[0].x, verge.racers[0].z, verge.racers[0].progress).distance,
    ).toBeGreaterThan(10);
    expect(
      TRACK.nearest(air.racers[0].x, air.racers[0].z, air.racers[0].progress).distance,
    ).toBeGreaterThan(12.5);
    function simStep(sim: RaceSimulation) {
      sim.step(1 / 60);
    }
  });
});

describe('seven distinct interactive items', () => {
  it.each(['boost', 'shield', 'water', 'banana', 'homing', 'pulse', 'oil'] as ItemType[])(
    'consumes %s once and publishes its use',
    (item) => {
      const sim = make(),
        r = sim.racers[0];
      opponent(sim);
      r.item = item;
      sim.useItem(r);
      sim.useItem(r);
      expect(r.item).toBeNull();
      expect(
        sim.drainEvents().filter((event) => event.type === 'item-use' && event.itemType === item),
      ).toHaveLength(1);
      if (item !== 'boost' && item !== 'shield') expect(sim.projectiles).toHaveLength(1);
    },
  );
  it('retains a homing item until there is an eligible forward target', () => {
    const sim = make(),
      r = sim.racers[0];
    r.item = 'homing';
    sim.useItem(r);
    expect(r.item).toBe('homing');
    opponent(sim, -10);
    sim.useItem(r);
    expect(r.item).toBe('homing');
    place(sim.racers[1], r.progress + 20 / TRACK.length);
    sim.useItem(r);
    expect(r.item).toBeNull();
    expect(sim.projectiles[0].targetId).toBe(1);
  });
  it('limits homing turn rate and permits a last moment lateral dodge', () => {
    const sim = make(),
      r = sim.racers[0],
      target = opponent(sim, 12);
    r.item = 'homing';
    sim.useItem(r);
    const projectile = sim.projectiles[0],
      yaw = projectile.yaw;
    place(target, target.progress, 7.5, 30);
    sim.step(1 / 60);
    expect(Math.abs(projectile.yaw - yaw)).toBeLessThanOrEqual(1.8 / 60 + 0.00001);
    run(sim, 0.35);
    expect(target.stun).toBe(0);
    expect(target.invulnerable).toBe(0);
  });
  it('lets a water shot pass a different lane without inflicting a hit', () => {
    const sim = make(),
      r = sim.racers[0],
      target = opponent(sim, 12, 5);
    r.item = 'water';
    sim.useItem(r);
    run(sim, 0.8);
    expect(target.stun).toBe(0);
  });
  it.each(['water', 'banana', 'homing', 'pulse', 'oil'] as const)(
    'a shield blocks %s with a distinct block event',
    (type) => {
      const sim = make(),
        r = sim.racers[0];
      place(r, 0.08, 0, 0);
      r.shield = 6;
      hazard(sim, type);
      sim.step(1 / 60);
      expect(r.shield).toBe(0);
      expect(r.stun).toBe(0);
      expect(r.slipTime).toBe(0);
      expect(sim.drainEvents().some((e) => e.type === 'shield-block' && e.itemType === type)).toBe(
        true,
      );
    },
  );
  it('pulse pushes a nearby racer only once even when it reenters the same ring', () => {
    const sim = make(),
      r = sim.racers[0];
    const ring = hazard(sim, 'pulse');
    ring.x -= Math.cos(r.yaw) * 2;
    ring.z += Math.sin(r.yaw) * 2;
    sim.step(1 / 60);
    expect(r.lateralSpeed).toBeGreaterThan(3);
    expect(ring.hitRacers).toEqual([r.id]);
    r.invulnerable = 0;
    run(sim, 0.1);
    expect(sim.drainEvents().filter((e) => e.type === 'hit')).toHaveLength(1);
  });
  it('oil reduces grip without stun while an airborne kart crosses it safely', () => {
    const ground = make(),
      air = make();
    place(ground.racers[0], 0.08, 0, 10);
    place(air.racers[0], 0.08, 0, 10);
    air.racers[0].heightOffset = 2;
    hazard(ground, 'oil');
    hazard(air, 'oil');
    run(ground, 0.1);
    run(air, 0.1);
    expect(ground.racers[0].slipTime).toBeGreaterThan(0);
    expect(ground.racers[0].grip).toBeLessThan(0.4);
    expect(ground.racers[0].stun).toBe(0);
    expect(air.racers[0].slipTime).toBe(0);
    expect(air.racers[0].grip).toBe(1);
  });
  it.each(['banana', 'pulse', 'water', 'homing'] as const)(
    'respects height when a kart jumps over %s',
    (type) => {
      const sim = make(),
        r = sim.racers[0];
      r.heightOffset = 2.5;
      hazard(sim, type);
      run(sim, 0.1);
      expect(r.stun).toBe(0);
      expect(r.invulnerable).toBe(0);
      expect(r.slipTime).toBe(0);
    },
  );
  it('keeps ground items in hand while airborne and permits a protective shield under stun', () => {
    const sim = make(),
      r = sim.racers[0];
    r.heightOffset = 1;
    r.item = 'oil';
    sim.useItem(r);
    expect(r.item).toBe('oil');
    r.stun = 1;
    r.item = 'boost';
    sim.useItem(r);
    expect(r.item).toBe('boost');
    r.item = 'shield';
    sim.useItem(r);
    expect(r.item).toBeNull();
    expect(r.shield).toBe(6);
  });
  it('AI waits for forward, rear and incoming threats before using its specific item', () => {
    const sim = new RaceSimulation({
      characterId: 'panda',
      difficulty: 'normal',
      mode: 'time',
      driving: 'manual',
    });
    const r = sim.racers[0];
    place(r, 0.08);
    r.aiThink = 3;
    r.item = 'homing';
    expect(sim.aiInput(r).item).toBe(false);
    const target = opponent(sim, 16);
    expect(sim.aiInput(r).item).toBe(true);
    r.item = 'oil';
    expect(sim.aiInput(r).item).toBe(false);
    place(target, r.progress - 12 / TRACK.length);
    expect(sim.aiInput(r).item).toBe(true);
    r.item = 'shield';
    expect(sim.aiInput(r).item).toBe(false);
    hazard(sim, 'water');
    expect(sim.aiInput(r).item).toBe(true);
  });
});

describe('finished competitors leave active gameplay', () => {
  it('excludes finished racers from contact and homing acquisition while they keep driving', () => {
    const sim = make(),
      r = sim.racers[0],
      other = opponent(sim, 3.3);
    other.finishTime = 100;
    other.speed = 12;
    r.speed = 30;
    const previous = other.completedDistance;
    sim.step(1 / 60);
    expect(r.speed).toBeGreaterThan(29);
    expect(other.completedDistance).toBeGreaterThan(previous);
    expect(sim.drainEvents().some((e) => e.type === 'collision')).toBe(false);
    r.item = 'homing';
    sim.useItem(r);
    expect(r.item).toBe('homing');
    other.item = 'pulse';
    other.itemCooldown = 0;
    sim.useItem(other);
    expect(other.item).toBe('pulse');
  });
  it('retires remaining hazards when their owner finishes', () => {
    const sim = make(),
      other = opponent(sim, 12),
      r = sim.racers[0];
    const oil = hazard(sim, 'oil');
    oil.owner = other.id;
    other.finishTime = 100;
    sim.step(1 / 60);
    expect(sim.projectiles).toHaveLength(0);
    expect(r.slipTime).toBe(0);
  });
});

describe('physical course actions and lifecycle', () => {
  it.each(['manual', 'assisted'] as const)(
    '%s F launches into a ballistic jump and emits one physical landing',
    (driving) => {
      const sim = make(driving),
        r = sim.racers[0];
      place(r, INTERACTIONS[0].progress);
      sim.step(1 / 60, { ...EMPTY_INPUT, interact: true, throttle: 1 });
      expect(r.verticalSpeed).toBeGreaterThan(8);
      expect(r.heightOffset).toBeGreaterThan(0);
      run(sim, 0.4, { ...EMPTY_INPUT, throttle: 1 });
      expect(r.heightOffset).toBeGreaterThan(1.5);
      run(sim, 0.65, { ...EMPTY_INPUT, throttle: 1 });
      expect(r.heightOffset).toBe(0);
      expect(r.verticalSpeed).toBe(0);
      const events = sim.drainEvents();
      expect(events.filter((e) => e.type === 'launch')).toHaveLength(1);
      expect(events.filter((e) => e.type === 'land')).toHaveLength(1);
      expect(r.landingTime).toBeGreaterThan(0);
    },
  );
  it.each(['manual', 'assisted'] as const)(
    '%s gets wind displacement and F converts it into a stable tailwind ride',
    (driving) => {
      const passive = make(driving),
        active = make(driving);
      place(passive.racers[0], 0.87);
      place(active.racers[0], 0.87);
      active.step(1 / 60, { ...EMPTY_INPUT, interact: true });
      passive.step(1 / 60);
      run(passive, 0.4);
      run(active, 0.4);
      expect(passive.racers[0].progress).toBeGreaterThan(WIND_ZONE.start);
      expect(passive.racers[0].lateralSpeed).toBeGreaterThan(0.2);
      expect(active.racers[0].lateralSpeed).toBeLessThan(passive.racers[0].lateralSpeed * 0.5);
      expect(active.racers[0].speed).toBeGreaterThan(passive.racers[0].speed);
    },
  );
  it('pauses new forces, heights and projectile lifetimes and resets them on recovery and restart', () => {
    const sim = make(),
      r = sim.racers[0];
    r.heightOffset = 1;
    r.verticalSpeed = 4;
    r.lateralSpeed = 5;
    r.slipTime = 1;
    hazard(sim, 'oil');
    sim.pause();
    const paused = JSON.stringify(sim.snapshot());
    run(sim, 1);
    expect(JSON.stringify(sim.snapshot())).toBe(paused);
    sim.resume();
    sim.step(1 / 60);
    expect(r.heightOffset).toBeGreaterThan(1);
    sim.recover(r);
    expect([
      r.heightOffset,
      r.previousHeightOffset,
      r.verticalSpeed,
      r.lateralSpeed,
      r.slipTime,
      r.acceleration,
    ]).toEqual([0, 0, 0, 0, 0, 0]);
    const fresh = make();
    expect(fresh.projectiles).toHaveLength(0);
    expect([
      fresh.racers[0].heightOffset,
      fresh.racers[0].lateralSpeed,
      fresh.racers[0].slipTime,
    ]).toEqual([0, 0, 0]);
  });
});
