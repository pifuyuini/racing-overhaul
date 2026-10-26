import type { RaceEvent, Racer, Settings } from './types';
import { WIND_ZONE } from './track';
interface RaceVoice {
  source: AudioScheduledSourceNode;
  gain: GainNode;
}
export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private engine: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private ambience: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private skid: GainNode | null = null;
  private contact: GainNode | null = null;
  private contactFilter: BiquadFilterNode | null = null;
  private brake: GainNode | null = null;
  private wind: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private raceVoices = new Set<RaceVoice>();
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
        filter = (this.engineFilter = ctx.createBiquadFilter()),
        gain = (this.engineGain = ctx.createGain());
      engine.type = 'sawtooth';
      engine.frequency.value = 65;
      filter.type = 'lowpass';
      filter.frequency.value = 240;
      gain.gain.value = 0;
      engine.connect(filter).connect(gain).connect(master);
      engine.start();
      const noise = (this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate)),
        channel = noise.getChannelData(0);
      for (let i = 0; i < channel.length; i++) channel[i] = (Math.random() * 2 - 1) * 0.4;
      const loop = (frequency: number, type: BiquadFilterType) => {
        const source = ctx.createBufferSource(),
          filter = ctx.createBiquadFilter(),
          gain = ctx.createGain();
        source.buffer = noise;
        source.loop = true;
        filter.type = type;
        filter.frequency.value = frequency;
        gain.gain.value = 0;
        source.connect(filter).connect(gain).connect(master);
        source.start();
        return { gain, filter };
      };
      this.ambience = loop(420, 'lowpass').gain;
      this.skid = loop(1700, 'bandpass').gain;
      const contact = loop(650, 'bandpass');
      this.contact = contact.gain;
      this.contactFilter = contact.filter;
      this.brake = loop(1100, 'bandpass').gain;
      this.wind = loop(800, 'lowpass').gain;
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
    endFreq = freq,
  ) {
    if (!this.context || !this.master) return;
    const ctx = this.context,
      source = ctx.createOscillator(),
      gain = ctx.createGain(),
      t = ctx.currentTime + delay;
    source.type = type;
    source.frequency.setValueAtTime(freq, t);
    source.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + duration);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    source.connect(gain).connect(music ? this.musicGain! : this.master);
    const voice = { source, gain };
    if (!music) this.raceVoices.add(voice);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      this.raceVoices.delete(voice);
    };
    source.start(t);
    source.stop(t + duration + 0.02);
  }
  private noise(duration: number, volume: number, frequency: number) {
    if (!this.context || !this.master || !this.noiseBuffer) return;
    const ctx = this.context,
      source = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      gain = ctx.createGain(),
      t = ctx.currentTime;
    source.buffer = this.noiseBuffer;
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = 0.6;
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    source.connect(filter).connect(gain).connect(this.master);
    const voice = { source, gain };
    this.raceVoices.add(voice);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
      this.raceVoices.delete(voice);
    };
    source.start(t);
    source.stop(t + duration + 0.02);
  }
  stopRaceSounds() {
    if (!this.context) return;
    const t = this.context.currentTime;
    for (const gain of [this.engineGain, this.skid, this.contact, this.brake, this.wind]) {
      gain?.gain.cancelScheduledValues(t);
      gain?.gain.setValueAtTime(0, t);
    }
    for (const voice of this.raceVoices) {
      voice.gain.gain.cancelScheduledValues(t);
      voice.gain.gain.setValueAtTime(0, t);
      voice.source.stop(t);
    }
    this.raceVoices.clear();
  }
  update(racer: Racer, active: boolean) {
    if (!this.context) return;
    const t = this.context.currentTime,
      speed = Math.abs(racer.speed),
      load = Math.max(-1, Math.min(1, racer.acceleration / 16)),
      grounded = racer.heightOffset < 0.08,
      moving = Math.min(1, speed / 24),
      windy = racer.progress >= WIND_ZONE.start && racer.progress <= WIND_ZONE.end;
    this.engine?.frequency.setTargetAtTime(
      48 + speed * 4.5 + Math.max(0, load) * 22 + (grounded ? 0 : 14),
      t,
      0.11,
    );
    this.engineFilter?.frequency.setTargetAtTime(
      210 + speed * 7 + Math.max(0, load) * 130,
      t,
      0.12,
    );
    this.engineGain?.gain.setTargetAtTime(
      active ? 0.021 + speed * 0.0005 + Math.max(0, load) * 0.009 : 0,
      t,
      0.08,
    );
    this.skid?.gain.setTargetAtTime(
      active && grounded
        ? Math.min(0.105, Math.abs(racer.lateralSpeed) * 0.009 + (racer.drifting ? 0.028 : 0))
        : 0,
      t,
      0.05,
    );
    this.brake?.gain.setTargetAtTime(
      active && grounded && load < -0.2 ? -load * moving * 0.037 : 0,
      t,
      0.06,
    );
    const wood = racer.surface === 'wood',
      sand = racer.surface === 'sand',
      wet = racer.surface === 'wet',
      plank =
        0.35 + 0.65 * Math.max(0, Math.sin((racer.completedDistance / 1.15) * Math.PI * 2)) ** 6;
    this.contactFilter?.frequency.setTargetAtTime(
      wood ? 240 : wet ? 1050 : sand ? 640 : 360,
      t,
      0.06,
    );
    this.contact?.gain.setTargetAtTime(
      active && grounded ? moving * (wood ? 0.055 * plank : sand ? 0.046 : wet ? 0.028 : 0.008) : 0,
      t,
      wood ? 0.008 : 0.08,
    );
    this.wind?.gain.setTargetAtTime(
      active ? moving * 0.018 + (windy ? 0.036 : 0) + (!grounded ? 0.018 : 0) : 0,
      t,
      0.2,
    );
    this.ambience?.gain.setTargetAtTime(0.055 + Math.sin(t * 0.4) * 0.015, t, 0.1);
    if (t >= this.nextNote) {
      this.nextNote = t + 0.22;
      const melody = [
          76, 0, 79, 83, 81, 79, 76, 0, 74, 76, 79, 0, 74, 71, 72, 0, 76, 79, 84, 83, 81, 79, 76,
          74, 72, 0, 74, 76, 79, 0, 76, 0,
        ],
        n = melody[this.noteIndex % melody.length];
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
      const strength = e.strength ?? 0.5;
      if (e.type === 'countdown') this.tone(550, 0.12, 'sine', 0.24);
      if (e.type === 'go') this.tone(880, 0.45, 'triangle', 0.3);
      if (e.type === 'charge' || e.type === 'route') this.tone(988, 0.18, 'sine', 0.18);
      if (e.type === 'interaction')
        [659, 880, 1318].forEach((n, i) => this.tone(n, 0.3, 'triangle', 0.16, i * 0.07));
      if (e.type === 'pickup') {
        this.tone(659, 0.12, 'sine', 0.25);
        this.tone(988, 0.2, 'sine', 0.2, 0.08);
      }
      if (e.type === 'boost' || e.type === 'drift' || e.type === 'nitro')
        [392, 523, 784].forEach((n, i) => this.tone(n, 0.18, 'triangle', 0.14, i * 0.045));
      if (e.type === 'item-use') {
        const item = e.itemType ?? e.value;
        if (item === 'water') {
          this.noise(0.17, 0.12, 1450);
          this.tone(520, 0.18, 'sine', 0.13, 0, false, 240);
        }
        if (item === 'homing') {
          this.tone(460, 0.25, 'triangle', 0.15, 0, false, 920);
          this.noise(0.23, 0.06, 2100);
        }
        if (item === 'banana') this.tone(340, 0.12, 'triangle', 0.12, 0, false, 180);
        if (item === 'oil') this.noise(0.24, 0.11, 320);
        if (item === 'pulse') {
          this.tone(100, 0.45, 'sine', 0.24, 0, false, 42);
          this.noise(0.28, 0.09, 750);
        }
      }
      if (e.type === 'collision') {
        this.noise(0.12 + strength * 0.13, 0.12 + strength * 0.15, 240 + strength * 500);
        this.tone(105, 0.14, 'triangle', 0.1 + strength * 0.1, 0, false, 48);
      }
      if (e.type === 'hit') {
        this.noise(0.23, 0.19, 700);
        this.tone(115, 0.2, 'sawtooth', 0.08, 0, false, 55);
      }
      if (e.type === 'launch') {
        this.noise(0.18, 0.08, 1500);
        this.tone(300, 0.18, 'sine', 0.13, 0, false, 600);
      }
      if (e.type === 'land') {
        this.noise(0.13 + strength * 0.12, 0.09 + strength * 0.14, 320);
        this.tone(90, 0.13, 'triangle', 0.07 + strength * 0.09, 0, false, 45);
      }
      if (e.type === 'slip') this.noise(0.25, 0.1, 1800);
      if (e.type === 'shield') this.tone(1046, 0.3, 'sine', 0.18);
      if (e.type === 'shield-block') {
        this.tone(1568, 0.22, 'sine', 0.22, 0, false, 780);
        this.tone(2093, 0.32, 'sine', 0.12, 0.03, false, 1046);
      }
      if (e.type === 'lap')
        [659, 784, 1046].forEach((n, i) => this.tone(n, 0.2, 'sine', 0.2, i * 0.09));
      if (e.type === 'finish')
        [523, 659, 784, 1046, 1318].forEach((n, i) =>
          this.tone(n, 0.55, 'triangle', 0.22, i * 0.14),
        );
    }
  }
}
