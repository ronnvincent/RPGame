/**
 * Procedural Web Audio API Sound Generator for RPGJS Side-View Game
 * Zero external audio assets required - Instant, responsive, high-impact sound synthesis.
 */

class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private soundEnabled: boolean = true;
  private bgmOsc: OscillatorNode | null = null;
  private bgmGain: GainNode | null = null;

  constructor() {
    // Initialized lazily on first user gesture
  }

  private initCtx() {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.3, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setSoundEnabled(enabled: boolean) {
    this.soundEnabled = enabled;
  }

  /**
   * Sword Slash / Physical Attack SFX
   */
  public playSlash(type: 'light' | 'heavy' | 'dagger' | 'spear' = 'light', tone = 1) {
    if (!this.soundEnabled) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const amp = Math.max(0.6, Math.min(1.6, tone));
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    filter.type = 'lowpass';
    const lowCutoff = type === 'heavy' ? 850 : type === 'spear' ? 700 : type === 'dagger' ? 1400 : 1800;
    filter.frequency.setValueAtTime(lowCutoff * amp, now);
    filter.frequency.exponentialRampToValueAtTime(100, now + 0.15);

    osc.type = type === 'heavy' ? 'sawtooth' : 'triangle';
    if (type === 'spear') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(320 * amp, now);
      osc.frequency.exponentialRampToValueAtTime(70, now + 0.18);
    } else if (type === 'dagger') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(560 * amp, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.12);
    } else if (type === 'heavy') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180 * amp, now);
      osc.frequency.exponentialRampToValueAtTime(35, now + 0.24);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(460 * amp, now);
      osc.frequency.exponentialRampToValueAtTime(65, now + 0.15);
    }

    const noteLength = type === 'heavy' ? 0.22 : 0.12;
    const finalLength = noteLength / amp;
    gain.gain.setValueAtTime(Math.min(0.65, 0.5 * amp), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + finalLength);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + Math.max(0.2, finalLength * 1.4));

    // Add high frequency white noise swoosh
    this.playNoiseSwoosh(0.1 * amp, type === 'heavy' ? 600 * amp : type === 'spear' ? 1550 : type === 'dagger' ? 1300 : 1200);
  }

  /**
   * Magic Cast / Spell SFX
   */
  public playMagic(type: 'fire' | 'ice' | 'lightning' | 'holy' | 'dark' = 'fire', tone = 1) {
    if (!this.soundEnabled) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const amp = Math.max(0.6, Math.min(1.7, tone));
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (type === 'fire') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150 * amp, now);
      osc.frequency.exponentialRampToValueAtTime(600 * amp, now + 0.1 / amp);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.35);
      gain.gain.setValueAtTime(0.35 * amp, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
      this.playNoiseSwoosh(0.25 * amp, 400 * amp);
    } else if (type === 'ice') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(700 * amp, now);
      osc.frequency.linearRampToValueAtTime(1400 * amp, now + 0.1 / amp);
      osc.frequency.exponentialRampToValueAtTime(380, now + 0.28 / amp);
      gain.gain.setValueAtTime(0.27 * amp, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.28 / amp);
    } else if (type === 'lightning') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(120 * amp, now);
      osc.frequency.linearRampToValueAtTime(880 * amp, now + 0.05 / amp);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.2 / amp);
      gain.gain.setValueAtTime(0.42 * amp, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25 / amp);
      this.playNoiseSwoosh(0.18 * amp, 1800);
    } else if (type === 'holy') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25 * amp, now); // C5
      osc.frequency.linearRampToValueAtTime(659.25 * amp, now + 0.15 / amp); // E5
      osc.frequency.linearRampToValueAtTime(783.99 * amp, now + 0.3 / amp); // G5
      gain.gain.setValueAtTime(0.3 * amp, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5 / amp);
    } else { // dark
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(90 * amp, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.4 / amp);
      gain.gain.setValueAtTime(0.38 * amp, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45 / amp);
    }

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.5);
  }

  /**
   * Hit Impact SFX
   */
  public playHit(isCrit: boolean = false) {
    if (!this.soundEnabled) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = isCrit ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(isCrit ? 350 : 200, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.12);

    gain.gain.setValueAtTime(isCrit ? 0.6 : 0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.18);

    if (isCrit) {
      this.playChime(880, 0.15);
    }
  }

  /**
   * Jump & Dash SFX
   */
  public playJump() {
    if (!this.soundEnabled) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.12);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.18);
  }

  public playDash() {
    if (!this.soundEnabled) return;
    this.playNoiseSwoosh(0.18, 1400);
  }

  /**
   * Loot & Item Pickup SFX
   */
  public playLoot(rarity: 'common' | 'rare' | 'epic' | 'legendary' = 'common') {
    if (!this.soundEnabled) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const notes = rarity === 'legendary' 
      ? [523.25, 659.25, 783.99, 1046.5, 1318.51] // Epic arpeggio
      : rarity === 'epic'
      ? [587.33, 739.99, 880, 1174.66]
      : rarity === 'rare'
      ? [440, 554.37, 659.25]
      : [440, 659.25];

    notes.forEach((freq, index) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const startTime = now + index * 0.06;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.2, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(startTime);
      osc.stop(startTime + 0.3);
    });
  }

  /**
   * Victory Fanfare SFX
   */
  public playVictory() {
    if (!this.soundEnabled) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C, E, G, High C

    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const startTime = now + idx * 0.12;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.35, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.45);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(startTime);
      osc.stop(startTime + 0.5);
    });
  }

  /**
   * Level Up Fanfare SFX
   */
  public playLevelUp() {
    if (!this.soundEnabled) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const notes = [440, 554.37, 659.25, 880, 1108.73, 1318.51];

    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const startTime = now + idx * 0.08;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.3, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(startTime);
      osc.stop(startTime + 0.45);
    });
  }

  /**
   * Potion Drink / Heal SFX
   */
  public playHeal() {
    if (!this.soundEnabled) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const notes = [329.63, 440, 554.37, 659.25]; // E major

    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const startTime = now + idx * 0.08;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.25, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(startTime);
      osc.stop(startTime + 0.35);
    });
  }

  /**
   * Boss Roar / Earthquake SFX
   */
  public playBossRoar() {
    if (!this.soundEnabled) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, now);
    filter.frequency.exponentialRampToValueAtTime(80, now + 0.8);

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.linearRampToValueAtTime(110, now + 0.3);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.8);

    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.85);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.9);

    this.playNoiseSwoosh(0.7, 300);
  }

  /**
   * UI Click / Select
   */
  public playClick() {
    this.playChime(600, 0.05);
  }

  private playChime(freq: number, duration: number) {
    if (!this.soundEnabled) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  private playNoiseSwoosh(duration: number, filterCutoff: number = 1000) {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterCutoff, now);
    filter.Q.setValueAtTime(2.0, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(now);
    noise.stop(now + duration);
  }

  /**
   * Dialogue Speech Blip Sound
   */
  public playDialogueBlip(pitch: number = 440) {
    if (!this.soundEnabled) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(pitch + (Math.random() * 40 - 20), now);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.7, now + 0.04);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  /**
   * Quest Accepted Sound: Bright rising chime
   */
  public playQuestAccept() {
    if (!this.soundEnabled) return;
    this.initCtx();
    const notes = [440, 554, 659, 880];
    notes.forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 0.15), i * 70);
    });
  }

  /**
   * Quest Completed Sound: Victorious triumphant arpeggio
   */
  public playQuestComplete() {
    if (!this.soundEnabled) return;
    this.initCtx();
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 0.25), i * 90);
    });
  }

  /**
   * Grand Boss Victory Fanfare
   */
  public playFanfare() {
    if (!this.soundEnabled) return;
    this.initCtx();
    const melody = [
      { f: 523.25, d: 0.15, t: 0 },
      { f: 523.25, d: 0.15, t: 160 },
      { f: 523.25, d: 0.15, t: 320 },
      { f: 659.25, d: 0.35, t: 480 },
      { f: 587.33, d: 0.2, t: 750 },
      { f: 659.25, d: 0.2, t: 950 },
      { f: 783.99, d: 0.6, t: 1150 },
      { f: 1046.5, d: 0.8, t: 1550 }
    ];
    melody.forEach((n) => {
      setTimeout(() => this.playTone(n.f, n.d), n.t);
    });
  }

  /**
   * Book Page Turn / UI Paper Sound
   */
  public playPageTurn() {
    if (!this.soundEnabled) return;
    this.initCtx();
    this.playNoiseSwoosh(0.08, 1600);
  }

  /**
   * Teleportation Gateway Portal Sound
   */
  public playTeleport() {
    if (!this.soundEnabled) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.5);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.65);
  }

  /**
   * Gold Coin Jingling Sound
   */
  public playCoin() {
    if (!this.soundEnabled) return;
    this.initCtx();
    this.playTone(987.77, 0.08);
    setTimeout(() => this.playTone(1318.5, 0.12), 40);
  }
}

export const audio = new AudioManager();
