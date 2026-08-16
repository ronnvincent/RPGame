/**
 * High-Performance Web Audio API Sound Manager
 * Uses AudioBuffers for ZERO-LAG sound effects and DynamicsCompressor for safe volumes.
 */

class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  
  public soundEnabled: boolean = true;
  public musicEnabled: boolean = true;
  
  private currentBgmAudio: HTMLAudioElement | null = null;
  private currentBgmSrc: string = '';
  private bgmVolume: number = 0.25; // Lowered from 0.35
  
  private audioBuffers: { [src: string]: AudioBuffer } = {};
  private pendingFetches: { [src: string]: Promise<AudioBuffer> } = {};

  constructor() {}

  private initCtx() {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();
      
      // Master Gain for Volume
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.5, this.ctx.currentTime);
      
      // Compressor to prevent ear-piercing loud overlapping sounds (OA sounds)
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-24, this.ctx.currentTime);
      this.compressor.knee.setValueAtTime(30, this.ctx.currentTime);
      this.compressor.ratio.setValueAtTime(12, this.ctx.currentTime);
      this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
      this.compressor.release.setValueAtTime(0.25, this.ctx.currentTime);

      this.masterGain.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private async getAudioBuffer(src: string): Promise<AudioBuffer | null> {
    this.initCtx();
    if (!this.ctx) return null;
    
    if (this.audioBuffers[src]) {
      return this.audioBuffers[src];
    }
    
    if (!this.pendingFetches[src]) {
      this.pendingFetches[src] = fetch(src)
        .then(response => response.arrayBuffer())
        .then(arrayBuffer => this.ctx!.decodeAudioData(arrayBuffer))
        .then(buffer => {
          this.audioBuffers[src] = buffer;
          return buffer;
        })
        .catch(err => {
          console.warn('Failed to load audio:', src, err);
          throw err;
        });
    }
    return this.pendingFetches[src];
  }

  public playBGM(src: string, volume: number = 0.2) {
    this.bgmVolume = volume;
    if (!this.musicEnabled) {
      this.currentBgmSrc = src;
      return;
    }
    if (this.currentBgmSrc === src && this.currentBgmAudio && !this.currentBgmAudio.paused) return;

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
      audio.play().catch(() => {});
      this.currentBgmAudio = audio;
    } catch (e) {}
  }

  public playTownBGM() {
    this.playBGM('/assets/audio/music/town_theme.mp3', 0.2);
  }

  public playDungeonBGM(theme?: string) {
    if (theme === 'mountain') {
      this.playBGM('/assets/audio/music/mountain_theme.ogg', 0.25);
    } else {
      this.playBGM('/assets/audio/music/dungeon_battle.mp3', 0.25);
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
    if (!this.musicEnabled) this.stopBGM();
    else if (this.currentBgmSrc) this.playBGM(this.currentBgmSrc, this.bgmVolume);
    return this.musicEnabled;
  }

  public toggleSound(): boolean {
    this.soundEnabled = !this.soundEnabled;
    return this.soundEnabled;
  }

  /**
   * Fast, zero-lag Web Audio API playback
   */
  public async playSFX(src: string, volume: number = 0.2, pitchRate: number = 1.0, maxDuration?: number) {
    if (!this.soundEnabled) return;
    try {
      const buffer = await this.getAudioBuffer(src);
      if (!buffer || !this.ctx || !this.masterGain) return;

      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      
      // Randomize pitch slightly to prevent machine-gun ear fatigue
      source.playbackRate.value = pitchRate * (0.9 + Math.random() * 0.2);

      const gainNode = this.ctx.createGain();
      gainNode.gain.setValueAtTime(volume, this.ctx.currentTime);
      
      let playDuration = buffer.duration;
      if (maxDuration && maxDuration < buffer.duration) {
        playDuration = maxDuration;
      }
      
      // Quick fade out to prevent clicking sounds on stop
      gainNode.gain.setTargetAtTime(0, this.ctx.currentTime + playDuration - 0.05, 0.015);

      source.connect(gainNode);
      gainNode.connect(this.masterGain);
      
      source.start(0);
      source.stop(this.ctx.currentTime + playDuration);
    } catch (e) {}
  }

  // --- Adjusted SFX to be less "OA", much lower volume, and randomized pitches ---
  
  public playSlash(type: 'light' | 'heavy' | 'dagger' | 'spear' = 'light', tone = 1) {
    // Short maxDuration (0.2s) limits the trailing echo to stop extreme noise when spamming basic attacks
    if (type === 'heavy') this.playSFX('/assets/audio/sfx/RPG Sound Pack/battle/swing2.wav', 0.15, 0.9, 0.2);
    else if (type === 'spear') this.playSFX('/assets/audio/sfx/RPG Sound Pack/battle/swing3.wav', 0.12, 1.1, 0.2);
    else this.playSFX('/assets/audio/sfx/RPG Sound Pack/battle/swing.wav', 0.1, 1.0, 0.15);
  }

  public playMagic(type: 'fire' | 'ice' | 'lightning' | 'holy' | 'dark' = 'fire', tone = 1) {
    // Volume reduced and maxDuration capped
    if (type === 'fire') this.playSFX('/assets/audio/sfx/explode2.ogg', 0.15, 0.8, 0.35);
    else if (type === 'ice') this.playSFX('/assets/audio/sfx/freeze.ogg', 0.12, 1.0, 0.35);
    else if (type === 'lightning') this.playSFX('/assets/audio/sfx/zap.ogg', 0.1, 1.2, 0.3);
    else if (type === 'holy') this.playSFX('/assets/audio/sfx/blessing.ogg', 0.15, 1.0, 0.4);
    else this.playSFX('/assets/audio/sfx/curse.ogg', 0.15, 1.0, 0.4);
  }

  public playHit(isCrit: boolean = false) {
    // Cap hit sound to 0.25 seconds
    if (isCrit) {
      this.playSFX('/assets/audio/sfx/explode3.ogg', 0.12, 1.0, 0.25);
      this.playSFX('/assets/audio/sfx/RPG Sound Pack/battle/magic1.wav', 0.15, 1.0, 0.25);
    } else {
      this.playSFX('/assets/audio/sfx/RPG Sound Pack/battle/spell.wav', 0.1, 1.0, 0.2);
    }
  }

  public playJump() {
    this.playSFX('/assets/audio/sfx/wind2.ogg', 0.08);
  }

  public playDash() {
    this.playSFX('/assets/audio/sfx/wind.ogg', 0.1);
  }

  public playLoot(rarity: 'common' | 'rare' | 'epic' | 'legendary' = 'common') {
    if (rarity === 'legendary') this.playSFX('/assets/audio/sfx/interlude.ogg', 0.25);
    else if (rarity === 'epic') this.playSFX('/assets/audio/sfx/interlude2.ogg', 0.2);
    else this.playSFX('/assets/audio/sfx/magicdrop.ogg', 0.15);
  }

  public playVictory() {
    this.playSFX('/assets/audio/sfx/cheer-crowd.ogg', 0.3);
  }

  public playLevelUp() {
    this.playSFX('/assets/audio/sfx/interlude2a.ogg', 0.3);
  }

  public playClick() {
    this.playSFX('/assets/audio/sfx/RPG Sound Pack/inventory/cursor.wav', 0.3);
  }

  public playQuestAccept() {
    this.playSFX('/assets/audio/sfx/RPG Sound Pack/inventory/chainmail1.wav', 0.4);
  }
  
  public playError() {
    this.playSFX('/assets/audio/sfx/RPG Sound Pack/battle/sword-unsheathe.wav', 0.2, 0.5);
  }

  // --- Procedural Fallbacks for System Sounds ---
  
  public playChime() {
    this.playSFX('/assets/audio/sfx/magicdrop.ogg', 0.1);
  }

  public playNoiseSwoosh() {
    this.playSFX('/assets/audio/sfx/wind.ogg', 0.1);
  }

  public playDialogueBlip(char?: string | number) {
    this.playSFX('/assets/audio/sfx/click.ogg', 0.1);
  }

  public playPageTurn() {
    this.playSFX('/assets/audio/sfx/click.ogg', 0.1);
  }

  public playHeal() {
    this.playSFX('/assets/audio/sfx/magic.ogg', 0.2);
  }

  public playTone(duration?: number, freq?: number) {
    this.playSFX('/assets/audio/sfx/chime.ogg', 0.2);
  }

  public playBossRoar() {
    this.playSFX('/assets/audio/sfx/slash_heavy.ogg', 0.5);
  }

  public playQuestComplete() {
    this.playVictory();
  }

  public playFanfare() {
    this.playVictory();
  }

  public playTeleport() {
    this.playSFX('/assets/audio/sfx/magic.ogg', 0.2);
  }

  public playCoin() {
    this.playSFX('/assets/audio/sfx/loot.ogg', 0.2);
  }
}
export const audio = new AudioManager();
