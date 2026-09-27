export type CharacterId = 'panda' | 'capybara' | 'fox' | 'penguin';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type RaceMode = 'race' | 'time';
export type Quality = 'low' | 'medium' | 'high';
export type ItemType = 'boost' | 'shield' | 'water' | 'banana';
export type DrivingMode = 'assisted' | 'manual';
export type Lane = -1 | 0 | 1;
export type InteractionKind = 'jump' | 'drift' | 'spin';
export type Phase = 'countdown' | 'racing' | 'paused' | 'finished';
export interface RaceConfig {
  characterId: CharacterId;
  difficulty: Difficulty;
  mode: RaceMode;
  driving?: DrivingMode;
}
export interface InputState {
  throttle: number;
  steer: number;
  drift: boolean;
  item: boolean;
  recover: boolean;
  lane?: Lane | null;
  nitro?: boolean;
  interact?: boolean;
}
export const EMPTY_INPUT: InputState = {
  throttle: 0,
  steer: 0,
  drift: false,
  item: false,
  recover: false,
};
export interface Point {
  x: number;
  z: number;
}
export interface TrackPoint extends Point {
  yaw: number;
  y: number;
  progress: number;
}
export interface Character {
  id: CharacterId;
  name: string;
  title: string;
  color: number;
  accent: string;
  speed: number;
  acceleration: number;
  handling: number;
  description: string;
}
export const CHARACTERS: Character[] = [
  {
    id: 'panda',
    name: '团团',
    title: '小熊猫',
    color: 0x35b8bc,
    accent: '#47d2cb',
    speed: 31,
    acceleration: 17,
    handling: 1.02,
    description: '均衡灵巧，每一个弯都刚刚好。',
  },
  {
    id: 'capybara',
    name: '薯条',
    title: '水豚',
    color: 0xf3c55c,
    accent: '#ffd76c',
    speed: 32,
    acceleration: 15.5,
    handling: 0.95,
    description: '稳稳向前，直道是我的主场。',
  },
  {
    id: 'fox',
    name: '柚子',
    title: '狐狸',
    color: 0xf27460,
    accent: '#ff9277',
    speed: 31.5,
    acceleration: 16,
    handling: 1.07,
    description: '轻快入弯，把海风甩在身后。',
  },
  {
    id: 'penguin',
    name: '冰棒',
    title: '企鹅',
    color: 0x7198ed,
    accent: '#a2bbff',
    speed: 30.5,
    acceleration: 19,
    handling: 1,
    description: '起步飞快，滑行是天生本领。',
  },
];
export const ITEM_INFO: Record<ItemType, { name: string; icon: string; description: string }> = {
  boost: { name: '加速果汁', icon: '↗', description: '一口热带能量，短时冲刺' },
  shield: { name: '泡泡护盾', icon: '◉', description: '挡住一次攻击，持续 6 秒' },
  water: { name: '前向水球', icon: '●', description: '向前发射，命中对手使其减速' },
  banana: { name: '香蕉皮', icon: '⌁', description: '留在身后，让追兵打个滑' },
};
export interface Racer {
  id: number;
  characterId: CharacterId;
  name: string;
  x: number;
  z: number;
  yaw: number;
  previousX: number;
  previousZ: number;
  previousYaw: number;
  speed: number;
  velocityYaw: number;
  steer: number;
  progress: number;
  lastProgress: number;
  beforeStart: boolean;
  laps: number;
  nextCheckpoint: number;
  lapStartedAt: number;
  lapTimes: number[];
  finishTime: number | null;
  driftCharge: number;
  drifting: boolean;
  driftDirection: number;
  boost: number;
  shield: number;
  stun: number;
  invulnerable: number;
  item: ItemType | null;
  itemCooldown: number;
  lane: number;
  aiThink: number;
  offroad: boolean;
  recovery: number;
  completedDistance: number;
  targetLane: Lane;
  nitro: number;
  nitroTime: number;
  actionKind: InteractionKind | null;
  actionTime: number;
  actionDuration: number;
  perfectActions: number;
  successfulActions: number;
  nitroUses: number;
}
export interface Projectile extends Point {
  id: number;
  type: 'water' | 'banana';
  owner: number;
  yaw: number;
  ttl: number;
}
export interface ItemBox {
  progress: number;
  offset: number;
  cooldown: number;
}
export interface RaceEvent {
  type:
    | 'go'
    | 'countdown'
    | 'drift'
    | 'boost'
    | 'pickup'
    | 'hit'
    | 'shield'
    | 'lap'
    | 'finish'
    | 'recover'
    | 'nitro'
    | 'charge'
    | 'route'
    | 'interaction';
  racerId: number;
  value?: number | string;
}
export interface RoutePrompt {
  id: string;
  distance: number;
  left: string;
  right: string;
}
export interface InteractionPrompt {
  id: string;
  kind: InteractionKind;
  title: string;
  distance: number;
  available: boolean;
  perfect: boolean;
}
export interface NitroPickup {
  progress: number;
  lane: Lane;
  collectedLap: number;
}
export interface RaceSnapshot {
  phase: Phase;
  elapsed: number;
  countdown: number;
  racers: readonly Racer[];
  projectiles: readonly Projectile[];
  boxes: readonly ItemBox[];
  standings: readonly Racer[];
  config: RaceConfig;
  route: RoutePrompt | null;
  interaction: InteractionPrompt | null;
  pickups: readonly NitroPickup[];
}
export interface Settings {
  quality: Quality;
  sound: boolean;
  music: boolean;
  volume: number;
  characterId: CharacterId;
  difficulty: Difficulty;
  driving: DrivingMode;
}
export interface PersonalRecord {
  lap: number | null;
  race: number | null;
}
