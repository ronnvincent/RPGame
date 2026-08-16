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
    if (type === 'heavy') this.playSFX('/assets/audio/sfx/RPG Sound Pack/battle/swing2.wav', 0.6);
    else if (type === 'spear') this.playSFX('/assets/audio/sfx/RPG Sound Pack/battle/swing3.wav', 0.5);
    else this.playSFX('/assets/audio/sfx/RPG Sound Pack/battle/swing.wav', 0.5);
  }

  /**
   * Magic Cast / Spell SFX
   */
  public playMagic(type: 'fire' | 'ice' | 'lightning' | 'holy' | 'dark' = 'fire', tone = 1) {
    if (!this.soundEnabled) return;
    if (type === 'fire') this.playSFX('/assets/audio/sfx/explode2.ogg', 0.5);
    else if (type === 'ice') this.playSFX('/assets/audio/sfx/freeze.ogg', 0.5);
    else if (type === 'lightning') this.playSFX('/assets/audio/sfx/zap.ogg', 0.4);
    else if (type === 'holy') this.playSFX('/assets/audio/sfx/blessing.ogg', 0.6);
    else this.playSFX('/assets/audio/sfx/curse.ogg', 0.6);
  }

  /**
   * Hit Impact SFX
   */
  public playHit(isCrit: boolean = false) {
    if (!this.soundEnabled) return;
    if (isCrit) {
      this.playSFX('/assets/audio/sfx/explode3.ogg', 0.4);
      this.playSFX('/assets/audio/sfx/RPG Sound Pack/battle/magic1.wav', 0.6);
    } else {
      this.playSFX('/assets/audio/sfx/RPG Sound Pack/battle/spell.wav', 0.4);
    }
  }

  /**
   * Jump & Dash SFX
   */
  public playJump() {
    this.playSFX('/assets/audio/sfx/wind2.ogg', 0.2);
  }

  public playDash() {
    this.playSFX('/assets/audio/sfx/wind.ogg', 0.3);
  }

  /**
   * Loot & Item Pickup SFX
   */
  public playLoot(rarity: 'common' | 'rare' | 'epic' | 'legendary' = 'common') {
    if (!this.soundEnabled) return;
    if (rarity === 'legendary') this.playSFX('/assets/audio/sfx/interlude.ogg', 0.6);
    else if (rarity === 'epic') this.playSFX('/assets/audio/sfx/interlude2.ogg', 0.5);
    else this.playSFX('/assets/audio/sfx/magicdrop.ogg', 0.5);
  }

  /**
   * Victory Fanfare SFX
   */
  public playVictory() {
    this.playSFX('/assets/audio/sfx/cheer-crowd.ogg', 0.6);
  }

  /**
   * Level Up Fanfare SFX
   */
  public playLevelUp() {
    this.playSFX('/assets/audio/sfx/interlude2a.ogg', 0.7);
  }

  /**
   * Potion Drink / Heal SFX
   */
  public playHeal() {
    this.playSFX('/assets/audio/sfx/heal.ogg', 0.6);
  }

  /**
   * Boss Roar / Earthquake SFX
   */
  public playBossRoar() {
    this.playSFX('/assets/audio/sfx/explode1.ogg', 0.8);
    this.playSFX('/assets/audio/sfx/confusion.ogg', 0.8);
  }

  /**
   * UI Click / Select
   */
  public playClick() {
    this.playSFX('/assets/audio/sfx/zap10.ogg', 0.2);
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
