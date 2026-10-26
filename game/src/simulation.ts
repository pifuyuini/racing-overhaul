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
} from './track';
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
    if (!this.assisted) return null;
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
    const base = { easy: 24.5, normal: 28, hard: 31.5 }[difficulty] + ((racer.id % 3) - 1) * 0.65;
    const corneringPenalty = { easy: 15, normal: 8, hard: 3 }[difficulty];
    const targetSpeed = clamp(base - curvature * corneringPenalty, 12, base);
    const throttle = racer.speed < targetSpeed ? 1 : racer.speed > targetSpeed + 2 ? -0.45 : 0;
    let item = false;
    if (racer.item && racer.itemCooldown <= 0 && racer.aiThink > 2) {
      item =
        racer.item === 'banana' ||
        racer.item === 'shield' ||
        (racer.item === 'boost' && curvature < 0.45) ||
        (racer.item === 'water' &&
          this.racers.some(
            (other) =>
              other !== racer &&
              Math.hypot(other.x - racer.x, other.z - racer.z) < 28 &&
              Math.abs(angleDelta(Math.atan2(other.x - racer.x, other.z - racer.z), racer.yaw)) <
                0.4,
          ));
    }
    return { throttle, steer: clamp(error * 2.4, -1, 1), drift: false, item, recover: false };
  }
  useItem(racer: Racer) {
    if (!racer.item || racer.itemCooldown > 0) return;
    const type = racer.item;
    racer.item = null;
    racer.itemCooldown = 0.6;
    racer.aiThink = 0;
    if (type === 'boost') {
      racer.boost = Math.max(racer.boost, 2.6);
      this.events.push({ type: 'boost', racerId: racer.id });
    } else if (type === 'shield') {
      racer.shield = 6;
      this.events.push({ type: 'shield', racerId: racer.id });
    } else {
      const direction = type === 'water' ? 1 : -1;
      this.projectiles.push({
        id: this.nextProjectile++,
        type,
        owner: racer.id,
        x: racer.x + Math.sin(racer.yaw) * 3.2 * direction,
        z: racer.z + Math.cos(racer.yaw) * 3.2 * direction,
        yaw: racer.yaw,
        ttl: type === 'water' ? 3.5 : 18,
      });
    }
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
      if (racer.id === 0 && !autoPlayer && this.assisted)
        this.updateAssistedRacer(racer, input, dt);
      else {
        const controls = racer.id === 0 && !autoPlayer ? input : this.aiInput(racer);
        this.updateRacer(racer, controls, dt);
      }
    }
    this.resolveCollisions();
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
      'nitroTime',
      'actionTime',
    ] as const)
      r[key] = Math.max(0, r[key] - dt);
    if (r.actionTime === 0) r.actionKind = null;
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
    const prompt = this.interactionPrompt();
    if (input.interact && prompt?.available && r.stun === 0) {
      this.claimedActions.add(r.laps + ':' + prompt.id);
      r.actionKind = prompt.kind;
      r.actionDuration = prompt.kind === 'drift' ? 1.55 : 1.25;
      r.actionTime = r.actionDuration;
      r.successfulActions++;
      if (prompt.perfect) r.perfectActions++;
      r.nitro = Math.min(100, r.nitro + (prompt.perfect ? 25 : 14));
      r.boost = Math.max(r.boost, prompt.perfect ? 2.2 : 1.1);
      this.events.push({
        type: 'interaction',
        racerId: 0,
        value: (prompt.perfect ? '完美' : '漂亮') + ' · ' + prompt.title,
      });
    }
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
    r.lane += (targetOffset - r.lane) * (1 - Math.exp(-dt * 3.8 * spec.handling));
    const current = TRACK.at(r.progress);
    const curve = Math.abs(angleDelta(TRACK.at(r.progress + 25 / TRACK.length).yaw, current.yaw));
    const cruising = clamp(spec.speed * 0.9 - curve * 11, 16, spec.speed * 0.9);
    const targetSpeed = cruising + (r.boost > 0 ? 12 : 0);
    if (r.stun > 0) r.speed = Math.max(5, r.speed * Math.exp(-1.4 * dt));
    else if (r.speed < targetSpeed)
      r.speed = Math.min(targetSpeed, r.speed + (spec.acceleration + (r.boost > 0 ? 20 : 0)) * dt);
    else r.speed = Math.max(targetSpeed, r.speed - 18 * dt);
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
            const items: ItemType[] = ['boost', 'shield', 'water', 'banana'];
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
    const throttle = stunned ? 0 : input.throttle;
    if (throttle > 0) racer.speed += spec.acceleration * throttle * dt;
    else if (throttle < 0) racer.speed -= 23 * Math.abs(throttle) * dt;
    else racer.speed *= Math.exp(-0.33 * dt);
    if (racer.boost > 0) racer.speed += 21 * dt;
    if (stunned) racer.speed *= Math.exp(-1.3 * dt);
    if (racer.speed > maximum) racer.speed = Math.max(maximum, racer.speed - 25 * dt);
    racer.speed = clamp(racer.speed, -7, maximum + 2);
    if (Math.abs(racer.speed) < 0.07) racer.speed = 0;
    racer.yaw +=
      racer.steer *
      2.12 *
      spec.handling *
      (racer.speed / (12 + Math.abs(racer.speed))) *
      (drifting ? 1.19 : 1) *
      dt;
    // Slow velocity response creates drift slip without an opposite turn on entry.
    const targetVelocityYaw = racer.yaw;
    racer.velocityYaw +=
      angleDelta(targetVelocityYaw, racer.velocityYaw) * Math.min(1, dt * (drifting ? 3.3 : 12));
    racer.x += Math.sin(racer.velocityYaw) * racer.speed * dt;
    racer.z += Math.cos(racer.velocityYaw) * racer.speed * dt;
    const next = TRACK.nearest(racer.x, racer.z, racer.progress);
    const barrier =
      ROAD_WIDTH / 2 +
      (next.point.progress > BRIDGE_START && next.point.progress < BRIDGE_END ? 1 : 5);
    if (next.distance > barrier && next.distance < 27) {
      const sign = Math.sign(next.offset);
      racer.x = next.point.x + Math.cos(next.point.yaw) * barrier * sign;
      racer.z = next.point.z - Math.sin(next.point.yaw) * barrier * sign;
      racer.speed *= Math.exp(-2.5 * dt);
      racer.velocityYaw += angleDelta(next.point.yaw, racer.velocityYaw) * dt * 2;
    }
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
          const items: ItemType[] = ['boost', 'shield', 'water', 'banana'];
          racer.item = items[Math.floor(this.random() * items.length)];
          racer.itemCooldown = 0.6;
          box.cooldown = 5;
          this.events.push({ type: 'pickup', racerId: racer.id, value: racer.item });
          break;
        }
      }
  }
  private resolveCollisions() {
    // Two overlapping circles approximate each kart's long body without a rigid-body engine.
    for (let i = 0; i < this.racers.length; i++)
      for (let j = i + 1; j < this.racers.length; j++) {
        const a = this.racers[i],
          b = this.racers[j];
        if (Math.hypot(a.x - b.x, a.z - b.z) > 4.1) continue;
        let deepest = 0,
          nx = 0,
          nz = 0;
        for (const frontA of [-0.82, 0.82])
          for (const frontB of [-0.82, 0.82]) {
            const dx = a.x + Math.sin(a.yaw) * frontA - b.x - Math.sin(b.yaw) * frontB;
            const dz = a.z + Math.cos(a.yaw) * frontA - b.z - Math.cos(b.yaw) * frontB;
            const distance = Math.hypot(dx, dz),
              penetration = 2.34 - distance;
            if (penetration > deepest && distance > 0.001) {
              deepest = penetration;
              nx = dx / distance;
              nz = dz / distance;
            }
          }
        if (deepest > 0) {
          a.x += nx * deepest * 0.5;
          a.z += nz * deepest * 0.5;
          b.x -= nx * deepest * 0.5;
          b.z -= nz * deepest * 0.5;
          const forwardA = Math.sin(a.yaw) * nx + Math.cos(a.yaw) * nz,
            forwardB = Math.sin(b.yaw) * nx + Math.cos(b.yaw) * nz;
          const closing = a.speed * forwardA - b.speed * forwardB;
          if (closing < 0) {
            const impulse = -closing * 0.45;
            a.speed += forwardA * impulse;
            b.speed -= forwardB * impulse;
          }
        }
      }
  }
  private updateProjectiles(dt: number) {
    for (const projectile of this.projectiles) {
      projectile.ttl -= dt;
      if (projectile.type === 'water') {
        projectile.x += Math.sin(projectile.yaw) * 52 * dt;
        projectile.z += Math.cos(projectile.yaw) * 52 * dt;
      }
      for (const racer of this.racers) {
        if (racer.id === projectile.owner || racer.recovery > 0) continue;
        if (Math.hypot(racer.x - projectile.x, racer.z - projectile.z) < 2) {
          const hit = applyHit(racer);
          if (hit !== 'ignored') {
            this.events.push({ type: hit, racerId: racer.id });
            projectile.ttl = 0;
            break;
          }
        }
      }
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--)
      if (this.projectiles[i].ttl <= 0) this.projectiles.splice(i, 1);
  }
}
