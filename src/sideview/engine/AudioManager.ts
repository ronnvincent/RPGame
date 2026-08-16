/**
 * Procedural Web Audio API Sound Generator for RPGJS Side-View Game
 * Zero external audio assets required - Instant, responsive, high-impact sound synthesis.
 */

class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  public soundEnabled: boolean = true;
  public musicEnabled: boolean = true;
  private currentBgmAudio: HTMLAudioElement | null = null;
  private currentBgmSrc: string = '';
  private bgmVolume: number = 0.35;
  private sfxPool: { [src: string]: HTMLAudioElement[] } = {};

  constructor() {
    // Initialized lazily on first user gesture
  }

  private initCtx() {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.35, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /**
   * Play background music track with looping and crossfading
   */
  public playBGM(src: string, volume: number = 0.35) {
    this.bgmVolume = volume;
    if (!this.musicEnabled) {
      this.currentBgmSrc = src;
      return;
    }
    if (this.currentBgmSrc === src && this.currentBgmAudio && !this.currentBgmAudio.paused) {
      return;
    }

    if (this.currentBgmAudio) {
      try {
        this.currentBgmAudio.pause();
        this.currentBgmAudio = null;
      } catch (e) {}
    }

    try {
      this.currentBgmSrc = src;
      const audio = new Audio(src);
      audio.loop = true;
      audio.volume = this.bgmVolume;
      audio.play().catch(() => {
        // Autoplay may wait for user tap
      });
      this.currentBgmAudio = audio;
    } catch (e) {
      console.warn('BGM play error:', e);
    }
  }

  /**
   * Town Peaceful Medieval Hub BGM
   */
  public playTownBGM() {
    this.playBGM('/assets/audio/music/town_theme.mp3', 0.3);
  }

  /**
   * Action Dungeon & Battlefield BGM
   */
  public playDungeonBGM(theme?: string) {
    if (theme === 'mountain') {
      this.playBGM('/assets/audio/music/mountain_theme.ogg', 0.35);
    } else {
      this.playBGM('/assets/audio/music/dungeon_battle.mp3', 0.35);
    }
  }

  public stopBGM() {
    if (this.currentBgmAudio) {
      try {
        this.currentBgmAudio.pause();
        this.currentBgmAudio.currentTime = 0;
      } catch (e) {}
      this.currentBgmAudio = null;
    }
  }

  public toggleMusic(): boolean {
    this.musicEnabled = !this.musicEnabled;
    if (!this.musicEnabled) {
      this.stopBGM();
    } else if (this.currentBgmSrc) {
      this.playBGM(this.currentBgmSrc, this.bgmVolume);
    }
    return this.musicEnabled;
  }

  public toggleSound(): boolean {
    this.soundEnabled = !this.soundEnabled;
    return this.soundEnabled;
  }

  /**
   * Play asset sound effect from file
   */
  public playSFX(src: string, volume: number = 0.4) {
    if (!this.soundEnabled) return;
    try {
      if (!this.sfxPool[src]) {
        this.sfxPool[src] = [];
      }
      let audio = this.sfxPool[src].find(a => a.paused || a.ended);
      if (!audio) {
        audio = new Audio(src);
        if (this.sfxPool[src].length < 8) {
          this.sfxPool[src].push(audio);
        }
      }
      audio.currentTime = 0;
      audio.volume = volume;
      audio.play().catch(() => {});
    } catch (e) {}
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
    const duration = type === 'heavy' ? 0.4 : 0.2;

    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(type === 'heavy' ? 120 : 80, now);
    subOsc.frequency.exponentialRampToValueAtTime(20, now + duration);
    subGain.gain.setValueAtTime(type === 'heavy' ? 1.0 : 0.5, now);
    subGain.gain.exponentialRampToValueAtTime(0.01, now + duration);
    subOsc.connect(subGain).connect(this.masterGain);
    subOsc.start(now); subOsc.stop(now + duration);

    const coreOsc = this.ctx.createOscillator();
    const coreGain = this.ctx.createGain();
    const shaper = this.ctx.createWaveShaper();
    
    const curve = new Float32Array(44100);
    const k = type === 'heavy' ? 400 : 50; 
    for (let i = 0; i < 44100; ++i) {
      const x = (i * 2) / 44100 - 1;
      curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
    }
    shaper.curve = curve;
    shaper.oversample = '4x';

    coreOsc.type = type === 'heavy' ? 'sawtooth' : type === 'spear' ? 'square' : 'triangle';
    const startFreq = type === 'dagger' ? 1200 : type === 'spear' ? 600 : type === 'heavy' ? 300 : 800;
    coreOsc.frequency.setValueAtTime(startFreq * amp, now);
    coreOsc.frequency.exponentialRampToValueAtTime(startFreq * 0.1, now + duration * 0.8);

    coreGain.gain.setValueAtTime(type === 'heavy' ? 0.45 : 0.35, now);
    coreGain.gain.exponentialRampToValueAtTime(0.01, now + duration);

    coreOsc.connect(shaper).connect(coreGain).connect(this.masterGain);
    coreOsc.start(now); coreOsc.stop(now + duration);

    this.playNoiseSwoosh(0.15 * amp, type === 'heavy' ? 800 : type === 'spear' ? 1600 : 2000);
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
    const duration = type === 'holy' ? 0.8 : 0.5;

    const modOsc = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();
    const carrierOsc = this.ctx.createOscillator();
    const carrierGain = this.ctx.createGain();

    if (type === 'fire') {
      modOsc.type = 'sawtooth'; carrierOsc.type = 'sine';
      modOsc.frequency.value = 50 * amp; modGain.gain.value = 300; 
      carrierOsc.frequency.setValueAtTime(150 * amp, now);
      carrierOsc.frequency.exponentialRampToValueAtTime(600 * amp, now + 0.2);
      carrierOsc.frequency.exponentialRampToValueAtTime(50, now + duration);
      this.playNoiseSwoosh(0.3 * amp, 300 * amp);
    } else if (type === 'ice') {
      modOsc.type = 'sine'; carrierOsc.type = 'triangle';
      modOsc.frequency.value = 800 * amp; modGain.gain.value = 500;
      carrierOsc.frequency.setValueAtTime(1200 * amp, now);
      carrierOsc.frequency.exponentialRampToValueAtTime(200, now + duration);
    } else if (type === 'lightning') {
      modOsc.type = 'square'; carrierOsc.type = 'sawtooth';
      modOsc.frequency.value = 200 * amp; modGain.gain.value = 1000;
      carrierOsc.frequency.setValueAtTime(200 * amp, now);
      carrierOsc.frequency.linearRampToValueAtTime(1200 * amp, now + 0.1);
      carrierOsc.frequency.exponentialRampToValueAtTime(50, now + duration);
      this.playNoiseSwoosh(0.25 * amp, 2000);
    } else if (type === 'holy') {
      modOsc.type = 'sine'; carrierOsc.type = 'sine';
      modOsc.frequency.value = 4 * amp; modGain.gain.value = 20; 
      carrierOsc.frequency.setValueAtTime(440 * amp, now);
      carrierOsc.frequency.linearRampToValueAtTime(659.25 * amp, now + 0.2);
      carrierOsc.frequency.linearRampToValueAtTime(880 * amp, now + duration);
    } else { // dark
      modOsc.type = 'sawtooth'; carrierOsc.type = 'square';
      modOsc.frequency.value = 10 * amp; modGain.gain.value = 200; 
      carrierOsc.frequency.setValueAtTime(100 * amp, now);
      carrierOsc.frequency.exponentialRampToValueAtTime(30, now + duration);
    }

    modOsc.connect(modGain);
    modGain.connect(carrierOsc.frequency); 

    carrierGain.gain.setValueAtTime(0.5, now);
    carrierGain.gain.exponentialRampToValueAtTime(0.01, now + duration);

    carrierOsc.connect(carrierGain).connect(this.masterGain);
    
    modOsc.start(now); modOsc.stop(now + duration);
    carrierOsc.start(now); carrierOsc.stop(now + duration);
  }

  /**
   * Hit Impact SFX
   */
  public playHit(isCrit: boolean = false) {
    if (!this.soundEnabled) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    
    const punchOsc = this.ctx.createOscillator();
    const punchGain = this.ctx.createGain();
    punchOsc.type = 'square';
    punchOsc.frequency.setValueAtTime(isCrit ? 800 : 400, now);
    punchOsc.frequency.exponentialRampToValueAtTime(50, now + 0.05); 
    punchGain.gain.setValueAtTime(isCrit ? 0.8 : 0.5, now);
    punchGain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
    punchOsc.connect(punchGain).connect(this.masterGain);
    punchOsc.start(now); punchOsc.stop(now + 0.05);

    const bodyOsc = this.ctx.createOscillator();
    const bodyGain = this.ctx.createGain();
    bodyOsc.type = isCrit ? 'sawtooth' : 'sine';
    bodyOsc.frequency.setValueAtTime(isCrit ? 200 : 120, now);
    bodyOsc.frequency.exponentialRampToValueAtTime(20, now + 0.2);
    bodyGain.gain.setValueAtTime(isCrit ? 0.7 : 0.4, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    bodyOsc.connect(bodyGain).connect(this.masterGain);
    bodyOsc.start(now); bodyOsc.stop(now + 0.2);

    if (isCrit) {
      this.playChime(1200, 0.2);
      this.playNoiseSwoosh(0.15, 1000);
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

  public playTone(freq: number, duration: number = 0.12, volume: number = 0.12) {
    if (!this.soundEnabled) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;
    if (!Number.isFinite(freq) || freq <= 0) return;

    try {
      const now = this.ctx.currentTime;
      const safeFreq = Math.max(80, Math.min(2400, Math.abs(freq)));
      const safeDuration = Math.max(0.03, Math.max(0.01, duration));
      const safeVolume = Math.max(0.01, Math.min(0.32, volume));

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(safeFreq, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(60, safeFreq * 0.35), now + safeDuration);

      gain.gain.setValueAtTime(safeVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + safeDuration);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + safeDuration);
    } catch (e) {}
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
