export type CharacterId = 'panda' | 'capybara' | 'fox' | 'penguin';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type RaceMode = 'race' | 'time';
export type Quality = 'low' | 'medium' | 'high';
export type ItemType = 'boost' | 'shield' | 'water' | 'banana' | 'homing' | 'pulse' | 'oil';
export type SurfaceKind = 'road' | 'sand' | 'wood' | 'wet';
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
    description: '均衡偏稳，入弯灵巧，也能稳住碰撞。',
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
    description: '重量更足，抗撞稳当，直道是我的主场。',
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
    description: '轻灵入弯，侧撞更容易偏移，留意身旁对手。',
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
    description: '起步飞快，中等重量，滑行是天生本领。',
  },
];
export const ITEM_INFO: Record<ItemType, { name: string; icon: string; description: string }> = {
  boost: { name: '加速果汁', icon: 'boost', description: '一口热带能量，短时冲刺' },
  shield: { name: '泡泡护盾', icon: 'shield', description: '挡住一次攻击，持续 6 秒' },
  water: { name: '前向水球', icon: 'water', description: '向前发射，命中对手使其减速' },
  banana: { name: '香蕉皮', icon: 'banana', description: '留在身后，命中追兵造成短暂眩晕' },
  homing: { name: '追踪海螺', icon: 'homing', description: '有限转弯追踪前方对手，急转换线可躲开' },
  pulse: { name: '潮汐冲击', icon: 'pulse', description: '近身扩散冲击，推开周围对手' },
  oil: { name: '墨汁陷阱', icon: 'oil', description: '留下低抓地墨迹，换线或跳跃可避开' },
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
  lateralSpeed: number;
  heightOffset: number;
  previousHeightOffset: number;
  verticalSpeed: number;
  surface: SurfaceKind;
  grip: number;
  slipTime: number;
  impactTime: number;
  impactStrength: number;
  landingTime: number;
  acceleration: number;
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
  type: 'water' | 'banana' | 'homing' | 'pulse' | 'oil';
  targetId?: number;
  radius?: number;
  hitRacers?: number[];
  heightOffset?: number;
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
    | 'interaction'
    | 'collision'
    | 'launch'
    | 'land'
    | 'item-use'
    | 'slip'
    | 'shield-block';
  racerId: number;
  value?: number | string;
  otherId?: number;
  itemType?: ItemType;
  strength?: number;
  x?: number;
  z?: number;
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
