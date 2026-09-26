import { it, expect, vi } from 'vitest';
import { KeyboardInput } from '../src/input';
it('retains edge actions across render frames until a physics step consumes them', () => {
  const target = new EventTarget();
  vi.stubGlobal('window', target);
  try {
    const input = new KeyboardInput(() => {});
    input.active = true;
    const event = Object.assign(new Event('keydown'), { code: 'KeyE', repeat: false });
    target.dispatchEvent(event);
    expect(input.read().item).toBe(true);
    expect(input.read().item).toBe(true);
    input.consumeActions();
    expect(input.read().item).toBe(false);
  } finally {
    vi.unstubAllGlobals();
  }
});
it('clear removes held controls and pending actions before pause or restart', () => {
  const target = new EventTarget();
  vi.stubGlobal('window', target);
  try {
    const input = new KeyboardInput(() => {});
    input.active = true;
    for (const code of ['KeyW', 'KeyE', 'KeyR'])
      target.dispatchEvent(Object.assign(new Event('keydown'), { code, repeat: false }));
    expect(input.read()).toMatchObject({ throttle: 1, item: true, recover: true });
    input.clear();
    expect(input.read()).toMatchObject({ throttle: 0, item: false, recover: false });
  } finally {
    vi.unstubAllGlobals();
  }
});
