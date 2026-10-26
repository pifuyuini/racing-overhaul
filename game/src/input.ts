import type { InputState, Lane } from './types';
const KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'KeyE',
  'KeyR',
  'KeyF',
  'Escape',
]);
export class KeyboardInput {
  private down = new Set<string>();
  private item = false;
  private recover = false;
  private lane: Lane | null = null;
  private nitro = false;
  private interact = false;
  active = false;
  constructor(onPause: () => void) {
    window.addEventListener('keydown', (e) => {
      if (!this.active || !KEYS.has(e.code)) return;
      e.preventDefault();
      if (e.code === 'Escape' && !e.repeat) {
        onPause();
        return;
      }
      if (e.code === 'KeyE' && !e.repeat) this.item = true;
      if (e.code === 'KeyR' && !e.repeat) this.recover = true;
      if (!e.repeat) {
        if (['KeyA', 'ArrowLeft'].includes(e.code)) this.lane = -1;
        if (['KeyD', 'ArrowRight'].includes(e.code)) this.lane = 1;
        if (['KeyW', 'KeyS', 'ArrowUp', 'ArrowDown'].includes(e.code)) this.lane = 0;
        if (e.code === 'Space') this.nitro = true;
        if (e.code === 'KeyF') this.interact = true;
      }
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.clear());
  }
  clear() {
    this.down.clear();
    this.item = false;
    this.recover = false;
    this.lane = null;
    this.nitro = false;
    this.interact = false;
  }
  consumeActions() {
    this.item = false;
    this.recover = false;
    this.lane = null;
    this.nitro = false;
    this.interact = false;
  }
  trigger(action: 'item' | 'nitro' | 'interact' | Lane) {
    if (typeof action === 'number') this.lane = action;
    else if (action === 'item') this.item = true;
    else if (action === 'nitro') this.nitro = true;
    else this.interact = true;
  }
  read(): InputState {
    const has = (...keys: string[]) => keys.some((k) => this.down.has(k));
    const input = {
      throttle: Number(has('KeyW', 'ArrowUp')) - Number(has('KeyS', 'ArrowDown')),
      // With +Z forward, positive yaw turns toward the chase camera's left.
      steer: Number(has('KeyA', 'ArrowLeft')) - Number(has('KeyD', 'ArrowRight')),
      drift: has('Space'),
      item: this.item,
      recover: this.recover,
      lane: this.lane,
      nitro: this.nitro,
      interact: this.interact,
    };
    return input;
  }
}
