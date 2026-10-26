import './style.css';
import { GameWorld } from './world';
import { RaceSimulation } from './simulation';
import { KeyboardInput } from './input';
import { SaveStore } from './storage';
import { GameAudio } from './audio';
import { GameUI } from './ui';
import type { RaceConfig, InputState } from './types';
import { EMPTY_INPUT } from './types';
const canvas = document.querySelector<HTMLCanvasElement>('#world')!,
  root = document.querySelector<HTMLElement>('#app')!;
const store = new SaveStore(),
  audio = new GameAudio(store.data.settings);
let world: GameWorld;
try {
  world = new GameWorld(canvas);
} catch (error) {
  root.innerHTML =
    '<main class="fatal"><h1>海湾还没加载好</h1><p>请使用支持 WebGL 2 的桌面浏览器，并开启硬件加速后刷新页面。</p><button onclick="location.reload()">重新加载</button></main>';
  console.error(error);
  throw error;
}
world.setQuality(store.data.settings.quality);
let config: RaceConfig = {
  characterId: store.data.settings.characterId,
  difficulty: store.data.settings.difficulty,
  mode: 'race',
  driving: store.data.settings.driving,
};
let simulation = new RaceSimulation({ ...config, difficulty: 'normal' });
simulation.startImmediately();
let accumulator = 0,
  lastTime = performance.now() / 1000,
  frameCount = 0,
  frameDurations: number[] = [];
let testAutoDrive = false;
const FIXED = 1 / 60;
const input = new KeyboardInput(() => {
  if (ui.screen === 'playing') pause();
  else if (ui.screen === 'pause') resume();
});
const ui = new GameUI(root, store, world.portraits(), {
  control: (action) => input.trigger(action),
  start: (next) => {
    config = next;
    simulation = new RaceSimulation(config);
    accumulator = 0;
    clearControls();
    input.active = true;
    world.resetCamera();
    ui.show('playing');
  },
  pause,
  resume,
  restart: () => {
    simulation = new RaceSimulation(config);
    clearControls();
    input.active = true;
    accumulator = 0;
    world.resetCamera();
    ui.show('playing');
  },
  home: () => {
    input.active = false;
    clearControls();
    simulation = new RaceSimulation({
      characterId: store.data.settings.characterId,
      difficulty: 'normal',
      mode: 'race',
    });
    simulation.startImmediately();
    world.resetCamera();
    accumulator = 0;
    ui.show('home');
  },
  settings: (settings) => {
    audio.applySettings(settings);
    world.setQuality(settings.quality);
  },
  unlock: () => {
    void audio.unlock();
  },
});
function clearControls() {
  input.clear();
}
function pause() {
  audio.stopRaceSounds();
  simulation.pause();
  clearControls();
  ui.show('pause');
}
function resume() {
  simulation.resume();
  clearControls();
  ui.show('playing');
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden && ui.screen === 'playing') pause();
});
window.addEventListener('blur', () => {
  if (ui.screen === 'playing') pause();
});
canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  if (ui.screen === 'playing') pause();
});
canvas.addEventListener('webglcontextrestored', () => location.reload());
function frame(nowMs: number) {
  const now = nowMs / 1000,
    dt = Math.min(0.1, Math.max(0, now - lastTime));
  lastTime = now;
  if (frameCount++ > 30) {
    frameDurations.push(dt * 1000);
    if (frameDurations.length > 1200) frameDurations.shift();
  }
  input.active = ui.screen === 'playing' || ui.screen === 'pause';
  const playing = ui.screen === 'playing',
    demo = ['home', 'setup', 'help'].includes(ui.screen);
  if (playing || demo) {
    accumulator += dt;
    let controls = playing ? input.read() : EMPTY_INPUT;
    while (accumulator >= FIXED) {
      simulation.step(FIXED, controls, demo || testAutoDrive);
      accumulator -= FIXED;
      input.consumeActions();
      controls = {
        ...controls,
        item: false,
        recover: false,
        lane: null,
        nitro: false,
        interact: false,
      };
    }
    if (demo && simulation.phase === 'finished') {
      simulation = new RaceSimulation({
        characterId: store.data.settings.characterId,
        difficulty: 'normal',
        mode: 'race',
      });
      simulation.startImmediately();
    }
  }
  const events = simulation.drainEvents();
  if (playing) {
    audio.events(events);
    ui.events(events, now);
  }
  const snapshot = simulation.snapshot();
  ui.update(snapshot, now);
  if (playing && simulation.phase === 'finished') {
    input.active = false;
    clearControls();
    ui.show('results');
    world.resetCamera();
  }
  world.update(
    snapshot,
    now,
    simulation.phase === 'paused' || simulation.phase === 'finished' ? 1 : accumulator / FIXED,
    ui.screen === 'results'
      ? 'results'
      : playing || ui.screen === 'pause' || ui.screen === 'settings'
        ? 'race'
        : 'menu',
  );
  audio.update(
    snapshot.racers[0].speed,
    snapshot.racers[0].drifting,
    playing && snapshot.phase === 'racing',
  );
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
if (import.meta.env.DEV) {
  Object.assign(window, {
    __PAWPRINT_TEST__: {
      snapshot: () => simulation.snapshot(),
      camera: () => ({
        view: world.camera.matrixWorldInverse.toArray(),
        projection: world.camera.projectionMatrix.toArray(),
        position: world.camera.position.toArray(),
      }),
      screen: () => ui.screen,
      autoDrive: (enabled: boolean) => {
        testAutoDrive = enabled;
      },
      step: (frames: number, controls: InputState = EMPTY_INPUT, auto = false) => {
        for (let i = 0; i < frames; i++) simulation.step(FIXED, controls, auto);
        return simulation.snapshot();
      },
      stats: () => ({
        ...world.getStats(),
        averageFrameMs:
          frameDurations.reduce((a, b) => a + b, 0) / Math.max(1, frameDurations.length),
      }),
      resetMetrics: () => {
        frameDurations = [];
      },
      giveItem: (item: import('./types').ItemType) => {
        simulation.racers[0].item = item;
        simulation.racers[0].itemCooldown = 0;
      },
      recommendControls: () => simulation.aiInput(simulation.racers[0]),
      config: () => config,
    },
  });
}
