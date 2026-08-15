/**
 * Main Side-View Action RPG Game Controller
 * Manages canvas rendering loop, input handling, Town Hub, Dungeons, Quests, Dialogues, and Cutscenes.
 */

import { CharacterClass } from './classes/ClassDefinitions';
import { SideViewEngine } from './engine/SideViewEngine';
import { CharacterSelectUI } from './ui/CharacterSelectUI';
import { GameHUD } from './ui/GameHUD';
import { DUNGEONS, DungeonDefinition, spawnWaveEnemies } from './dungeons/DungeonManager';
import { audio } from './engine/AudioManager';
import { sprites } from './engine/SpriteManager';
import { TownHub } from './town/TownHub';
import { DialogueSystem } from './dialogue/DialogueSystem';
import { WorldMapUI } from './ui/WorldMapUI';
import { quests } from './quests/QuestManager';

export class SideViewGame {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private engine: SideViewEngine | null = null;
  private hud: GameHUD | null = null;
  private townHub: TownHub | null = null;
  private dialogue: DialogueSystem | null = null;
  private worldMap: WorldMapUI | null = null;
  private currentDungeonIndex: number = 0;
  private currentWaveIndex: number = 0;
  private lastTime: number = 0;
  private isRunning: boolean = false;
  private keysPressed: { [key: string]: boolean } = {};
  public touchMoveDir: number = 0;

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
    this.container.style.position = 'fixed';
    this.container.style.inset = '0';
    this.container.style.width = '100vw';
    this.container.style.height = '100dvh';
    this.container.style.overflow = 'hidden';
    this.container.style.touchAction = 'none';
    this.container.appendChild(this.canvas);

    // Completely prevent browser pull-down refresh and bounce scrolling
    this.container.addEventListener('touchmove', (e) => {
      // Allow scrolling only inside scrollable modal bodies
      const target = e.target as HTMLElement;
      if (!target.closest('.dialogue-box-frame, .inventory-modal, .world-map-modal, .quest-log-modal')) {
        e.preventDefault();
      }
    }, { passive: false });

    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => this.handleResize());
    }

    // Show Character Selection Screen
    new CharacterSelectUI(this.container, (selectedClass) => {
      this.startGame(selectedClass);
    });
  }

  private handleResize() {
    const width = window.visualViewport ? window.visualViewport.width : window.innerWidth;
    const height = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    this.canvas.width = Math.floor(width);
    this.canvas.height = Math.floor(height);

    if (this.engine) {
      this.engine.canvasWidth = this.canvas.width;
      this.engine.canvasHeight = this.canvas.height;
      this.engine.groundY = Math.floor(height - Math.min(100, Math.max(75, height * 0.16)));
      this.engine.arenaHeight = this.canvas.height;
    }
  }

  public startGame(selectedClass: CharacterClass) {
    this.engine = new SideViewEngine(selectedClass);
    this.engine.groundY = this.canvas.height - 90;
    this.engine.arenaHeight = this.canvas.height;

    this.townHub = new TownHub();
    this.engine.townHub = this.townHub;

    this.dialogue = new DialogueSystem(this.container);
    this.worldMap = new WorldMapUI(this.container, (locationId) => {
      this.onSelectLocation(locationId);
    });

    this.hud = new GameHUD(this.container, this.engine, this);
    this.hud.worldMapUI = this.worldMap;

    this.setupInputListeners();

    // Start with Epic Story Prologue Cutscene
    this.dialogue.playPrologue(() => {
      this.loadTownHub();
    });

    this.isRunning = true;
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.gameLoop(t));
  }

  public loadTownHub() {
    if (!this.engine) return;
    this.engine.isTownMode = true;
    this.engine.enemies = [];
    this.engine.player.x = 450;
    this.engine.player.y = this.engine.groundY;
    this.engine.player.vx = 0;
    this.engine.player.vy = 0;
    this.engine.setBattleTheme('catacombs');
    audio.playTownBGM();
    this.hud?.showToast('🏰 Arrived at Haven of Eldermoor');
  }

  public onSelectLocation(locationId: string) {
    if (locationId === 'town_eldermoor') {
      this.loadTownHub();
      return;
    }

    const dungeonIdx = DUNGEONS.findIndex(d => d.id === locationId);
    if (dungeonIdx !== -1) {
      this.loadDungeon(dungeonIdx);
    }
  }

  public loadDungeon(dungeonIndex: number) {
    if (!this.engine) return;
    this.engine.isTownMode = false;
    this.engine.player.x = 300;
    this.engine.player.y = this.engine.groundY;
    this.engine.player.vx = 0;
    this.engine.player.vy = 0;

    this.currentDungeonIndex = dungeonIndex % DUNGEONS.length;
    const dungeon = DUNGEONS[this.currentDungeonIndex];
    if (dungeon) {
      this.engine.setBattleTheme(dungeon.theme);
      audio.playDungeonBGM(dungeon.theme);
    }
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

    const bossEnemy = enemies.find(e => e.type === 'boss');
    if (bossEnemy) {
      this.dialogue?.showBossBanner(bossEnemy.name, dungeon.subtitle);
    }

    this.hud?.setWaveInfo(`${dungeon.name} - Wave ${this.currentWaveIndex + 1}/${dungeon.waves.length}`, enemies.length);
    this.engine.particles.addImpactBurst(this.engine.player.x, this.engine.groundY, 12, dungeon.ambientParticles, 'spark');
  }

  private onDungeonCleared() {
    if (!this.engine) return;
    const dungeon = DUNGEONS[this.currentDungeonIndex];
    audio.playFanfare();
    this.engine.particles.addHolyPillar(this.engine.player.x, this.engine.player.y);
    this.engine.particles.addFloatingText(this.engine.player.x, this.engine.player.y - 60, '🏆 DUNGEON CLEARED! 🏆', '#ffd700', true, 28);

    // If final Void Nexus dungeon cleared
    if (dungeon.id === 'void_nexus') {
      this.dialogue?.showDialogue({
        speakerName: 'Elder Justinian',
        speakerTitle: 'Sage of Aethelgard',
        portraitIcon: '🧙‍♂️',
        sentences: [
          "Elder Justinian: 🌟 THE VOID OVERLORD HAS FALLEN! 🌟",
          "Elder Justinian: The Five Primordial Runes are reunited in radiance! Peace returns to Aethelgard!",
          "Elder Justinian: You have proven yourself as the True Champion of the Realm!"
        ],
        options: [
          {
            label: 'Return to Town Sanctuary',
            icon: '🏰',
            type: 'custom',
            onSelect: () => this.loadTownHub()
          },
          {
            label: 'Enter Endless Celestial Arena',
            icon: '⭐',
            type: 'custom',
            onSelect: () => this.onSelectLocation('endless_arena')
          }
        ]
      });
      return;
    }

    setTimeout(() => {
      this.dialogue?.showDialogue({
        speakerName: 'Victory Portal',
        speakerTitle: 'Realm Gateway',
        portraitIcon: '🌀',
        sentences: [
          `You have successfully cleansed ${dungeon.name}!`,
          "Would you like to return to Eldermoor Town to turn in quests, or advance to the next realm?"
        ],
        options: [
          {
            label: 'Return to Town Hub [T]',
            icon: '🏰',
            type: 'custom',
            onSelect: () => this.loadTownHub()
          },
          {
            label: 'Advance to Next Dungeon ➔',
            icon: '⚔️',
            type: 'custom',
            onSelect: () => this.loadDungeon(this.currentDungeonIndex + 1)
          }
        ]
      });
    }, 2800);
  }

  public interactWithActiveNpc() {
    if (!this.engine || !this.townHub || !this.dialogue || !this.engine.isTownMode) return;
    const activeNpc = this.townHub.getActiveNpc();
    if (activeNpc) {
      this.townHub.interactWithNpc(activeNpc, this.engine, this.dialogue, () => {
        this.worldMap?.open();
      });
    }
  }

  private setupInputListeners() {
    window.addEventListener('keydown', (e) => {
      this.keysPressed[e.code] = true;

      if (!this.engine) return;

      // Dialogue advance or close with Space / Enter
      if (this.dialogue?.isOpen) {
        if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') {
          this.dialogue.advanceText();
          return;
        }
      }

      // NPC Interaction: KeyE
      if (e.code === 'KeyE') {
        this.interactWithActiveNpc();
      }

      // Quest Log toggle: KeyJ
      if (e.code === 'KeyJ') {
        this.hud?.questLogUI?.toggle();
      }

      // World Map toggle: KeyM
      if (e.code === 'KeyM') {
        this.worldMap?.open();
      }

      // Return to Town: KeyT
      if (e.code === 'KeyT') {
        audio.playTeleport();
        this.loadTownHub();
      }

      // Jump / Drop-Through: W, Space, ArrowUp
      if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') {
        const isHoldingDown = Boolean(this.keysPressed['KeyS'] || this.keysPressed['ArrowDown']);
        this.engine.jumpPlayer(isHoldingDown);
      }

      // Dash: ShiftLeft, ShiftRight, KeyC
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyC') {
        this.engine.dashPlayer();
      }

      // Skills: 1-6 or Q, E, R, F, Z, X
      if (e.code === 'Digit1' || e.code === 'KeyQ') this.engine.castSkill(0);
      if (e.code === 'Digit2') this.engine.castSkill(1);
      if (e.code === 'Digit3' || e.code === 'KeyR') this.engine.castSkill(2);
      if (e.code === 'Digit4' || e.code === 'KeyF') this.engine.castSkill(3);
      if (e.code === 'Digit5' || e.code === 'KeyZ') this.engine.castSkill(4);
      if (e.code === 'Digit6' || e.code === 'KeyX') this.engine.castSkill(5);
    });

    window.addEventListener('keyup', (e) => {
      this.keysPressed[e.code] = false;
    });

    // Mouse Left Click for Primary Skill or Dialogue Advance
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        if (this.dialogue?.isOpen) {
          this.dialogue.advanceText();
        } else if (this.engine && !this.engine.isTownMode) {
          this.engine.castSkill(0);
        }
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

        // In Town Mode: update NPC proximity + Portal auto-detection
        if (this.engine.isTownMode && this.townHub) {
          this.townHub.update(this.engine.player.x, this.engine.player.y);

          // --- Portal Proximity Auto-Detection ---
          const portalDist = Math.abs(this.engine.player.x - this.engine.portalX);
          const wasNear = this.engine.isPlayerNearPortal;
          this.engine.isPlayerNearPortal = portalDist < 100;

          // Auto-open WorldMap when player enters portal zone
          if (this.engine.isPlayerNearPortal && !wasNear && !this.dialogue?.isOpen) {
            this.worldMap?.open();
          }
          // Auto-close WorldMap when player leaves portal zone
          if (!this.engine.isPlayerNearPortal && wasNear) {
            this.worldMap?.close();
          }
        }

        // In Dungeon Mode: check wave progression
        if (!this.engine.isTownMode) {
          const livingEnemies = this.engine.enemies.filter(e => !e.isDead);
          const dungeon = DUNGEONS[this.currentDungeonIndex];
          this.hud?.setWaveInfo(`${dungeon.name} - Wave ${this.currentWaveIndex + 1}/${dungeon.waves.length}`, livingEnemies.length);

          if (livingEnemies.length === 0 && this.engine.enemies.length > 0) {
            this.currentWaveIndex++;
            this.spawnNextWave();
          }
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
