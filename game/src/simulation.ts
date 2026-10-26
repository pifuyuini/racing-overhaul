import { CHARACTERS, EMPTY_INPUT } from './types';
import type {
  Difficulty,
  InputState,
  ItemType,
  Racer,
  RaceConfig,
  RaceEvent,
  RaceSnapshot,
  Phase,
  Projectile,
  ItemBox,
  NitroPickup,
  RoutePrompt,
  InteractionPrompt,
} from './types';
import {
  TRACK,
  ROAD_WIDTH,
  CHECKPOINTS,
  BOOST_PADS,
  BRIDGE_START,
  BRIDGE_END,
  angleDelta,
  clamp,
  mod,
  LANE_OFFSETS,
  ROUTE_GATES,
  INTERACTIONS,
  NITRO_PICKUPS,
  forwardDistance,
  surfaceAt,
  barrierOffsetAt,
  WIND_ZONE,
} from './track';
const ITEMS: ItemType[] = ['boost', 'shield', 'water', 'banana', 'homing', 'pulse', 'oil'];
const MASS = { panda: 1.08, capybara: 1.2, fox: 0.92, penguin: 1 };
function velocity(r: Racer) {
  return {
    x: Math.sin(r.velocityYaw) * r.speed + Math.cos(r.yaw) * r.lateralSpeed,
    z: Math.cos(r.velocityYaw) * r.speed - Math.sin(r.yaw) * r.lateralSpeed,
  };
}
export function applyWorldImpulse(r: Racer, x: number, z: number) {
  const before = velocity(r);
  const vx = before.x + x,
    vz = before.z + z;
  // Rebase the complete post-contact velocity onto one orthonormal body frame.
  // Existing drift momentum becomes real lateral velocity instead of being lost.
  r.velocityYaw = r.yaw;
  r.speed = vx * Math.sin(r.yaw) + vz * Math.cos(r.yaw);
  r.lateralSpeed = vx * Math.cos(r.yaw) - vz * Math.sin(r.yaw);
}
export function advanceDrive(r: Racer, throttle: number, dt: number, maximum: number) {
  const spec = CHARACTERS.find((character) => character.id === r.characterId)!;
  const q = clamp(Math.abs(r.speed) / spec.speed, 0, 1);
  const airborne = r.heightOffset > 0.2;
  const traction = airborne ? 0 : 0.55 + 0.45 * clamp(r.grip, 0, 1);
  const pedal = r.stun > 0 ? 0 : clamp(throttle, -1, 1);
  const braking = (16 + 4 * q) * traction;
  const engine = spec.acceleration * (0.72 - 0.3 * q) * traction;
  const boost = r.boost > 0 && r.stun === 0 && pedal >= 0 ? 16 * (airborne ? 0.65 : traction) : 0;
  if (r.speed > maximum) {
    // Overspeed from terrain changes and impacts dissipates through finite traction.
    r.speed = Math.max(maximum, r.speed - braking * dt);
  } else if (pedal < 0 && r.speed > 0) {
    r.speed = Math.max(0, r.speed - braking * -pedal * dt);
  } else if (pedal < 0) {
    if (r.speed < -7) r.speed = Math.min(-7, r.speed + braking * dt);
    else r.speed = Math.max(-7, r.speed - engine * 0.6 * -pedal * dt);
  } else if (pedal > 0 || boost > 0) {
    r.speed = Math.min(maximum, r.speed + (engine * pedal + boost) * dt);
  } else {
    // Rolling resistance preserves momentum; a hit has already removed speed once.
    if (!airborne) r.speed *= Math.exp(-0.08 * dt);
  }
  if (airborne) r.speed *= Math.exp(-0.025 * dt);
  if (Math.abs(r.speed) < 0.07) r.speed = 0;
}
export function chargeBoost(charge: number) {
  return charge >= 1.8 ? 2.1 : charge >= 0.7 ? 1.1 : 0;
}
export function applyHit(racer: Racer): 'shield' | 'hit' | 'ignored' {
  if (racer.invulnerable > 0) return 'ignored';
  if (racer.shield > 0) {
    racer.shield = 0;
    racer.invulnerable = 0.8;
    return 'shield';
  }
  racer.speed *= 0.4;
  racer.stun = 1.15;
  racer.invulnerable = 1.7;
  racer.driftCharge = 0;
  racer.drifting = false;
  return 'hit';
}
export function advanceCheckpoints(
  racer: Racer,
  progress: number,
  distance: number,
  elapsed: number,
): boolean {
  const previous = racer.lastProgress,
    delta = mod(progress - previous + 0.5) - 0.5;
  if (Math.abs(delta) <= 0.04) racer.completedDistance += delta * TRACK.length;
  racer.progress = progress;
  racer.lastProgress = progress;
  if (delta <= 0 || delta > 0.04 || distance > ROAD_WIDTH / 2 + 2) return false;
  if (previous > 0.9 && progress < 0.1) racer.beforeStart = false;
  const previousSector = Math.floor(previous * CHECKPOINTS),
    sector = Math.floor(progress * CHECKPOINTS);
  if (sector === previousSector) return false;
  if (sector === racer.nextCheckpoint % CHECKPOINTS) {
    racer.nextCheckpoint++;
    if (sector === 0) {
      racer.laps++;
      racer.lapTimes.push(elapsed - racer.lapStartedAt);
      racer.lapStartedAt = elapsed;
      racer.nextCheckpoint = 1;
      return true;
    }
  }
  return false;
}
export function rankRacers(racers: readonly Racer[]): Racer[] {
  return [...racers].sort((a, b) => {
    if (a.finishTime !== null && b.finishTime !== null) return a.finishTime - b.finishTime;
    if (a.finishTime !== null) return -1;
    if (b.finishTime !== null) return 1;
    const validProgress = (r: Racer) =>
      Math.min(r.completedDistance / TRACK.length, r.laps + r.nextCheckpoint / CHECKPOINTS);
    return validProgress(b) - validProgress(a);
  });
}
export class RaceSimulation {
  readonly racers: Racer[] = [];
  readonly projectiles: Projectile[] = [];
  readonly boxes: ItemBox[] = [];
  phase: Phase = 'countdown';
  elapsed = 0;
  countdown = 3.5;
  events: RaceEvent[] = [];
  private oldPhase: Phase = 'racing';
  private seed: number;
  private nextProjectile = 0;
  private countdownBeat = 4;
  private contacts = new Set<string>();
  private barrierContacts = new Set<number>();
  readonly pickups: NitroPickup[] = NITRO_PICKUPS.map((p) => ({ ...p, collectedLap: -1 }));
  private claimedRoutes = new Set<string>();
  private claimedActions = new Set<string>();
  get assisted() {
    return this.config.driving !== 'manual';
  }
  constructor(
    readonly config: RaceConfig,
    seed = 20260922,
  ) {
    this.seed = seed;
    const count = config.mode === 'time' ? 1 : 8;
    for (let i = 0; i < count; i++) {
      const character =
        i === 0
          ? config.characterId
          : CHARACTERS[(i + CHARACTERS.findIndex((c) => c.id === config.characterId)) % 4].id;
      const progress = -(7 + Math.floor(i / 2) * 5.8) / TRACK.length,
        lane = i % 2 === 0 ? -2.4 : 2.4,
        p = TRACK.at(progress, lane);
      this.racers.push({
        id: i,
        characterId: character,
        name: i === 0 ? '你' : ['椰椰', '阿浪', '糯米', '啵啵', '小麦', '咕噜', '桃桃'][i - 1],
        x: p.x,
        z: p.z,
        yaw: p.yaw,
        previousX: p.x,
        previousZ: p.z,
        previousYaw: p.yaw,
        speed: 0,
        velocityYaw: p.yaw,
        lateralSpeed: 0,
        heightOffset: 0,
        previousHeightOffset: 0,
        verticalSpeed: 0,
        surface: 'road',
        grip: 1,
        slipTime: 0,
        impactTime: 0,
        impactStrength: 0,
        landingTime: 0,
        acceleration: 0,
        steer: 0,
        progress: mod(progress),
        lastProgress: mod(progress),
        beforeStart: true,
        laps: 0,
        nextCheckpoint: 1,
        lapStartedAt: 0,
        lapTimes: [],
        finishTime: null,
        driftCharge: 0,
        drifting: false,
        driftDirection: 0,
        boost: 0,
        shield: 0,
        stun: 0,
        invulnerable: 0,
        item: null,
        itemCooldown: 0,
        lane,
        aiThink: i * 0.37,
        offroad: false,
        recovery: 0,
        completedDistance: progress * TRACK.length,
        targetLane: 0,
        nitro: 60,
        nitroTime: 0,
        actionKind: null,
        actionTime: 0,
        actionDuration: 0,
        perfectActions: 0,
        successfulActions: 0,
        nitroUses: 0,
      });
    }
    if (config.mode === 'time') {
      const p = TRACK.at(0);
      Object.assign(this.racers[0], {
        x: p.x,
        z: p.z,
        yaw: p.yaw,
        previousX: p.x,
        previousZ: p.z,
        progress: 0,
        lastProgress: 0,
        beforeStart: false,
        completedDistance: 0,
      });
    } else {
      for (const progress of [0.035, 0.16, 0.29, 0.43, 0.56, 0.68, 0.82, 0.94])
        for (const offset of [-4, 0, 4]) this.boxes.push({ progress, offset, cooldown: 0 });
    }
  }
  random() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  pause() {
    if (this.phase === 'racing' || this.phase === 'countdown') {
      this.oldPhase = this.phase;
      this.phase = 'paused';
    }
  }
  resume() {
    if (this.phase === 'paused') this.phase = this.oldPhase;
  }
  startImmediately() {
    this.countdown = 0;
    this.phase = 'racing';
  }
  snapshot(): RaceSnapshot {
    return {
      phase: this.phase,
      elapsed: this.elapsed,
      countdown: this.countdown,
      racers: this.racers,
      projectiles: this.projectiles,
      boxes: this.boxes,
      standings: rankRacers(this.racers),
      config: this.config,
      route: this.routePrompt(),
      interaction: this.interactionPrompt(),
      pickups: this.assisted ? this.pickups : [],
    };
  }
  routePrompt(): RoutePrompt | null {
    if (!this.assisted) return null;
    const r = this.racers[0];
    const gate = ROUTE_GATES.find(
      (g) =>
        !this.claimedRoutes.has(r.laps + ':' + g.id) &&
        forwardDistance(r.progress, g.progress) > -3 &&
        forwardDistance(r.progress, g.progress) < 95,
    );
    return gate
      ? {
          id: gate.id,
          distance: forwardDistance(r.progress, gate.progress),
          left: '氮气 +35',
          right: this.config.mode === 'time' ? '加速带' : r.item ? '氮气 +20' : '道具补给',
        }
      : null;
  }
  interactionPrompt(): InteractionPrompt | null {
    const r = this.racers[0];
    const point = INTERACTIONS.find(
      (g) =>
        !this.claimedActions.has(r.laps + ':' + g.id) &&
        forwardDistance(r.progress, g.progress) > -22 &&
        forwardDistance(r.progress, g.progress) < 90,
    );
    if (!point) return null;
    const distance = forwardDistance(r.progress, point.progress);
    return {
      id: point.id,
      kind: point.kind,
      title: point.title,
      distance,
      available: Math.abs(distance) <= 22,
      perfect: Math.abs(distance) <= 8,
    };
  }
  drainEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }
  recover(racer: Racer) {
    const progress = (racer.nextCheckpoint - 1) / CHECKPOINTS + 0.003,
      p = TRACK.at(progress, racer.id === 0 ? 0 : racer.lane);
    Object.assign(racer, {
      x: p.x,
      z: p.z,
      yaw: p.yaw,
      velocityYaw: p.yaw,
      previousX: p.x,
      previousZ: p.z,
      previousYaw: p.yaw,
      progress,
      lastProgress: progress,
      beforeStart: false,
      speed: 0,
      lateralSpeed: 0,
      heightOffset: 0,
      previousHeightOffset: 0,
      verticalSpeed: 0,
      slipTime: 0,
      impactTime: 0,
      impactStrength: 0,
      landingTime: 0,
      acceleration: 0,
      actionTime: 0,
      actionKind: null,
      stun: 0,
      recovery: 1.2,
      invulnerable: 2,
      driftCharge: 0,
      drifting: false,
      completedDistance: (racer.laps + progress) * TRACK.length,
    });
    this.events.push({ type: 'recover', racerId: racer.id });
  }
  aiInput(racer: Racer, difficulty: Difficulty = this.config.difficulty): InputState {
    const projection = TRACK.nearest(racer.x, racer.z, racer.progress);
    let lane = racer.lane + Math.sin(this.elapsed * 0.6 + racer.id) * 0.5;
    for (const other of this.racers) {
      if (other === racer) continue;
      const ahead =
        (other.x - racer.x) * Math.sin(racer.yaw) + (other.z - racer.z) * Math.cos(racer.yaw);
      if (ahead > 1 && ahead < 10 && Math.hypot(other.x - racer.x, other.z - racer.z) < 10)
        lane = clamp(lane + (racer.id % 2 === 0 ? 1.8 : -1.8), -5.5, 5.5);
    }
    const lookahead = 7 + Math.abs(racer.speed) * 0.65,
      target = TRACK.at(projection.point.progress + lookahead / TRACK.length, lane);
    const desired = Math.atan2(target.x - racer.x, target.z - racer.z),
      error = angleDelta(desired, racer.yaw);
    const future = TRACK.at(projection.point.progress + (lookahead + 14) / TRACK.length);
    const curvature = Math.abs(angleDelta(future.yaw, projection.point.yaw));
    const base = { easy: 24.5, normal: 28, hard: 32 }[difficulty] + ((racer.id % 3) - 1) * 0.65;
    const corneringPenalty = { easy: 15, normal: 8, hard: 2.3 }[difficulty];
    const targetSpeed = clamp(base - curvature * corneringPenalty, 12, base);
    const throttle = racer.speed < targetSpeed ? 1 : racer.speed > targetSpeed + 2 ? -0.45 : 0;
    const nearby = this.racers.filter((other) => other !== racer && other.finishTime === null);
    const front = nearby.some((other) => {
      const distance = Math.hypot(other.x - racer.x, other.z - racer.z);
      const bearing = angleDelta(Math.atan2(other.x - racer.x, other.z - racer.z), racer.yaw);
      return distance < (racer.item === 'homing' ? 65 : 30) && Math.abs(bearing) < 0.7;
    });
    const rear = nearby.some((other) => {
      const dx = other.x - racer.x,
        dz = other.z - racer.z;
      return Math.hypot(dx, dz) < 22 && dx * Math.sin(racer.yaw) + dz * Math.cos(racer.yaw) < -2;
    });
    const threatened = this.projectiles.some(
      (projectile) =>
        projectile.owner !== racer.id &&
        Math.hypot(projectile.x - racer.x, projectile.z - racer.z) < 20,
    );
    const item =
      racer.finishTime === null &&
      !!racer.item &&
      racer.aiThink > 2 &&
      ((racer.item === 'boost' && curvature < 0.45) ||
        (racer.item === 'shield' && threatened) ||
        ((racer.item === 'water' || racer.item === 'homing') && front) ||
        ((racer.item === 'banana' || racer.item === 'oil') && rear) ||
        (racer.item === 'pulse' &&
          nearby.some((other) => Math.hypot(other.x - racer.x, other.z - racer.z) < 7)));
    return { throttle, steer: clamp(error * 2.4, -1, 1), drift: false, item, recover: false };
  }
  private targetAhead(racer: Racer) {
    return this.racers
      .filter((other) => {
        const dx = other.x - racer.x,
          dz = other.z - racer.z;
        return (
          other !== racer &&
          other.finishTime === null &&
          Math.hypot(dx, dz) < 70 &&
          Math.abs(angleDelta(Math.atan2(dx, dz), racer.yaw)) < 0.9
        );
      })
      .sort(
        (a, b) =>
          Math.hypot(a.x - racer.x, a.z - racer.z) - Math.hypot(b.x - racer.x, b.z - racer.z),
      )[0];
  }
  useItem(racer: Racer) {
    if (
      racer.finishTime !== null ||
      !racer.item ||
      racer.itemCooldown > 0 ||
      (racer.stun > 0 && racer.item !== 'shield')
    )
      return;
    const type = racer.item;
    if (type === 'homing' && !this.targetAhead(racer)) return;
    if (racer.heightOffset > 0.65 && (type === 'oil' || type === 'banana' || type === 'pulse'))
      return;
    racer.item = null;
    racer.itemCooldown = 0.6;
    racer.aiThink = 0;
    this.events.push({
      type: 'item-use',
      racerId: racer.id,
      value: type,
      itemType: type,
      x: racer.x,
      z: racer.z,
    });
    if (type === 'boost') {
      racer.boost = Math.max(racer.boost, 2.6);
      this.events.push({ type: 'boost', racerId: racer.id });
    } else if (type === 'shield') {
      racer.shield = 6;
      this.events.push({ type: 'shield', racerId: racer.id });
    } else {
      const forward = type === 'water' || type === 'homing';
      const direction = forward ? 1 : type === 'pulse' ? 0 : -1;
      this.projectiles.push({
        id: this.nextProjectile++,
        type,
        owner: racer.id,
        x: racer.x + Math.sin(racer.yaw) * 3.2 * direction,
        z: racer.z + Math.cos(racer.yaw) * 3.2 * direction,
        yaw: racer.yaw,
        ttl:
          type === 'water'
            ? 3.5
            : type === 'homing'
              ? 4.5
              : type === 'pulse'
                ? 0.52
                : type === 'oil'
                  ? 12
                  : 18,
        heightOffset: forward ? racer.heightOffset + 0.75 : 0,
        ...(type === 'homing' ? { targetId: this.targetAhead(racer)?.id } : {}),
        ...(type === 'pulse' ? { radius: 0.5, hitRacers: [] } : {}),
        ...(type === 'oil' ? { radius: 3.2 } : {}),
      });
    }
  }
  private updateDynamics(r: Racer, dt: number) {
    r.previousHeightOffset = r.heightOffset;
    for (const key of ['slipTime', 'impactTime', 'landingTime', 'actionTime', 'nitroTime'] as const)
      r[key] = Math.max(0, r[key] - dt);
    if (r.actionTime === 0) r.actionKind = null;
    const projection = TRACK.nearest(r.x, r.z, r.progress);
    const surface = surfaceAt(r.progress, projection.offset);
    r.surface = surface.kind;
    r.grip = surface.grip * (r.slipTime > 0 ? 0.26 : 1) * (r.actionKind === 'drift' ? 0.72 : 1);
    if (r.heightOffset > 0 || r.verticalSpeed > 0) {
      r.verticalSpeed -= 19 * dt;
      r.heightOffset += r.verticalSpeed * dt;
      if (r.heightOffset <= 0) {
        const strength = clamp(-r.verticalSpeed / 10, 0, 1);
        r.heightOffset = 0;
        r.verticalSpeed = 0;
        r.landingTime = 0.35;
        r.speed *= 1 - strength * (r.actionKind === 'jump' ? 0.025 : 0.055);
        this.events.push({ type: 'land', racerId: r.id, strength, x: r.x, z: r.z });
      }
    }
    const airborne = r.heightOffset > 0.2;
    r.lateralSpeed *= Math.exp(-(airborne ? 0.65 : 4.5 * r.grip) * dt);
    if (!airborne && r.speed > 0) r.speed = Math.max(0, r.speed - surface.drag * dt);
    if (r.progress >= WIND_ZONE.start && r.progress <= WIND_ZONE.end && r.speed > 3) {
      const wind = WIND_ZONE.strength * (r.actionKind === 'spin' ? 0.18 : 1);
      r.lateralSpeed +=
        wind *
        Math.sin(((r.progress - WIND_ZONE.start) * Math.PI) / (WIND_ZONE.end - WIND_ZONE.start)) *
        dt;
      if (r.actionKind === 'spin') r.speed += 3 * dt;
    }
  }
  private activateInteraction(r: Racer, input: InputState) {
    if (r.id !== 0 || !input.interact || r.stun > 0) return;
    const prompt = this.interactionPrompt();
    if (!prompt?.available) return;
    this.claimedActions.add(r.laps + ':' + prompt.id);
    r.actionKind = prompt.kind;
    r.actionDuration = prompt.kind === 'drift' ? 1.55 : 1.25;
    r.actionTime = r.actionDuration;
    r.successfulActions++;
    if (prompt.perfect) r.perfectActions++;
    r.nitro = Math.min(100, r.nitro + (prompt.perfect ? 25 : 14));
    r.boost = Math.max(r.boost, prompt.perfect ? 2.2 : 1.1);
    if (prompt.kind === 'jump') {
      r.verticalSpeed = prompt.perfect ? 8.8 : 7.2;
      r.heightOffset = Math.max(0.06, r.heightOffset);
      this.events.push({
        type: 'launch',
        racerId: r.id,
        strength: prompt.perfect ? 1 : 0.7,
        x: r.x,
        z: r.z,
      });
    } else if (prompt.kind === 'drift') {
      r.lateralSpeed += (r.targetLane === 1 ? -1 : 1) * (prompt.perfect ? 2.8 : 1.8);
      r.grip *= 0.72;
    }
    this.events.push({
      type: 'interaction',
      racerId: r.id,
      value: (prompt.perfect ? '完美' : '漂亮') + ' · ' + prompt.title,
    });
  }

  step(dt: number, input: InputState = EMPTY_INPUT, autoPlayer = false) {
    if (this.phase === 'paused' || this.phase === 'finished') return;
    if (this.phase === 'countdown') {
      this.countdown = Math.max(0, this.countdown - dt);
      const beat = Math.ceil(this.countdown);
      if (beat !== this.countdownBeat) {
        this.countdownBeat = beat;
        this.events.push({ type: beat === 0 ? 'go' : 'countdown', racerId: 0, value: beat });
      }
      if (this.countdown === 0) this.phase = 'racing';
      return;
    }
    this.elapsed += dt;
    for (const box of this.boxes) box.cooldown = Math.max(0, box.cooldown - dt);
    for (const racer of this.racers) {
      racer.previousX = racer.x;
      racer.previousZ = racer.z;
      racer.previousYaw = racer.yaw;
      const previousSpeed = racer.speed;
      this.updateDynamics(racer, dt);
      if (racer.id === 0 && !autoPlayer && this.assisted)
        this.updateAssistedRacer(racer, input, dt);
      else {
        const controls = racer.id === 0 && !autoPlayer ? input : this.aiInput(racer);
        this.updateRacer(racer, controls, dt);
      }
      racer.acceleration = (racer.speed - previousSpeed) / dt;
    }
    this.resolveCollisions();
    this.resolveBarriers(dt);
    this.updateProjectiles(dt);
    if (this.racers[0].finishTime !== null) {
      this.phase = 'finished';
      this.events.push({ type: 'finish', racerId: 0 });
    }
  }
  private updateAssistedRacer(r: Racer, input: InputState, dt: number) {
    const spec = CHARACTERS.find((c) => c.id === r.characterId)!;
    for (const key of [
      'boost',
      'shield',
      'stun',
      'invulnerable',
      'itemCooldown',
      'recovery',
    ] as const)
      r[key] = Math.max(0, r[key] - dt);
    r.aiThink += dt;
    r.nitro = Math.min(100, r.nitro + 6 * dt);
    if (input.lane !== undefined && input.lane !== null) r.targetLane = input.lane;
    if (input.item) this.useItem(r);
    if (input.nitro && r.nitro >= 30 && r.nitroTime <= 0.15 && r.stun === 0) {
      r.nitro -= 30;
      r.nitroTime = 1.8;
      r.boost = Math.max(r.boost, 1.8);
      r.nitroUses++;
      this.events.push({ type: 'nitro', racerId: 0 });
    }
    this.activateInteraction(r, input);
    if (input.recover && r.recovery === 0) {
      this.recover(r);
      r.lane = 0;
      return;
    }
    const previousProgress = r.progress;
    const projection = TRACK.nearest(r.x, r.z, r.progress);
    // A guided racing line owns steering. Collisions still slow the kart and displace its lane.
    const targetOffset = LANE_OFFSETS[r.targetLane + 1];
    r.lane = clamp(projection.offset, -6.4, 6.4);
    const guidance = (r.impactTime > 0 ? 1.35 : 3.8) * Math.max(0.4, r.grip);
    r.lane += (targetOffset - r.lane) * (1 - Math.exp(-dt * guidance * spec.handling));
    r.lane = clamp(r.lane + r.lateralSpeed * dt, -7.2, 7.2);
    const current = TRACK.at(r.progress);
    const curve = Math.abs(angleDelta(TRACK.at(r.progress + 25 / TRACK.length).yaw, current.yaw));
    const cruising = clamp(spec.speed * 0.9 - curve * 11, 16, spec.speed * 0.9);
    const targetSpeed = cruising + (r.boost > 0 ? 12 : 0);
    advanceDrive(r, clamp((targetSpeed - r.speed) / 2, -1, 1), dt, targetSpeed);
    const p = TRACK.at(r.progress + (r.speed * dt) / TRACK.length, r.lane);
    r.steer = clamp(angleDelta(p.yaw, r.yaw) * 8, -1, 1);
    r.yaw += angleDelta(p.yaw, r.yaw) * Math.min(1, dt * 12);
    r.velocityYaw = r.yaw;
    r.x = p.x;
    r.z = p.z;
    r.offroad = false;
    r.drifting = r.actionKind === 'drift';
    r.driftCharge = r.drifting ? 2 : 0;
    const lap = advanceCheckpoints(r, p.progress, Math.abs(r.lane), this.elapsed);
    if (lap) {
      this.events.push({ type: 'lap', racerId: 0, value: r.laps });
      if (r.laps === 3) r.finishTime = this.elapsed;
    }
    this.collectTrackSupplies(r, Math.abs(r.lane));
    if (r.finishTime !== null) return;
    for (const gate of ROUTE_GATES) {
      const key = r.laps + ':' + gate.id;
      if (
        !this.claimedRoutes.has(key) &&
        forwardDistance(previousProgress, gate.progress) >= 0 &&
        forwardDistance(r.progress, gate.progress) <= 0
      ) {
        this.claimedRoutes.add(key);
        const leftwardOffset = r.lane * Math.sign(LANE_OFFSETS[0]);
        if (leftwardOffset > 2) {
          r.nitro = Math.min(100, r.nitro + 35);
          this.events.push({ type: 'route', racerId: 0, value: '左线补给 · 氮气 +35' });
        } else if (leftwardOffset < -2) {
          if (this.config.mode === 'time') {
            r.boost = Math.max(r.boost, 1.5);
            this.events.push({ type: 'route', racerId: 0, value: '右线加速 · 全力冲刺' });
          } else if (r.item) {
            r.nitro = Math.min(100, r.nitro + 20);
            this.events.push({ type: 'route', racerId: 0, value: '补给已满 · 氮气 +20' });
          } else {
            const items = ITEMS;
            r.item = items[Math.floor(this.random() * items.length)];
            this.events.push({ type: 'pickup', racerId: 0, value: r.item });
          }
        } else {
          r.nitro = Math.min(100, r.nitro + 10);
          this.events.push({ type: 'route', racerId: 0, value: '稳稳通过 · 氮气 +10' });
        }
      }
    }
    for (const pickup of this.pickups) {
      if (pickup.collectedLap === r.laps) continue;
      if (
        Math.abs(forwardDistance(r.progress, pickup.progress)) < 2.4 &&
        Math.abs(r.lane - LANE_OFFSETS[pickup.lane + 1]) < 2
      ) {
        pickup.collectedLap = r.laps;
        r.nitro = Math.min(100, r.nitro + 20);
        this.events.push({ type: 'charge', racerId: 0, value: 20 });
      }
    }
  }
  private updateRacer(racer: Racer, input: InputState, dt: number) {
    const spec = CHARACTERS.find((c) => c.id === racer.characterId)!;
    for (const key of [
      'boost',
      'shield',
      'stun',
      'invulnerable',
      'itemCooldown',
      'recovery',
    ] as const)
      racer[key] = Math.max(0, racer[key] - dt);
    racer.aiThink += dt;
    this.activateInteraction(racer, input);
    if (input.recover && racer.recovery === 0) {
      this.recover(racer);
      return;
    }
    if (input.item) this.useItem(racer);
    const projection = TRACK.nearest(racer.x, racer.z, racer.progress);
    if (projection.distance > 28) {
      this.recover(racer);
      return;
    }
    racer.offroad = projection.distance > ROAD_WIDTH / 2 + 0.8;
    const stunned = racer.stun > 0;
    const steer = stunned ? 0 : input.steer;
    racer.steer += (steer - racer.steer) * Math.min(1, dt * 12);
    const drifting =
      input.drift &&
      Math.abs(racer.speed) > 11 &&
      Math.abs(steer) > 0.12 &&
      !stunned &&
      !racer.offroad;
    if (drifting) {
      if (!racer.drifting) racer.driftDirection = Math.sign(steer);
      racer.driftCharge = Math.min(2.6, racer.driftCharge + dt);
    } else if (racer.drifting) {
      const boost = chargeBoost(racer.driftCharge);
      if (boost && !stunned && !racer.offroad) {
        racer.boost = Math.max(racer.boost, boost);
        this.events.push({
          type: 'drift',
          racerId: racer.id,
          value: racer.driftCharge >= 1.8 ? 2 : 1,
        });
      }
      racer.driftCharge = 0;
    }
    racer.drifting = drifting;
    const maximum = (racer.offroad ? 13 : spec.speed) + (racer.boost > 0 ? 13 : 0);
    advanceDrive(racer, input.throttle, dt, maximum);
    racer.yaw +=
      racer.steer *
      2.12 *
      spec.handling *
      (racer.speed / (12 + Math.abs(racer.speed))) *
      (drifting ? 1.19 : 1) *
      (1 - Math.max(0, Math.abs(racer.speed) - 22) * 0.006) *
      Math.max(0.62, racer.grip) *
      (racer.heightOffset > 0.2 ? 0.45 : 1) *
      dt;
    // Slow velocity response creates drift slip without an opposite turn on entry.
    const targetVelocityYaw = racer.yaw;
    racer.velocityYaw +=
      angleDelta(targetVelocityYaw, racer.velocityYaw) *
      (1 - Math.exp(-dt * (drifting ? 3.3 : 12) * racer.grip));
    const movement = velocity(racer);
    racer.x += movement.x * dt;
    racer.z += movement.z * dt;
    const next = TRACK.nearest(racer.x, racer.z, racer.progress);
    const lap = advanceCheckpoints(racer, next.point.progress, next.distance, this.elapsed);
    if (lap) {
      this.events.push({ type: 'lap', racerId: racer.id, value: racer.laps });
      if (racer.laps === 3 && racer.finishTime === null) racer.finishTime = this.elapsed;
    }
    this.collectTrackSupplies(racer, next.distance);
  }
  private collectTrackSupplies(racer: Racer, distance: number) {
    for (const pad of BOOST_PADS) {
      if (Math.abs(mod(racer.progress - pad + 0.5) - 0.5) * TRACK.length < 3 && distance < 5.2)
        racer.boost = Math.max(racer.boost, 0.85);
    }
    if (!racer.item && racer.itemCooldown === 0 && racer.finishTime === null)
      for (const box of this.boxes) {
        if (box.cooldown > 0) continue;
        if (Math.abs(mod(racer.progress - box.progress + 0.5) - 0.5) * TRACK.length > 4) continue;
        const p = TRACK.at(box.progress, box.offset);
        if (Math.hypot(racer.x - p.x, racer.z - p.z) < 2.7) {
          const items = ITEMS;
          racer.item = items[Math.floor(this.random() * items.length)];
          racer.itemCooldown = 0.6;
          box.cooldown = 5;
          this.events.push({ type: 'pickup', racerId: racer.id, value: racer.item });
          break;
        }
      }
  }
  private resolveBarriers(dt: number) {
    const contacts = new Set<number>();
    for (const racer of this.racers) {
      const next = TRACK.nearest(racer.x, racer.z, racer.progress);
      const onBridge = next.point.progress >= BRIDGE_START && next.point.progress <= BRIDGE_END;
      if (racer.heightOffset > (onBridge ? 1.6 : 1.05) || next.distance >= 27) continue;
      const halfWidth = 1.2 + 0.82 * Math.abs(Math.sin(angleDelta(racer.yaw, next.point.yaw)));
      const boundary = barrierOffsetAt(next.point.progress) - halfWidth;
      if (next.distance < boundary - 0.02) continue;
      contacts.add(racer.id);
      if (next.distance <= boundary) continue;
      const sign = Math.sign(next.offset),
        nx = Math.cos(next.point.yaw) * sign,
        nz = -Math.sin(next.point.yaw) * sign;
      racer.x = next.point.x + nx * boundary;
      racer.z = next.point.z + nz * boundary;
      const v = velocity(racer),
        outward = v.x * nx + v.z * nz;
      const normalAfter = outward > 0 ? -outward * 0.06 : outward;
      const friction = Math.exp(-0.85 * dt);
      const tangentX = v.x - nx * outward,
        tangentZ = v.z - nz * outward;
      applyWorldImpulse(
        racer,
        nx * normalAfter + tangentX * friction - v.x,
        nz * normalAfter + tangentZ * friction - v.z,
      );

      if (racer.id === 0 && this.assisted) racer.lane = boundary * sign;
      if (outward > 1.5) {
        const strength = clamp(outward / 16, 0.08, 1);
        racer.impactTime = Math.max(racer.impactTime, 0.28);
        racer.impactStrength = strength;
        if (!this.barrierContacts.has(racer.id))
          this.events.push({
            type: 'collision',
            racerId: racer.id,
            strength,
            x: racer.x,
            z: racer.z,
          });
      }
    }
    this.barrierContacts = contacts;
  }
  private resolveCollisions() {
    const contacts = new Set<string>();
    // Keep the two-circle body, transfer relative momentum along each contact normal.
    for (let i = 0; i < this.racers.length; i++)
      for (let j = i + 1; j < this.racers.length; j++) {
        const a = this.racers[i],
          b = this.racers[j];
        if (
          a.finishTime !== null ||
          b.finishTime !== null ||
          Math.abs(a.heightOffset - b.heightOffset) > 1.4 ||
          Math.hypot(a.x - b.x, a.z - b.z) > 4.1 ||
          a.recovery > 0 ||
          b.recovery > 0
        )
          continue;
        let deepest = 0,
          nx = 0,
          nz = 0;
        for (const frontA of [-0.82, 0.82])
          for (const frontB of [-0.82, 0.82]) {
            const dx = a.x + Math.sin(a.yaw) * frontA - b.x - Math.sin(b.yaw) * frontB;
            const dz = a.z + Math.cos(a.yaw) * frontA - b.z - Math.cos(b.yaw) * frontB;
            const distance = Math.hypot(dx, dz),
              penetration = 2.34 - distance;
            if (penetration > deepest) {
              deepest = penetration;
              nx = distance > 0.001 ? dx / distance : Math.cos(a.yaw);
              nz = distance > 0.001 ? dz / distance : -Math.sin(a.yaw);
            }
          }
        if (deepest <= 0) continue;
        const key = a.id + ':' + b.id;
        contacts.add(key);
        const invA = 1 / MASS[a.characterId],
          invB = 1 / MASS[b.characterId],
          sum = invA + invB;
        a.x += (nx * (deepest + 0.005) * invA) / sum;
        a.z += (nz * (deepest + 0.005) * invA) / sum;
        b.x -= (nx * (deepest + 0.005) * invB) / sum;
        b.z -= (nz * (deepest + 0.005) * invB) / sum;
        const va = velocity(a),
          vb = velocity(b);
        const closing = (va.x - vb.x) * nx + (va.z - vb.z) * nz;
        if (closing >= -0.05) continue;
        const normalImpulse = (-closing * 1.08) / sum;
        const tangent = clamp(
          ((va.x - vb.x) * -nz + (va.z - vb.z) * nx) / sum,
          -normalImpulse * 0.12,
          normalImpulse * 0.12,
        );
        const ix = nx * normalImpulse + nz * tangent,
          iz = nz * normalImpulse - nx * tangent;
        applyWorldImpulse(a, ix * invA, iz * invA);
        applyWorldImpulse(b, -ix * invB, -iz * invB);
        const strength = clamp(-closing / 18, 0.05, 1);
        for (const racer of [a, b]) {
          racer.impactTime = Math.max(racer.impactTime, 0.34);
          racer.impactStrength = strength;
        }
        if (!this.contacts.has(key) && -closing > 1.2)
          this.events.push({
            type: 'collision',
            racerId: a.id,
            otherId: b.id,
            strength,
            x: (a.x + b.x) / 2,
            z: (a.z + b.z) / 2,
          });
      }
    this.contacts = contacts;
  }
  private projectileHit(projectile: Projectile, racer: Racer) {
    if (racer.invulnerable > 0) return false;
    const type = projectile.type;
    if (racer.shield > 0) {
      applyHit(racer);
      this.events.push({
        type: 'shield-block',
        racerId: racer.id,
        otherId: projectile.owner,
        itemType: type,
        x: racer.x,
        z: racer.z,
      });
      return true;
    }
    if (type === 'oil') {
      if (racer.slipTime < 0.2)
        this.events.push({
          type: 'slip',
          racerId: racer.id,
          otherId: projectile.owner,
          itemType: type,
          x: racer.x,
          z: racer.z,
        });
      racer.slipTime = 0.9;
      racer.lateralSpeed += (racer.id % 2 === 0 ? 1 : -1) * 0.22;
    } else if (type === 'pulse') {
      const dx = racer.x - projectile.x,
        dz = racer.z - projectile.z;
      const d = Math.max(0.5, Math.hypot(dx, dz));
      applyWorldImpulse(racer, (dx / d) * 6.5, (dz / d) * 6.5);
      racer.speed *= 0.84;
      racer.invulnerable = 0.7;
      racer.impactTime = 0.4;
      racer.impactStrength = 0.6;
      this.events.push({
        type: 'hit',
        racerId: racer.id,
        otherId: projectile.owner,
        itemType: type,
        strength: 0.6,
      });
    } else {
      const speed = racer.speed;
      applyHit(racer);
      if (type === 'water') {
        racer.speed = speed * 0.62;
        racer.stun = 0.58;
      }
      if (type === 'banana') {
        racer.slipTime = 1.35;
        racer.lateralSpeed += 3.8;
        racer.stun = 0.8;
      }
      racer.impactTime = 0.38;
      racer.impactStrength = type === 'homing' ? 0.9 : 0.6;
      this.events.push({
        type: 'hit',
        racerId: racer.id,
        otherId: projectile.owner,
        itemType: type,
        strength: racer.impactStrength,
        x: racer.x,
        z: racer.z,
      });
    }
    return true;
  }
  private updateProjectiles(dt: number) {
    for (const projectile of this.projectiles) {
      projectile.ttl -= dt;
      const owner = this.racers.find((racer) => racer.id === projectile.owner);
      if (owner && owner.finishTime !== null) {
        projectile.ttl = 0;
        continue;
      }
      if (projectile.type === 'water' || projectile.type === 'homing') {
        if (projectile.type === 'homing') {
          const target = this.racers.find((racer) => racer.id === projectile.targetId);
          if (target && target.finishTime === null) {
            const desired = Math.atan2(target.x - projectile.x, target.z - projectile.z);
            projectile.yaw += clamp(angleDelta(desired, projectile.yaw), -1.8 * dt, 1.8 * dt);
          }
        }
        const speed = projectile.type === 'water' ? 52 : 43;
        projectile.x += Math.sin(projectile.yaw) * speed * dt;
        projectile.z += Math.cos(projectile.yaw) * speed * dt;
      } else if (projectile.type === 'pulse') {
        projectile.radius = Math.min(8.5, (projectile.radius ?? 0.5) + 18 * dt);
      }
      for (const racer of this.racers) {
        if (racer.id === projectile.owner || racer.recovery > 0 || racer.finishTime !== null)
          continue;
        const groundHazard =
          projectile.type === 'banana' || projectile.type === 'oil' || projectile.type === 'pulse';
        if (
          groundHazard
            ? racer.heightOffset > 0.7
            : Math.abs(racer.heightOffset + 0.75 - (projectile.heightOffset ?? 0.75)) > 1.05
        )
          continue;
        if (projectile.hitRacers?.includes(racer.id)) continue;
        const radius = projectile.radius ?? 2;
        if (
          Math.hypot(racer.x - projectile.x, racer.z - projectile.z) <
          radius + (projectile.type === 'oil' ? 0.6 : 0)
        ) {
          if (this.projectileHit(projectile, racer)) {
            if (projectile.type === 'pulse') projectile.hitRacers?.push(racer.id);
            else if (projectile.type !== 'oil') {
              projectile.ttl = 0;
              break;
            }
          }
        }
      }
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--)
      if (this.projectiles[i].ttl <= 0) this.projectiles.splice(i, 1);
  }
}
