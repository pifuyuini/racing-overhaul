import type { CharacterId, PersonalRecord, Settings, RaceMode, DrivingMode } from './types';
const KEY = 'pawprint-paradise-v1';
export const DEFAULT_SETTINGS: Settings = {
  quality: 'medium',
  sound: true,
  music: true,
  volume: 0.55,
  characterId: 'panda',
  difficulty: 'normal',
  driving: 'assisted',
};
interface SaveData {
  settings: Settings;
  records: Record<string, PersonalRecord>;
}
export class SaveStore {
  data: SaveData = { settings: { ...DEFAULT_SETTINGS }, records: {} };
  private storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  constructor(storage?: Pick<Storage, 'getItem' | 'setItem'> | null) {
    this.storage = storage ?? null;
    try {
      if (storage === undefined) {
        this.storage = typeof localStorage === 'undefined' ? null : localStorage;
      }
      const raw = this.storage?.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.data = {
          settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
          records: parsed.records ?? {},
        };
      }
    } catch {
      this.storage = null;
      /* Device storage may be unavailable. The session remains playable. */
    }
  }
  save() {
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* Keep in-memory preferences for this session. */
    }
  }
  setSettings(settings: Partial<Settings>) {
    Object.assign(this.data.settings, settings);
    this.save();
  }
  recordKey(character: CharacterId, mode: RaceMode, driving: DrivingMode = 'manual') {
    return (driving === 'assisted' ? 'assisted:' : '') + mode + ':' + character;
  }
  record(character: CharacterId, mode: RaceMode, driving: DrivingMode = 'manual'): PersonalRecord {
    return this.data.records[this.recordKey(character, mode, driving)] ?? { lap: null, race: null };
  }
  updateRecord(
    character: CharacterId,
    mode: RaceMode,
    lap: number,
    race: number,
    driving: DrivingMode = 'manual',
  ) {
    const old = this.record(character, mode, driving);
    const next = {
      lap: old.lap === null ? lap : Math.min(old.lap, lap),
      race: old.race === null ? race : Math.min(old.race, race),
    };
    this.data.records[this.recordKey(character, mode, driving)] = next;
    this.save();
    return { lap: old.lap === null || lap < old.lap, race: old.race === null || race < old.race };
  }
}
export function formatTime(seconds: number | null) {
  if (seconds === null) return '— —';
  const mins = Math.floor(seconds / 60),
    s = Math.floor(seconds % 60),
    ms = Math.floor((seconds % 1) * 1000);
  return mins + ':' + String(s).padStart(2, '0') + '.' + String(ms).padStart(3, '0');
}
