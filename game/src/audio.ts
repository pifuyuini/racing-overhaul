import type { RaceEvent, Settings } from './types';
export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private engine: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private ambience: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private skid: GainNode | null = null;
  private settings: Settings;
  private nextNote = 0;
  private noteIndex = 0;
  constructor(settings: Settings) {
    this.settings = { ...settings };
  }
  async unlock() {
    if (!this.context) {
      const ctx = (this.context = new AudioContext()),
        master = (this.master = ctx.createGain());
      master.connect(ctx.destination);
      const engine = (this.engine = ctx.createOscillator()),
        filter = ctx.createBiquadFilter(),
        gain = (this.engineGain = ctx.createGain());
      engine.type = 'sawtooth';
      engine.frequency.value = 65;
      filter.type = 'lowpass';
      filter.frequency.value = 240;
      gain.gain.value = 0;
      engine.connect(filter).connect(gain).connect(master);
      engine.start();
      const noise = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate),
        channel = noise.getChannelData(0);
      for (let i = 0; i < channel.length; i++) channel[i] = (Math.random() * 2 - 1) * 0.4;
      const sea = ctx.createBufferSource();
      sea.buffer = noise;
      sea.loop = true;
      const seaFilter = ctx.createBiquadFilter();
      seaFilter.type = 'lowpass';
      seaFilter.frequency.value = 420;
      this.ambience = ctx.createGain();
      this.ambience.gain.value = 0.06;
      sea.connect(seaFilter).connect(this.ambience).connect(master);
      sea.start();
      const skidSource = ctx.createBufferSource();
      skidSource.buffer = noise;
      skidSource.loop = true;
      const skidFilter = ctx.createBiquadFilter();
      skidFilter.type = 'bandpass';
      skidFilter.frequency.value = 1700;
      this.skid = ctx.createGain();
      this.skid.gain.value = 0;
      skidSource.connect(skidFilter).connect(this.skid).connect(master);
      skidSource.start();
      this.musicGain = ctx.createGain();
      this.musicGain.connect(master);
      this.applySettings(this.settings);
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }
  applySettings(settings: Settings) {
    this.settings = { ...settings };
    if (this.master && this.context)
      this.master.gain.setTargetAtTime(
        settings.sound ? settings.volume : 0,
        this.context.currentTime,
        0.1,
      );
    if (this.musicGain) this.musicGain.gain.value = settings.music ? 0.28 : 0;
  }
  private tone(
    freq: number,
    duration = 0.15,
    type: OscillatorType = 'sine',
    volume = 0.2,
    delay = 0,
    music = false,
  ) {
    if (!this.context || !this.master) return;
    const ctx = this.context,
      o = ctx.createOscillator(),
      g = ctx.createGain(),
      t = ctx.currentTime + delay;
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(g).connect(music ? this.musicGain! : this.master);
    o.start(t);
    o.stop(t + duration + 0.02);
  }
  update(speed: number, drifting: boolean, active: boolean) {
    if (!this.context) return;
    const t = this.context.currentTime;
    this.engine?.frequency.setTargetAtTime(48 + Math.abs(speed) * 4.8, t, 0.1);
    this.engineGain?.gain.setTargetAtTime(active ? 0.022 + Math.abs(speed) * 0.00055 : 0, t, 0.12);
    this.skid?.gain.setTargetAtTime(drifting && active ? 0.1 : 0, t, 0.08);
    this.ambience?.gain.setTargetAtTime(0.055 + Math.sin(t * 0.4) * 0.015, t, 0.1);
    if (t >= this.nextNote) {
      this.nextNote = t + 0.22;
      const melody = [
        76, 0, 79, 83, 81, 79, 76, 0, 74, 76, 79, 0, 74, 71, 72, 0, 76, 79, 84, 83, 81, 79, 76, 74,
        72, 0, 74, 76, 79, 0, 76, 0,
      ];
      const n = melody[this.noteIndex % melody.length];
      if (n) this.tone(440 * 2 ** ((n - 69) / 12), 0.22, 'sine', 0.09, 0, true);
      if (this.noteIndex % 4 === 0)
        this.tone(
          [130.81, 146.83, 164.81, 196][Math.floor(this.noteIndex / 8) % 4],
          0.35,
          'triangle',
          0.075,
          0,
          true,
        );
      this.noteIndex++;
    }
  }
  events(events: RaceEvent[]) {
    for (const e of events) {
      if (e.racerId !== 0) continue;
      if (e.type === 'countdown') this.tone(550, 0.12, 'sine', 0.24);
      if (e.type === 'go') {
        this.tone(880, 0.45, 'triangle', 0.3);
      }
      if (e.type === 'charge' || e.type === 'route') this.tone(988, 0.18, 'sine', 0.18);
      if (e.type === 'interaction')
        [659, 880, 1318].forEach((n, i) => this.tone(n, 0.3, 'triangle', 0.2, i * 0.07));
      if (e.type === 'pickup') {
        this.tone(659, 0.12, 'sine', 0.25);
        this.tone(988, 0.2, 'sine', 0.2, 0.08);
      }
      if (e.type === 'boost' || e.type === 'drift' || e.type === 'nitro') {
        [392, 523, 784].forEach((n, i) => this.tone(n, 0.18, 'triangle', 0.14, i * 0.045));
      }
      if (e.type === 'hit') this.tone(95, 0.3, 'sawtooth', 0.13);
      if (e.type === 'shield') this.tone(1046, 0.3, 'sine', 0.18);
      if (e.type === 'lap')
        [659, 784, 1046].forEach((n, i) => this.tone(n, 0.2, 'sine', 0.2, i * 0.09));
      if (e.type === 'finish')
        [523, 659, 784, 1046, 1318].forEach((n, i) =>
          this.tone(n, 0.55, 'triangle', 0.22, i * 0.14),
        );
    }
  }
}
