/**
 * Main Side-View Action RPG Game Controller
 * Manages canvas rendering loop, input handling, dungeons, waves, and victory screens.
 */

import { CharacterClass } from './classes/ClassDefinitions';
import { SideViewEngine } from './engine/SideViewEngine';
import { CharacterSelectUI } from './ui/CharacterSelectUI';
import { GameHUD } from './ui/GameHUD';
import { DUNGEONS, DungeonDefinition, spawnWaveEnemies } from './dungeons/DungeonManager';
import { audio } from './engine/AudioManager';
import { sprites } from './engine/SpriteManager';

export class SideViewGame {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private engine: SideViewEngine | null = null;
  private hud: GameHUD | null = null;
  private currentDungeonIndex: number = 0;
  private currentWaveIndex: number = 0;
  private lastTime: number = 0;
  private isRunning: boolean = false;
  private keysPressed: { [key: string]: boolean } = {};

  constructor(rootElement: HTMLElement) {
    this.container = rootElement;
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'sideview-game-canvas';
    this.canvas.width = 960;
    this.canvas.height = 540;
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.background = '#09090b';

    this.ctx = this.canvas.getContext('2d')!;
    this.container.style.position = 'relative';
    this.container.style.width = '100vw';
    this.container.style.height = '100vh';
    this.container.style.overflow = 'hidden';
    this.container.appendChild(this.canvas);

    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());

    // Show Character Selection Screen
    new CharacterSelectUI(this.container, (selectedClass) => {
      this.startGame(selectedClass);
    });
  }

  private handleResize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    if (this.engine) {
      this.engine.groundY = window.innerHeight - 90;
      this.engine.arenaHeight = window.innerHeight;
    }
  }

  public startGame(selectedClass: CharacterClass) {
    this.engine = new SideViewEngine(selectedClass);
    this.engine.groundY = this.canvas.height - 90;
    this.engine.arenaHeight = this.canvas.height;

    this.hud = new GameHUD(this.container, this.engine, this);
    this.setupInputListeners();

    // Start First Dungeon
    this.loadDungeon(0);

    this.isRunning = true;
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.gameLoop(t));
  }

  private loadDungeon(dungeonIndex: number) {
    this.currentDungeonIndex = dungeonIndex % DUNGEONS.length;
    this.currentWaveIndex = 0;
    this.spawnNextWave();
  }

  private spawnNextWave() {
    if (!this.engine) return;
    const dungeon = DUNGEONS[this.currentDungeonIndex];
    if (this.currentWaveIndex >= dungeon.waves.length) {
      // Dungeon Cleared!
      this.onDungeonCleared();
      return;
    }

    this.engine.setBattleTheme(dungeon.theme);
    const enemies = spawnWaveEnemies(
      dungeon,
      this.currentWaveIndex,
      this.engine.arenaWidth,
      this.engine.player.x
    );
    this.engine.enemies = enemies;
    audio.playSlash('heavy');
    this.hud?.setWaveInfo(`${dungeon.name} - Wave ${this.currentWaveIndex + 1}/${dungeon.waves.length}`, enemies.length);
    this.engine.particles.addImpactBurst(this.engine.player.x, this.engine.groundY, 12, dungeon.ambientParticles, 'spark');
  }

  private onDungeonCleared() {
    audio.playHeal();
    this.engine?.particles.addHolyPillar(this.engine.player.x, this.engine.player.y);
    this.engine?.particles.addFloatingText(this.engine.player.x, this.engine.player.y - 60, '🏆 DUNGEON CLEARED! 🏆', '#ffd700', true, 28);

    setTimeout(() => {
      // Advance to next dungeon
      this.loadDungeon(this.currentDungeonIndex + 1);
    }, 3500);
  }

  public touchMoveDir: number = 0;

  private setupInputListeners() {
    window.addEventListener('keydown', (e) => {
      this.keysPressed[e.code] = true;

      if (!this.engine) return;

      // Jump: W, Space, ArrowUp
      if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') {
        this.engine.jumpPlayer();
      }

      // Dash: ShiftLeft, ShiftRight, KeyC
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyC') {
        this.engine.dashPlayer();
      }

      // Skills: 1-6 or Q, E, R, F, Z, X
      if (e.code === 'Digit1' || e.code === 'KeyQ') this.engine.castSkill(0);
      if (e.code === 'Digit2' || e.code === 'KeyE') this.engine.castSkill(1);
      if (e.code === 'Digit3' || e.code === 'KeyR') this.engine.castSkill(2);
      if (e.code === 'Digit4' || e.code === 'KeyF') this.engine.castSkill(3);
      if (e.code === 'Digit5' || e.code === 'KeyZ') this.engine.castSkill(4);
      if (e.code === 'Digit6' || e.code === 'KeyX') this.engine.castSkill(5);
    });

    window.addEventListener('keyup', (e) => {
      this.keysPressed[e.code] = false;
    });

    // Mouse Left Click for Primary Skill on canvas
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.engine) {
        this.engine.castSkill(0);
      }
    });
  }

  private processContinuousInput() {
    if (!this.engine) return;
    let dir = this.touchMoveDir;
    if (this.keysPressed['KeyA'] || this.keysPressed['ArrowLeft']) dir -= 1;
    if (this.keysPressed['KeyD'] || this.keysPressed['ArrowRight']) dir += 1;
    this.engine.movePlayer(Math.max(-1, Math.min(1, dir)));
  }

  private gameLoop(timestamp: number) {
    if (!this.isRunning) return;

    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.1);
    this.lastTime = timestamp;

    try {
      this.processContinuousInput();

      if (this.engine) {
        this.engine.update(dt);

        // Check wave progression
        const livingEnemies = this.engine.enemies.filter(e => !e.isDead);
        const dungeon = DUNGEONS[this.currentDungeonIndex];
        this.hud?.setWaveInfo(`${dungeon.name} - Wave ${this.currentWaveIndex + 1}/${dungeon.waves.length}`, livingEnemies.length);

        if (livingEnemies.length === 0 && this.engine.enemies.length > 0) {
          this.currentWaveIndex++;
          this.spawnNextWave();
        }

        this.hud?.update();
      }

      // Render Canvas
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      if (this.engine) {
        this.engine.render(this.ctx, this.canvas.width, this.canvas.height);
      }
    } catch (err) {
      console.error('GameLoop Error:', err);
    }

    requestAnimationFrame((t) => this.gameLoop(t));
  }
}

