import type { InputState } from './types';
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
  'Escape',
]);
export class KeyboardInput {
  private down = new Set<string>();
  private item = false;
  private recover = false;
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
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.clear());
  }
  clear() {
    this.down.clear();
    this.item = false;
    this.recover = false;
  }
  consumeActions() {
    this.item = false;
    this.recover = false;
  }
  read(): InputState {
    const has = (...keys: string[]) => keys.some((k) => this.down.has(k));
    const input = {
      throttle: Number(has('KeyW', 'ArrowUp')) - Number(has('KeyS', 'ArrowDown')),
      steer: Number(has('KeyD', 'ArrowRight')) - Number(has('KeyA', 'ArrowLeft')),
      drift: has('Space'),
      item: this.item,
      recover: this.recover,
    };
    return input;
  }
}
