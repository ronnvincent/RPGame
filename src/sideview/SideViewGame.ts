/**
 * Main Side-View Action RPG Game Controller
 * Manages canvas rendering loop, input handling, Town Hub, Dungeons, Quests, Dialogues, and Cutscenes.
 */

import { CharacterClass, CHARACTER_CLASSES } from './classes/ClassDefinitions';
import { SaveManager } from './engine/SaveManager';
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
      if (!target.closest('.dialogue-box-frame, .inventory-modal, .world-map-modal, .quest-log-modal, .details-area')) {
        e.preventDefault();
      }
    }, { passive: false });

    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => this.handleResize());
    }

    this.loadOrStart();
  }

  private async loadOrStart() {
    const saveData = await SaveManager.loadGame();
    if (saveData && saveData.playerState && saveData.playerState.characterClass) {
      const savedClassId = saveData.playerState.characterClass.id;
      const fullClass = CHARACTER_CLASSES.find(c => c.id === savedClassId) || CHARACTER_CLASSES[0];
      this.startGame(fullClass, saveData);
    } else {
      // Show Character Selection Screen
      new CharacterSelectUI(this.container, (selectedClass) => {
        this.startGame(selectedClass, null);
      });
    }
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

  public startGame(selectedClass: CharacterClass, saveData: any = null) {
    this.engine = new SideViewEngine(selectedClass);
    this.engine.groundY = this.canvas.height - 90;
    
    if (saveData) {
      this.engine.loadSaveData(saveData);
    } else {
      // Auto-save initial character creation
      SaveManager.saveGame(this.engine.player, this.engine.player.inventory, this.engine.player.maxDungeonCleared);
    }
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
    
    // Setup Multiplayer Sync Listeners
    import('./network/NetworkManager').then(mod => {
      mod.network.listenForPlayerSkill((socketId, skillIndex, classId, x, y, facing, isTownMode, skillDamage) => {
        if (typeof localStorage !== 'undefined' && localStorage.getItem('rpg_debug_multiplayer') === '1') {
          console.log('[NET] Received remote_player_skill:', { socketId, skillIndex, classId, x, y, facing, isTownMode, skillDamage });
        }
        if (!this.engine) return;

        const remoteP = mod.network.remotePlayers[socketId] || {
          name: 'Player',
          x: 0,
          y: 0,
          facing: 1,
          isGrounded: true,
          isAttacking: true,
          animState: 'attack',
          isTownMode
        };

        remoteP.classId = classId;
        remoteP.x = x;
        remoteP.y = y;
        remoteP.facing = facing;
        remoteP.isGrounded = true;
        remoteP.isAttacking = true;
        remoteP.animState = 'attack';
        remoteP.isTownMode = isTownMode;

        mod.network.remotePlayers[socketId] = remoteP;

        this.engine.castRemoteSkill(classId, skillIndex, x, y + this.engine.groundY, facing, socketId, skillDamage);
      });

      mod.network.listenForPartyReturnTown((returnData) => {
        console.log('[NET] Received party_return_town:', returnData);
        this.dialogue?.close();
        if (this.engine && returnData?.socketId && returnData.socketId !== 'unknown') {
          const isSelfReturn = returnData.socketId === mod.network.socket?.id;
          if (!isSelfReturn) {
            const remoteP = mod.network.remotePlayers[returnData.socketId];
            if (remoteP) {
              remoteP.classId = returnData.classId || remoteP.classId || this.engine.player.characterClass.id;
              remoteP.name = returnData.name || remoteP.name;
              remoteP.x = typeof returnData.x === 'number' ? returnData.x : remoteP.x;
              remoteP.y = typeof returnData.y === 'number' ? returnData.y : remoteP.y;
              remoteP.facing = returnData.facing || remoteP.facing;
              remoteP.animState = returnData.animState || remoteP.animState;
              remoteP.isTownMode = typeof returnData.isTownMode === 'boolean' ? returnData.isTownMode : true;
              remoteP.isAttacking = false;
              remoteP.isGrounded = true;
            } else {
              mod.network.remotePlayers[returnData.socketId] = {
                classId: returnData.classId || this.engine.player.characterClass.id,
                name: returnData.name || 'Player',
                x: typeof returnData.x === 'number' ? returnData.x : this.engine.player.x,
                y: typeof returnData.y === 'number' ? returnData.y : 0,
                facing: returnData.facing || this.engine.player.facing,
                isGrounded: true,
                isAttacking: false,
                animState: returnData.animState || 'idle',
                isTownMode: typeof returnData.isTownMode === 'boolean' ? returnData.isTownMode : true
              };
            }
          }
        }
        this.loadTownHub(false);
      });

      mod.network.listenForPartyNextDungeon((data) => {
        console.log('[NET] Received party_next_dungeon from host:', data);
        this.dialogue?.close();
        this.loadDungeon(data.dungeonIndex, false);
      });

      mod.network.listenForWaveSync((data) => {
        if (!this.engine || this.engine.isHost) return;
        this.currentWaveIndex = data.waveIndex;
        if (data.cleared) {
          this.onDungeonCleared();
        } else {
          // Update HUD with new wave info
          const dungeon = DUNGEONS[this.currentDungeonIndex];
          if (dungeon) {
            this.hud?.setWaveInfo(`${dungeon.name} - Wave ${this.currentWaveIndex + 1}/${dungeon.waves.length}`, 0);
            audio.playSlash('heavy');
            this.engine.particles.addImpactBurst(this.engine.player.x, this.engine.groundY, 12, dungeon.ambientParticles, 'spark');
          }
        }
      });
      
      mod.network.listenForEnemyDied((enemyData) => {
        if (!this.engine || this.engine.isHost) return;
        // Mock an enemy instance to trigger the defeat logic
        const fakeEnemy: any = {
          name: enemyData.name,
          type: enemyData.type,
          x: enemyData.x,
          y: enemyData.y + this.engine.groundY,
          drops: enemyData.drops,
          isDead: false,
          hp: 0
        };
        this.engine.onEnemyDefeated(fakeEnemy);
      });

      mod.network.listenForEnemySync((enemies, waveIndex) => {
        if (!this.engine || this.engine.isHost) return;
        
        // Ensure client is in dungeon mode
        if (this.engine.isTownMode) {
          this.engine.isTownMode = false;
        }

        // Sync wave index from host
        if (waveIndex !== undefined) {
          this.currentWaveIndex = waveIndex;
          this.engine.currentWaveIndex = waveIndex;
        }
        
        // Fully sync enemies from host
        // Denormalize Y coordinates
        const denormalized = (enemies || []).map((e: any) => ({ ...e, y: e.y + this.engine!.groundY }));
        this.engine.enemies = denormalized as any;

        const dungeon = DUNGEONS[this.currentDungeonIndex];
        if (dungeon) {
          const livingCount = this.engine.enemies.filter(e => !e.isDead).length;
          this.hud?.setWaveInfo(`${dungeon.name} - Wave ${this.currentWaveIndex + 1}/${dungeon.waves.length}`, livingCount);
        }
      });
      
      mod.network.listenForDamageEnemy((enemyId, damage, facing) => {
        if (!this.engine || !this.engine.isHost) return;
        const enemy = this.engine.enemies.find(e => e.id === enemyId) || this.engine.enemies[parseInt(enemyId)];
        if (enemy) {
          this.engine.applyDamageToEnemy(enemy, damage, false, facing, true);
        }
      });
    });

    // Start with Epic Story Prologue Cutscene
    this.dialogue.playPrologue(() => {
      this.loadTownHub();
    });

    this.isRunning = true;
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.gameLoop(t));
  }

  public loadTownHub(broadcastParty: boolean = true) {
    if (!this.engine) return;
    this.engine.isTownMode = true;
    this.engine.enemies = [];
    this.engine.particles.summonedMinions = [];
    this.engine.player.x = 450;
    this.engine.player.y = this.engine.groundY;
    this.engine.player.vx = 0;
    this.engine.player.vy = 0;
    this.engine.setBattleTheme('catacombs');
    audio.playTownBGM();
    this.hud?.showToast('🏰 Arrived at Haven of Eldermoor');

    if (broadcastParty) {
      import('./network/NetworkManager').then(mod => {
        if (this.engine?.isHost) {
          mod.network.sendPartyReturnTown(this.engine.player, this.engine.groundY);
        } else {
          mod.network.leaveDungeonRoom();
        }
      });
    }
  }

  public onSelectLocation(locationId: string, isHost: boolean = true) {
    if (locationId === 'town_eldermoor') {
      this.loadTownHub();
      return;
    }

    if (this.engine) {
      this.engine.isHost = isHost;
    }

    const dungeonIdx = DUNGEONS.findIndex(d => d.id === locationId);
    if (dungeonIdx !== -1) {
      if (this.engine) {
        const maxCleared = this.engine.player.maxDungeonCleared || 0;
        // Only enforce progression if you are the Host (or playing Solo)
        if (this.engine.isHost && dungeonIdx > maxCleared) {
          this.engine.particles.addFloatingText(this.engine.player.x, this.engine.player.y - 60, `Clear previous zones first!`, '#ef4444', false, 18);
          return;
        }
      }
      this.loadDungeon(dungeonIdx, true);
    }
  }

  public loadDungeon(dungeonIndex: number, broadcastParty: boolean = false) {
    if (!this.engine) return;
    this.engine.isTownMode = false;
    this.engine.player.x = 300;
    this.engine.player.y = this.engine.groundY;
    this.engine.player.vx = 0;
    this.engine.player.vy = 0;
    this.engine.enemies = []; // Clear for client
    this.engine.particles.summonedMinions = [];

    this.currentDungeonIndex = dungeonIndex % DUNGEONS.length;
    const dungeon = DUNGEONS[this.currentDungeonIndex];
    if (dungeon) {
      this.engine.setBattleTheme(dungeon.theme);
      audio.playDungeonBGM(dungeon.theme);
    }
    this.currentWaveIndex = 0;
    this.engine.currentWaveIndex = 0;
    
    // Only Host spawns waves
    if (this.engine.isHost) {
      this.spawnNextWave();
      if (broadcastParty && dungeon) {
        import('./network/NetworkManager').then(mod => {
          mod.network.sendPartyNextDungeon(dungeon.id, this.currentDungeonIndex);
        });
      }
    }
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
    
    // Update max cleared dungeon for progression gating
    if (this.currentDungeonIndex >= (this.engine.player.maxDungeonCleared || 0)) {
      this.engine.player.maxDungeonCleared = this.currentDungeonIndex + 1;
      this.engine.triggerSave();
    }
    
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
            onSelect: () => this.loadTownHub(true)
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
            onSelect: () => {
              this.dialogue?.close();
              this.loadTownHub(true);
            }
          },
          {
            label: 'Advance to Next Dungeon ➔',
            icon: '⚔️',
            type: 'custom',
            onSelect: () => {
              this.dialogue?.close();
              const nextDungeon = DUNGEONS[this.currentDungeonIndex + 1];
              if (!nextDungeon) {
                this.loadTownHub(true);
                return;
              }
              const requiredLevel = nextDungeon.minLevel || 1;
              if (this.engine!.player.level < requiredLevel) {
                audio.playClick();
                this.hud?.showToast(`Lv. ${requiredLevel} Required for ${nextDungeon.name}!`);
                this.loadTownHub(true);
                return;
              }
              this.loadDungeon(this.currentDungeonIndex + 1, true);
            }
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
        this.worldMap?.open(this.engine?.player.maxDungeonCleared || 0);
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
        this.worldMap?.open(this.engine?.player.maxDungeonCleared || 0);
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
            this.worldMap?.open(this.engine?.player.maxDungeonCleared || 0);
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

          // Only Host progresses wave
          if (this.engine.isHost && livingEnemies.length === 0 && this.engine.enemies.length > 0) {
            this.currentWaveIndex++;
            this.engine.currentWaveIndex = this.currentWaveIndex;
            this.spawnNextWave();
            
            // Sync wave change to client
            import('./network/NetworkManager').then(mod => {
              mod.network.sendWaveSync({
                waveIndex: this.currentWaveIndex,
                cleared: this.currentWaveIndex >= dungeon.waves.length
              });
            });
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
