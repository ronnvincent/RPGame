/**
 * Main Side-View Action RPG Game Controller
 * Manages canvas rendering loop, input handling, Town Hub, Dungeons, Quests, Dialogues, and Cutscenes.
 */

import { CharacterClass, CHARACTER_CLASSES } from './classes/ClassDefinitions';
import { SaveManager } from './engine/SaveManager';
import { SideViewEngine } from './engine/SideViewEngine';
import { CharacterSelectUI } from './ui/CharacterSelectUI';
import { GameHUD } from './ui/GameHUD';
import { DUNGEONS, DungeonDefinition, spawnWaveEnemies, getWaveConfig, spawnSurviveWaveReinforcements } from './dungeons/DungeonManager';
import {
  ALL_GAME_MODES,
  resolveVote,
  selectThreeGameModes,
  type CastGameModeVotePacket,
  type DungeonFlowState,
  type GameModeModifiers,
  type GameModeOption,
  type GameModeVoteResultPacket,
  type StartGameModeVotePacket,
} from './dungeons/GameModeVoting';
import { recordEvent } from './quests/DailyMissions';
import {
  createDungeonEncounterRuntime,
  type DungeonEncounterSnapshot,
  type EncounterUpdateResult,
} from './dungeons/DungeonEncounterRuntime';
import {
  DEFAULT_DUNGEON_RUN_BLUEPRINT,
  DUNGEON_RUN_CONTENT,
  DungeonRunController,
  RelicRegistry,
  RUN_RELIC_DEFINITIONS,
  generateDungeonRun,
  stableHash,
  type DungeonRoomNode,
  type DungeonRunCommand,
  type DungeonRunEffect,
  type DungeonRunState,
  type ObjectiveEvent,
} from './dungeons/run';
import { gameplaySprites } from './engine/GameplaySpriteRenderer';
import { getGameplaySpriteFiles, type GameplaySpriteId } from './assets/GameplaySpriteManifest';
import { audio } from './engine/AudioManager';
import { canvasDprForQuality } from './engine/RenderResolution';
import type { VfxQuality } from './engine/ParticleSystem';
import { sanitizeEnemyAttackIntent } from './combat/EnemyAttackProfiles';
import { network } from './network/NetworkManager';
import { sprites } from './engine/SpriteManager';
import { resolveEnemyVisual } from './maps/EnemyVisualRegistry';
import { TownHub } from './town/TownHub';
import { DialogueSystem } from './dialogue/DialogueSystem';
import { WorldMapUI } from './ui/WorldMapUI';
import { quests } from './quests/QuestManager';
import { CoopDebugOverlay } from './ui/CoopDebugOverlay';
import { CoopLobbyUI } from './ui/CoopLobbyUI';
import { RunSummaryUI, SummaryRow } from './ui/RunSummaryUI';
import { installMobileStyles, findScrollable } from './ui/MobileUI';
import { TournamentLobbyUI } from './ui/TournamentLobbyUI';
import { PvpResultsUI, type PvpResultsAction } from './ui/PvpResultsUI';
import { PvpSpectatorBar } from './ui/PvpSpectatorBar';
import { SPECTATOR_VIEW, wheelZoomSteps } from './pvp/SpectatorCamera';
import type { PvpMatchSummary } from './pvp/TournamentSystem';
import {
  loadPvpRecord,
  savePvpRecord,
  settlePvpMatch,
  pvpTitleFor,
} from './pvp/PvpRecord';
import { TournamentMatch, PVP_ROUND_DURATION_SEC } from './pvp/TournamentSystem';
import {
  InputAction,
  InputActionEvent,
  InputAccessibilityPreferences,
  InputContext,
  InputController,
  PointerBindingOptions,
  skillIndexForAction,
} from './input';

type RunCommandBody = DungeonRunCommand extends infer Command
  ? Command extends DungeonRunCommand
    ? Omit<Command, 'commandId' | 'authorityEpoch' | 'sequence'>
    : never
  : never;

/** Single source of truth for discrete keyboard-to-skill routing. */
export function skillIndexForInput(code: string): number | null {
  switch (code) {
    case 'Digit1': return 0;
    case 'Digit2': return 1;
    case 'Digit3':
    case 'KeyR': return 2;
    case 'Digit4':
    case 'KeyF': return 3;
    case 'Digit5':
    case 'KeyZ': return 4;
    case 'Digit6':
    case 'KeyX': return 5;
    default: return null;
  }
}

export class SideViewGame {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private engine: SideViewEngine | null = null;
  private hud: GameHUD | null = null;
  private townHub: TownHub | null = null;
  private dialogue: DialogueSystem | null = null;
  private worldMap: WorldMapUI | null = null;
  private runSummary: RunSummaryUI | null = null;
  /** Contributions reported by teammates for the run that just ended. */
  private partyStats: Record<string, SummaryRow> = {};
  private coopDebug: CoopDebugOverlay | null = null;
  public coopLobby: CoopLobbyUI | null = null;
  public tournamentLobby: TournamentLobbyUI | null = null;
  /** Post-match scoreboard / rematch card. Null while no match is settling. */
  private pvpResults: PvpResultsUI | null = null;
  private spectatorBar: PvpSpectatorBar | null = null;
  /** Pointers on the arena canvas while spectating (drag and pinch). */
  private spectatorPointers = new Map<number, { x: number; y: number }>();
  private spectatorPinchDistance = 0;
  /** Held movement keys while the spectator camera has the wheel. */
  private spectatorKeys = new Set<string>();
  private currentDungeonIndex: number = 0;
  private currentWaveIndex: number = 0;
  private currentWaveTotalEnemies: number = 0;
  private readonly runRelics = new RelicRegistry(RUN_RELIC_DEFINITIONS);
  private readonly encounter = createDungeonEncounterRuntime(gameplaySprites);
  private runController: DungeonRunController | null = null;
  private runRoomId: string | null = null;
  private runSyncAccumulator = 0;
  /** Host wall-clock time batched into bounded 4 Hz controller updates. */
  private runTickAccumulatorMs = 0;
  private pendingDungeonInteraction: 'choice' | 'route' | 'world-object' | null = null;
  private runDialogueKey: string | null = null;
  private isAdvancingRunRoom = false;
  /** Deepest endless wave ever cleared on this device. */
  private bestEndlessWave: number = Number(localStorage.getItem('bestEndlessWave')) || 0;
  private waveActive: boolean = false;
  private dungeonFlowState: DungeonFlowState = 'WAVE_ACTIVE';
  private isTransitioningWave: boolean = false;
  private activeGameModeModifiers: GameModeModifiers = {};
  private surviveReinforcementTimer: number = 0;
  private surviveSpawnNonce: number = 0;
  private activeVotingOptions: GameModeOption[] = [];
  private activeVoteEndTimestamp: number = 0;
  private currentVoteTally: Map<string, string> = new Map();
  private voteWatchdogTimer: number | null = null;
  private waveClearTimer: number | null = null;
  private hostVoteTimer: number | null = null;
  private waveCompletionWatchdogTimer: number | null = null;
  private localVotedModeId: string | null = null;
  private tournamentHostBroadcastInterval: number | null = null;
  private lastTime: number = 0;
  private isRunning: boolean = false;
  private animationFrameId: number | null = null;
  /** One stable callback avoids allocating a new bound function every frame. */
  private readonly boundGameLoop = (timestamp: number) => this.gameLoop(timestamp);
  public readonly input: InputController;
  private inputListenersReady = false;
  /** Guest-side watchdog: timestamp of the last host state packet we saw. */
  private lastEnemySyncAt: number = 0;
  private lastResyncRequestAt: number = 0;
  /** Profile power is UI/network metadata, not a 60 Hz simulation system. */
  private networkProfileRefreshTimer = 0;
  /** Device pixel ratio the canvas backing store is sized for. */
  private dpr: number = 1;
  /** Canvas resolution follows adaptive VFX quality, but only at tier changes. */
  private renderResolutionQuality: VfxQuality = 'high';
  /** Viewport size in CSS pixels - the world's coordinate space. */
  private viewWidth: number = 960;
  private viewHeight: number = 540;

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

    this.canvas.addEventListener('click', (e) => {
      if (this.engine?.isTownMode && this.townHub) {
        const activeNpc = this.townHub.getActiveNpc();
        if (activeNpc) {
          const rect = this.canvas.getBoundingClientRect();
          const scaleX = this.viewWidth / (rect.width || 1);
          const clickX = (e.clientX - rect.left) * scaleX + (this.engine.cameraX || 0);
          if (Math.abs(clickX - activeNpc.x) <= 120) {
            this.interactWithActiveNpc();
          }
        }
      }
    });

    this.input = new InputController({
      storage: typeof localStorage === 'undefined' ? null : localStorage,
      context: () => this.resolveInputContext(),
      onAction: event => this.handleInputAction(event),
      reducedMotionDefault: typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      deadzone: 0.2,
    });
    this.input.applyAccessibility(this.container);

    installMobileStyles();

    // Block pull-to-refresh and rubber-banding, but never block a real scroll.
    // This used to test the target against a hard-coded list of modal class
    // names, so every new scrollable panel silently lost scrolling until
    // someone remembered to add it. Ask the DOM instead.
    this.container.addEventListener('touchmove', (e) => {
      if (!findScrollable(e.target)) e.preventDefault();
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
    const width = Math.floor(window.visualViewport ? window.visualViewport.width : window.innerWidth);
    const height = Math.floor(window.visualViewport ? window.visualViewport.height : window.innerHeight);

    // Back the canvas at device resolution so pixel art stays sharp on phones
    // and retina displays, but keep world coordinates in CSS pixels so layout
    // and pointer input need no remapping.
    const coarsePointer = typeof window.matchMedia === 'function'
      && window.matchMedia('(pointer: coarse)').matches;
    const dpr = canvasDprForQuality(
      window.devicePixelRatio || 1,
      coarsePointer,
      this.renderResolutionQuality,
    );
    this.dpr = dpr;
    this.viewWidth = width;
    this.viewHeight = height;

    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    // Resizing a canvas resets its 2D context, so smoothing has to be disabled
    // again here. Without this the browser bilinear-filters every sprite and
    // the whole game looks soft.
    this.ctx.imageSmoothingEnabled = false;

    if (this.engine) {
      this.engine.canvasWidth = width;
      this.engine.canvasHeight = height;
      this.engine.groundY = height;
      this.engine.arenaHeight = height;
    }
  }

  /** Avoid per-frame canvas resizes: resize only when adaptive quality changes tier. */
  private syncRenderResolution() {
    if (!this.engine) return;
    const quality = this.engine.particles.getVfxQuality();
    if (quality === this.renderResolutionQuality) return;
    this.renderResolutionQuality = quality;
    this.handleResize();
  }

  public startGame(selectedClass: CharacterClass, saveData: any = null) {
    this.engine = new SideViewEngine(selectedClass);
    this.engine.groundY = this.viewHeight;

    // Stream the VFX catalogue in the background so the first cast of a fight
    // already has its frames resident.
    this.engine.onRunLost = () => this.onRunLost();

    this.engine.particles.warmVfx();
    this.engine.particles.warmSkillVfx(selectedClass.skills);
    audio.warmSounds(selectedClass.skills);
    
    if (saveData) {
      this.engine.loadSaveData(saveData);
    }

    // Register once at startup, whether returning or brand new.
    //
    // Power is a column that did not exist until recently, so every account
    // created before it defaults to zero and is filtered off the rankings. A
    // returning player only loaded and never saved, so they stayed invisible
    // until they happened to pick something up - which made a populated game
    // look like an empty leaderboard. triggerSave carries the computed power,
    // which saveGame was being called without here.
    this.engine.triggerSave();
    this.engine.arenaHeight = this.canvas.height;

    this.townHub = new TownHub();
    this.engine.townHub = this.townHub;

    this.dialogue = new DialogueSystem(this.container);
    this.worldMap = new WorldMapUI(this.container, (locationId, isHost) => {
      this.onSelectLocation(locationId, isHost);
    });

    this.hud = new GameHUD(this.container, this.engine, this);
    this.hud.worldMapUI = this.worldMap;

    this.spectatorBar = new PvpSpectatorBar(this.container, {
      onPrev: () => this.engine?.cycleSpectateTarget(-1),
      onNext: () => this.engine?.cycleSpectateTarget(1),
      onToggleFollow: () => this.engine?.toggleSpectatorFollow(),
      onZoomIn: () => this.engine?.nudgeSpectatorZoom(1),
      onZoomOut: () => this.engine?.nudgeSpectatorZoom(-1),
      onTogglePause: () => {
        this.engine?.toggleSpectatorPause();
        this.syncSpectatorBar();
      },
    });
    this.setupSpectatorCameraInput();

    // No-op unless ?coopdebug=1 (or the rpg_debug_multiplayer key) is set.
    this.coopDebug = new CoopDebugOverlay(this.container);

    // Party lobby. Closes itself and enters the dungeon when the host starts.
    this.coopLobby = new CoopLobbyUI(this.container, () => {});

    this.runSummary = new RunSummaryUI(this.container);
    this.runSummary.onRematch = () => this.loadDungeon(this.currentDungeonIndex, true);

    this.tournamentLobby = new TournamentLobbyUI(this.container, this.engine, (match) => {
      this.startTournamentMatch(match);
    });
    this.engine.onTournamentEnded = () => {
      this.pvpResults?.close();
      this.pvpResults = null;
      this.spectatorBar?.close();
      this.spectatorKeys.clear();
      this.spectatorPointers.clear();
      network.isPvpSession = false;
      network.isPvpFallback = false;
      if (this.tournamentHostBroadcastInterval) {
        window.clearInterval(this.tournamentHostBroadcastInterval);
        this.tournamentHostBroadcastInterval = null;
      }
      this.hud?.setPvpMode(false);
      this.loadTownHub(false);
    };
    // A finished match hands over to the results card instead of a three-second
    // banner. The engine keeps the arena standing until the player picks
    // rematch, the lobby, or town, so the card is not fighting a scene change.
    this.engine.onPvpMatchEnded = (summary) => this.presentPvpResults(summary);

    network.onPvpPeerDropped((name) => {
      if (!this.engine?.inTournamentMode) return;
      this.hud?.showToast(`${name} disconnected — their slot is held for 45s.`);
    });

    network.onPvpRematchState((state: any) => {
      this.pvpResults?.setRematchState({
        votes: Math.max(0, Number(state?.votes) || 0),
        total: Math.max(0, Number(state?.total) || 0),
        needed: Math.max(0, Number(state?.needed) || 0),
        started: Boolean(state?.started),
      });
    });

    // Class and level travel with lobby packets so party cards can show them.
    this.refreshNetworkProfile();

    this.setupInputListeners();

    // Mobile / Direct Link Auto-Join via URL parameter (?joinRoom=XXXX or ?room=XXXX)
    const urlParams = new URLSearchParams(window.location.search);
    const joinCode = urlParams.get('joinRoom') || urlParams.get('room') || urlParams.get('pvp');
    if (joinCode) {
      const clean = joinCode.trim().toUpperCase();
      network.isPvpSession = true;
      console.log(`[PVP] Found joinRoom URL param: ${clean}. Auto-joining Colosseum lobby...`);
      try {
        const cleanUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, document.title, cleanUrl);
      } catch (_) {}

      window.setTimeout(() => {
        this.openTournamentLobby();
        this.tournamentLobby?.joinRoomByCode(clean);
      }, 600);
    }
    
    // Setup Multiplayer Sync Listeners
    Promise.resolve({ network }).then(mod => {
      mod.network.listenForPlayerSkill((socketId, skillIndex, classId, x, y, facing, isTownMode, skillDamage) => {
        if (typeof localStorage !== 'undefined' && localStorage.getItem('rpg_debug_multiplayer') === '1') {
          console.log('[NET] Received remote_player_skill:', { socketId, skillIndex, classId, x, y, facing, isTownMode, skillDamage });
        }
        if (!this.engine) return;
        // A late packet from the previous scene must not draw a dungeon
        // ultimate over town (or mutate the town avatar as if it were fighting).
        if (Boolean(isTownMode) !== Boolean(this.engine.isTownMode)) return;

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
        remoteP.lastSkillIndex = skillIndex;

        mod.network.remotePlayers[socketId] = remoteP;

        this.engine.castRemoteSkill(classId, skillIndex, x, y + this.engine.groundY, facing, socketId, skillDamage);
      });

      mod.network.listenForPartyReturnTown((returnData) => {
        console.log('[NET] Received party_return_town:', returnData);
        if (this.engine?.inTournamentMode) {
          console.warn('[NET] Ignored party_return_town packet during active PvP Tournament.');
          return;
        }
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
        // Follow the party to town only when the HOST left the run. Previously
        // this fired for any sender - including this client's own echo - which
        // stranded a guest in town while the host stayed in the dungeon.
        const isSelf = returnData?.socketId === mod.network.socket?.id;
        if (returnData?.fromHost === true && !isSelf && !this.engine?.isTownMode && !this.engine?.inTournamentMode) {
          this.loadTownHub(false);
        }
      });

      mod.network.listenForPartyNextDungeon((data) => {
        if (!this.engine || this.engine.inTournamentMode) return;
        if (data?.dungeonId === 'tournament_colosseum' || data?.dungeonId === 'tournament_arena' || (data as any)?.isPvp || mod.network.isPvpSession || mod.network.isPvpFallback) {
          if (!this.tournamentLobby?.isOpen) this.triggerTournamentJoinerTransition(data);
          return;
        }
        console.log('[NET] Received party_next_dungeon from host:', data);
        this.dialogue?.close();
        if (this.currentDungeonIndex !== data.dungeonIndex || this.engine.isTownMode) {
          this.loadDungeon(data.dungeonIndex, false);
        }
      });

      mod.network.listenForWaveSync((data) => {
        if (!this.engine || this.engine.inTournamentMode) return;

        this.lastEnemySyncAt = performance.now();
        this.currentWaveIndex = data.waveIndex;
        this.engine.currentWaveIndex = data.waveIndex;
        if (data.cleared) {
          this.onDungeonCleared();
        } else {
          // Update HUD with new wave info
          const dungeon = DUNGEONS[this.currentDungeonIndex];
          if (dungeon) {
            const livingCount = this.engine.enemies.filter(e => !e.isDead).length;
            this.syncWaveObjectiveHud(dungeon, livingCount);
            audio.playSlash('heavy');
          }
        }
      });

      mod.network.listenForStartGameModeVote((packet) => {
        if (!this.engine || this.engine.isHost) return;
        this.handleIncomingStartVote(packet);
      });

      mod.network.listenForCastGameModeVote((packet) => {
        this.handleIncomingCastVote(packet);
      });

      mod.network.listenForGameModeVoteResult((packet) => {
        if (!this.engine || this.engine.isHost) return;
        this.handleIncomingVoteResult(packet);
      });
      
      mod.network.listenForEnemyDied((enemyData) => {
        if (!this.engine || this.engine.isHost) return;
        const realEnemy = this.engine.enemies.find(e => e.id === enemyData.id);
        if (realEnemy) {
          realEnemy.isDead = true;
          realEnemy.hp = 0;
          this.engine.onEnemyDefeated(realEnemy);
          return;
        }
        // Mock an enemy instance to trigger the defeat logic and spawn identical ground loot
        const fakeEnemy: any = {
          id: enemyData.id,
          name: enemyData.name,
          type: enemyData.type,
          x: enemyData.x,
          y: enemyData.y + this.engine.groundY,
          lootDrop: enemyData.lootDrop || enemyData.drops,
          expReward: typeof enemyData.expReward === 'number' ? enemyData.expReward : 25,
          goldReward: typeof enemyData.goldReward === 'number' ? enemyData.goldReward : 15,
          color: enemyData.color || '#e43b44',
          isDead: false,
          hp: 0
        };
        this.engine.onEnemyDefeated(fakeEnemy);
      });

      mod.network.listenForEnemySync((enemies, waveIndex, dungeonIndex, dungeonId) => {
        if (this.engine?.inTournamentMode) return;
        if (dungeonId === 'tournament_colosseum' || dungeonId === 'tournament_arena' || mod.network.isPvpSession || mod.network.isPvpFallback) {
          if (!this.tournamentLobby?.isOpen) this.triggerTournamentJoinerTransition();
          return;
        }
        this.applyEnemySnapshot(enemies, waveIndex, dungeonIndex, dungeonId);
      });

      // Host: a guest joined or reconnected and needs the whole world state.
      mod.network.onFullSyncRequest((requesterId) => {
        if (!this.engine || !this.engine.isHost) return;
        // A newcomer asks for state the moment the server assigns its role.
        // While the Colosseum is still staging there is no run to hand over -
        // and `currentDungeonId` can still hold the arena id from the previous
        // match. A snapshot labelled that way reads as a live match and pulls
        // the newcomer into the arena before START is ever pressed.
        const stagingPvp = this.tournamentLobby?.isOpen
          || ((mod.network.isPvpSession || mod.network.isPvpFallback) && !this.engine.inTournamentMode);
        if (stagingPvp) return;
        const dungeon = DUNGEONS[this.currentDungeonIndex];
        const isPvp = this.engine.inTournamentMode;
        mod.network.sendFullSync(requesterId, {
          waveIndex: this.currentWaveIndex,
          dungeonIndex: this.currentDungeonIndex,
          dungeonId: isPvp ? (mod.network.isPvpFallback ? 'goblin_catacombs' : 'tournament_colosseum') : (dungeon?.id || this.engine.currentDungeonId),
          enemies: isPvp ? [] : this.engine.enemies,
          runState: isPvp ? undefined : this.runController?.getSnapshot(),
          encounterSnapshot: isPvp ? undefined : (this.encounter.snapshot() ?? undefined),
          isPvpMatch: isPvp,
          tournamentMode: isPvp,
          arenaTheme: 'tournament_colosseum',
          pvpTeams: mod.network.currentLobbyState?.pvpTeams || (this.engine.tournamentMatch ? Object.fromEntries(this.engine.tournamentMatch.fighters.map(f => [f.id, f.team])) : undefined),
          pvpFormat: this.engine.tournamentMatch?.config?.format || mod.network.currentLobbyState?.pvpFormat || '1v1',
        }, this.engine.groundY);
      });

      // Guest: apply the host's snapshot wholesale.
      mod.network.onFullSync((snapshot) => {
        if (!this.engine || this.engine.isHost) return;
        // Only the snapshot itself may claim a live PvP match. The local
        // session flags are true for anyone merely sitting in a Colosseum
        // lobby, so treating them as evidence launched the arena for every
        // joiner the moment its role was assigned.
        const isHostPvp = Boolean((snapshot as any)?.isPvpMatch)
          || Boolean((snapshot as any)?.tournamentMode)
          || snapshot?.dungeonId === 'tournament_colosseum'
          || snapshot?.dungeonId === 'tournament_arena'
          || Boolean((snapshot as any)?.pvpFormat);

        if (isHostPvp) {
          if (!this.engine.inTournamentMode) {
            console.log('[NET] Host is in PvP Tournament; auto-correcting Joiner to Arena...');
            this.triggerTournamentJoinerTransition(snapshot);
          }
          return;
        }

        if (this.engine.inTournamentMode) return;
        console.log('[NET] Applying full_sync from host:', snapshot.enemies?.length, 'enemies');
        this.applyEnemySnapshot(snapshot.enemies, snapshot.waveIndex, snapshot.dungeonIndex, snapshot.dungeonId);
        if (snapshot.runState) this.applyRunSnapshot(snapshot.runState);
        if (snapshot.encounterSnapshot) this.applyEncounterSnapshot(snapshot.encounterSnapshot);
      });

      mod.network.onRunSync((runState, encounterSnapshot) => {
        if (!this.engine || this.engine.isHost) return;
        if (this.engine.inTournamentMode || mod.network.isPvpSession || mod.network.isPvpFallback) {
          if (!this.engine.inTournamentMode && !this.tournamentLobby?.isOpen) {
            this.triggerTournamentJoinerTransition();
          }
          return;
        }
        this.applyRunSnapshot(runState);
        if (encounterSnapshot) this.applyEncounterSnapshot(encounterSnapshot);
      });

      mod.network.onCombatDefense((result) => {
        if (!this.engine?.isHost) return;
        this.engine.applyRemoteCombatDefense(result);
      });

      // Role changes are server-driven; a fresh guest pulls state immediately.
      // Party-wide support omits a target. Targeted support is still relayed
      // to the whole room, so only the selected socket applies it.
      mod.network.onPartySupport((payload: any) => {
        if (!this.engine || !payload) return;
        if (payload.kind === 'heal') {
          if (!payload.targetSocketId || payload.targetSocketId === mod.network.mySocketId) {
            const percent = Number(payload.percent);
            if (Number.isFinite(percent) && percent > 0) {
              this.engine.applyPartyPercentHeal(percent, payload.casterName);
            } else {
              this.engine.applyPartyHeal(Number(payload.amount) || 0, payload.casterName);
            }
          }
        } else if (payload.kind === 'revive') {
          // Targeted: the relay goes to the whole room, so only the person who
          // was actually picked up should stand up.
          if (payload.targetSocketId && payload.targetSocketId === mod.network.mySocketId) {
            const percent = Number(payload.percent);
            this.engine.acceptRevive(payload.casterName, Number.isFinite(percent) && percent > 0 ? percent : undefined);
          }
        } else if (payload.kind === 'loot') {
          this.hud?.showToast?.(`${payload.casterName} found ${payload.itemName}!`);
        } else if (payload.kind === 'downed') {
          if (typeof payload.count === 'number') {
            this.engine.teamLivesRemaining = Math.max(0, Math.min(SideViewEngine.MAX_TEAM_LIVES, payload.count));
            this.engine.teamDeaths = SideViewEngine.MAX_TEAM_LIVES - this.engine.teamLivesRemaining;
          } else {
            this.engine.teamDeaths++;
            this.engine.teamLivesRemaining = Math.max(0, SideViewEngine.MAX_TEAM_LIVES - this.engine.teamDeaths);
          }
          audio.playHit();
          this.hud?.showToast(`${payload.casterName || 'Teammate'} is DOWN! (${this.engine.teamLivesRemaining}/3 Team Lives remaining)`);
          this.engine.particles.addFloatingText(this.engine.player.x, this.engine.player.y - 70, `TEAM LIFE LOST! ${this.engine.teamLivesRemaining}/3 LEFT`, '#f87171', true, 18);

          if (this.engine.player.downed) {
            this.hud?.showToast('ALL PARTY MEMBERS DOWNED - DEFEATED!');
            this.engine.runOver = true;
            this.onRunLost();
          }
        } else if (payload.kind === 'team_defeat') {
          this.engine.teamLivesRemaining = 0;
          this.engine.teamDeaths = SideViewEngine.MAX_TEAM_LIVES;
          this.hud?.showToast(`ALL 3 TEAM LIVES LOST! (${payload.casterName || 'Party'} fell) - DEFEATED`);
          this.engine.runOver = true;
          this.onRunLost();
        } else if (payload.kind === 'buff') {
          this.engine.applyPartyBuff(
            payload.stat,
            Number(payload.multiplier) || 1,
            Number(payload.duration) || 0,
            payload.casterName,
            payload.socketId
          );
        } else if (payload.kind === 'cleanse') {
          this.engine.applyPartyCleanse(
            Math.max(1, Math.trunc(Number(payload.count) || 1)),
            payload.casterName
          );
        }
      });

      mod.network.onRunStats((payload) => {
        if (!payload?.socketId) return;
        this.partyStats[payload.socketId] = {
          socketId: payload.socketId,
          isMe: false,
          name: payload.name || 'Teammate',
          classId: payload.classId,
          damageDealt: Number(payload.damageDealt) || 0,
          damageTaken: Number(payload.damageTaken) || 0,
          kills: Number(payload.kills) || 0,
          revives: Number(payload.revives) || 0,
        };
      });

      // Registered once, so every way into a run - invite, quick join, or the
      // host's own START - has a listener when the packet lands.
      mod.network.onDungeonStart((roomData: any) => {
        this.worldMap?.close();
        const isTournament = roomData?.dungeonId === 'tournament_colosseum'
          || roomData?.dungeonId === 'tournament_arena'
          || roomData?.isPvp === true
          || Boolean(mod.network.currentLobbyState?.isPvp)
          || Boolean(mod.network.isPvpSession)
          || Boolean(mod.network.isPvpFallback)
          || Boolean(this.tournamentLobby?.isOpen)
          || Boolean(roomData?.pvpTeams)
          || Boolean(mod.network.currentLobbyState?.pvpTeams)
          || Boolean(roomData?.pvpFormat)
          || Boolean(mod.network.currentLobbyState?.pvpFormat);

        if (isTournament) {
          mod.network.isPvpSession = true;
          this.tournamentLobby?.close();
          const pvpFmt = (this.tournamentLobby?.currentFormat || roomData?.pvpFormat || mod.network.currentLobbyState?.pvpFormat || '1v1') as any;
          const matchTheme = (roomData?.dungeonId === 'tournament_arena' || roomData?.dungeonId === 'tournament_colosseum')
            ? roomData.dungeonId
            : 'tournament_colosseum';
          const match = new TournamentMatch({
            format: pvpFmt,
            roundsToWin: 2,
            roundDurationSec: PVP_ROUND_DURATION_SEC,
            mapTheme: matchTheme,
          });
          const localActorId = mod.network.getActorId();
          const members = roomData.players || mod.network.currentLobbyState?.members || [];
          const myMember = members.find((m: any) => (m.actorId === localActorId || m.uuid === localActorId || m.socketId === mod.network.socket?.id));
          const teams = roomData?.pvpTeams || mod.network.currentLobbyState?.pvpTeams;
          const assignedTeam = (teams && teams[localActorId])
            || (mod.network.currentLobbyState?.pvpTeams && mod.network.currentLobbyState.pvpTeams[localActorId])
            || myMember?.team
            || (mod.network.isHost ? 'red' : 'blue');
          if (this.engine) {
            this.engine.pvpTeam = assignedTeam;
          }
          match.setupTeamsFromLobby(members, localActorId, pvpFmt, teams, assignedTeam);
          if (roomData.players) {
            for (const p of roomData.players) {
              if (p.socketId && mod.network.remotePlayers[p.socketId]) {
                mod.network.remotePlayers[p.socketId].team = p.team
                  || (teams && teams[p.actorId])
                  || (mod.network.currentLobbyState?.pvpTeams && mod.network.currentLobbyState.pvpTeams[p.actorId])
                  || (p.actorId === localActorId ? assignedTeam : (assignedTeam === 'red' ? 'blue' : 'red'));
                mod.network.remotePlayers[p.socketId].actorId = p.actorId;
              }
            }
          }
          // The server seats the bench itself; never infer it from missing
          // team data, which a lagging snapshot could also produce.
          const spectating = roomData?.isSpectator === true
            || myMember?.seat === 'spectator';
          this.startTournamentMatch(match, spectating);
          return;
        }
        this.onSelectLocation(roomData.dungeonId, mod.network.isHost);
      });

      mod.network.onRemotePlayerMove((data: any) => {
        if (!this.engine) return;
        // Co-op movement carries a team too, so only a Colosseum room may be
        // interpreted as a live duel. And while the staging lobby is open the
        // only way into the arena is the server's dungeon_start.
        const pvpRoom = data?.isPvp === true
          || mod.network.currentLobbyState?.isPvp === true
          || Boolean(mod.network.currentLobbyState?.pvpFormat);
        if (pvpRoom && (data?.team || data?.isTournament) && !data?.isTownMode && !this.tournamentLobby?.isOpen) {
          if (!this.engine.inTournamentMode && !this.engine.isHost) {
            console.log('[PVP] Detected remote player active in PvP match; auto-correcting Joiner to Arena...');
            this.triggerTournamentJoinerTransition();
          }
        }
      });

      mod.network.onPvpHandshake((handshake) => {
        console.log('[PVP] Handshake received from host:', handshake);
        mod.network.isPvpSession = true;
        mod.network.isPvpFallback = true;
        if (handshake.phase === 'match') {
          // A "match" handshake also rides on movement relays, so it is not
          // proof that the host pressed START. While the Colosseum lobby is
          // open, only the server's dungeon_start may leave the staging room;
          // otherwise a newcomer was dragged into the arena the instant it
          // joined, which is exactly what the ready-up screen exists to stop.
          if (this.tournamentLobby?.isOpen) return;
          // Host has launched or is in the match: transition joiner to arena
          if (this.coopLobby?.isOpen) this.coopLobby.close();
          if (!this.engine?.inTournamentMode && !this.engine?.isHost) {
            console.log('[PVP] Match is active on host; transitioning Joiner to Arena...');
            this.triggerTournamentJoinerTransition(handshake);
          }
        } else {
          // Lobby phase: ensure Joiner is in TournamentLobbyUI with the host
          if (this.coopLobby?.isOpen) {
            this.coopLobby.close();
            this.openTournamentLobby();
          } else if (!this.tournamentLobby?.isOpen && !this.engine?.inTournamentMode) {
            this.openTournamentLobby();
          }
        }
      });

      mod.network.onPvpHitReceived((packet: any) => {
        if (!this.engine || !this.engine.inTournamentMode) return;
        this.engine.receivePvpHit(packet);
      });

      mod.network.onPvpHitEffect((packet: any) => {
        if (!this.engine || !this.engine.inTournamentMode) return;
        this.engine.showPvpHitEffect(packet);
      });

      mod.network.onPvpKillFeed((packet: any) => {
        if (!this.engine || !this.engine.inTournamentMode) return;
        this.engine.showPvpKillFeed(packet);
      });

      mod.network.onPvpMatchResult((packet: any) => {
        if (!this.engine || !this.engine.inTournamentMode) return;
        this.engine.handlePvpMatchResult(packet);
      });

      // Server-settled round result: the shared scoreboard every client reads.
      mod.network.onPvpRoundResult((packet: any) => {
        if (!this.engine || !this.engine.inTournamentMode) return;
        this.engine.applyPvpRoundResult(packet);
      });

      mod.network.onQuickChat((payload) => {
        if (!this.engine || !payload?.socketId) return;
        this.engine.showChatBubble(payload.socketId, payload.lineId);
      });

      mod.network.onPing((payload) => {
        if (!this.engine) return;
        this.engine.addPing(payload.x, payload.y);
      });

      mod.network.onRoleChange((isHost) => {
        console.log('[NET] Role assigned by server. isHost =', isHost);
        if (!isHost) mod.network.requestFullSync();
      });

      mod.network.listenForDamageEnemy((enemyId, damage, facing) => {
        if (!this.engine || !this.engine.isHost) return;
        const enemy = this.engine.enemies.find(e => e.id === enemyId) || this.engine.enemies[parseInt(enemyId)];
        if (enemy && !enemy.isDead) {
          this.engine.applyDamageToEnemy(enemy, damage, false, facing, true);
        }
      });

      // Only the selected guest receives this server-verified host packet. The
      // engine rechecks scene/role and owns defence, shield, i-frames and death.
      mod.network.onPlayerDamage((payload) => {
        if (!this.engine || this.engine.isHost) return;
        this.engine.applyNetworkPlayerDamage(payload);
      });

      mod.network.listenForEnemyHit((hitData) => {
        if (!this.engine) return;
        const enemy = this.engine.enemies.find(e => e.id === hitData.enemyId) || this.engine.enemies[parseInt(hitData.enemyId)];
        if (enemy) {
          enemy.hp = hitData.newHp;
          enemy.hitStun = 0.25;
          enemy.vx = hitData.knockbackDir * 3.5;
          enemy.vy = -2.5;

          this.engine.particles.triggerScreenShake(hitData.isCrit ? 7 : 2.5, 0.14);
          audio.playHit(hitData.isCrit);
          this.engine.particles.addFloatingText(
            enemy.x,
            enemy.y - enemy.height / 2,
            `${hitData.damage}`,
            hitData.isCrit ? '#ffd54f' : '#ffffff',
            hitData.isCrit
          );
          this.engine.particles.playVfx(hitData.isCrit ? 'fx_hit_big' : 'fx_spark_a', enemy.x, enemy.y - 12, { scale: hitData.isCrit ? 1.4 : 1 });
        }
      });
    });

    // The prologue is a first-time thing and had no gate at all, so it played
    // on every single open. Keyed to the account rather than the browser: a new
    // character on this machine still gets the story, and the person who has
    // already read it never sees it again.
    const uuid = localStorage.getItem('playerUUID') || 'guest';
    const seenKey = `prologueSeen:${uuid}`;
    if (localStorage.getItem(seenKey)) {
      this.loadTownHub();
    } else {
      this.dialogue!.playPrologue(() => {
        localStorage.setItem(seenKey, '1');
        this.loadTownHub();
      });
    }

    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.animationFrameId = requestAnimationFrame(this.boundGameLoop);
  }

  public stop() {
    this.isRunning = false;
    this.input.router.clear();
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * The run is lost.
   *
   * Experience and gold already banked are kept - the time spent was real -
   * but the dungeon has to be started again, and anything still lying on the
   * ground is left behind. Without a cost, nothing else in the fight matters.
   */
  private onRunLost() {
    if (!this.engine) return;
    if (this.engine.isVictoryOrWaveCleared || this.dungeonFlowState === 'WAVE_CLEARED') {
      console.warn('[Dungeon] Prevented onRunLost: wave or dungeon was already cleared');
      return;
    }
    const lostLoot = this.engine.droppedLoots.length;

    if (this.waveClearTimer) {
      window.clearTimeout(this.waveClearTimer);
      this.waveClearTimer = null;
    }
    if (this.hostVoteTimer) {
      window.clearTimeout(this.hostVoteTimer);
      this.hostVoteTimer = null;
    }
    if (this.voteWatchdogTimer) {
      window.clearTimeout(this.voteWatchdogTimer);
      this.voteWatchdogTimer = null;
    }
    if (this.waveCompletionWatchdogTimer) {
      window.clearTimeout(this.waveCompletionWatchdogTimer);
      this.waveCompletionWatchdogTimer = null;
    }
    this.hud?.hideGameModeVotingModal();
    this.dungeonFlowState = 'WAVE_ACTIVE';
    this.isTransitioningWave = false;

    this.hud?.showToast('DEFEATED - returning to Eldermoor');
    if (lostLoot > 0) {
      window.setTimeout(() => this.hud?.showToast(`${lostLoot} unclaimed item${lostLoot > 1 ? 's' : ''} left behind`), 1800);
    }

    // A moment to see it happen before the screen changes.
    window.setTimeout(() => {
      if (!this.engine) return;
      this.engine.droppedLoots = [];
      this.engine.player.hp = Math.max(1, Math.round(this.engine.player.maxHp * 0.4));
      this.engine.player.mp = Math.round(this.engine.player.maxMp * 0.4);
      this.engine.player.animState = 'idle';
      this.engine.runOver = false;
      this.loadTownHub(true);
      // A defeat is still a run worth reading. No rematch offered from here -
      // the way back in is the world map, which re-checks the level gate.
      this.showRunSummary('DEFEATED', 'You were carried back to Eldermoor', false);
    }, 2600);
  }

  public loadTownHub(broadcastParty: boolean = true) {
    if (!this.engine) return;
    if (this.waveClearTimer) {
      window.clearTimeout(this.waveClearTimer);
      this.waveClearTimer = null;
    }
    if (this.hostVoteTimer) {
      window.clearTimeout(this.hostVoteTimer);
      this.hostVoteTimer = null;
    }
    if (this.voteWatchdogTimer) {
      window.clearTimeout(this.voteWatchdogTimer);
      this.voteWatchdogTimer = null;
    }
    if (this.waveCompletionWatchdogTimer) {
      window.clearTimeout(this.waveCompletionWatchdogTimer);
      this.waveCompletionWatchdogTimer = null;
    }
    this.hud?.hideGameModeVotingModal();
    this.dungeonFlowState = 'WAVE_ACTIVE';
    this.isTransitioningWave = false;
    this.isAdvancingRunRoom = false;
    this.activeGameModeModifiers = {};
    this.currentVoteTally.clear();
    this.localVotedModeId = null;

    this.engine.resetCombatScene();
    this.engine.setDungeonEncounterRuntime(null);
    this.engine.onPlayerWorldHit = null;
    this.engine.onEnemyDefeatedEvent = null;
    this.encounter.reset();
    this.runController = null;
    this.runRoomId = null;
    this.pendingDungeonInteraction = null;
    this.runDialogueKey = null;
    this.hud?.setDungeonObjective(null);
    this.hud?.setDungeonRelics([]);
    this.hud?.setDungeonContextAction(null);
    this.hud?.setQuestTrackerInDungeon(false);
    this.waveActive = false;
    this.engine.isVictoryOrWaveCleared = false;
    this.engine.isTownMode = true;
    if (this.engine.inTournamentMode) {
      this.engine.inTournamentMode = false;
    }
    this.engine.enemies = [];
    this.engine.player.x = 450;
    this.engine.player.y = this.engine.groundY;
    this.engine.player.vx = 0;
    this.engine.player.vy = 0;
    this.engine.setBattleTheme('catacombs');
    audio.playTownBGM();
    this.hud?.showToast('Arrived at Haven of Eldermoor');

    const isTournament = this.engine.inTournamentMode;
    if (broadcastParty && !isTournament) {
      Promise.resolve({ network }).then(mod => {
        mod.network.sendPartyReturnTown(this.engine!.player, this.engine!.groundY);
      });
    }
  }

  /**
   * Applies host-authoritative enemy/wave state on the guest. Used by both the
   * 10Hz enemy_sync stream and the on-demand full_sync snapshot.
   *
   * Enemies are reconciled in place by id rather than by replacing the array,
   * so guest-side VFX and summoned minions that reference an enemy survive.
   */
  private applyEnemySnapshot(enemies: any[], waveIndex: number, dungeonIndex?: number, dungeonId?: string) {
    if (!this.engine || this.engine.isHost || this.engine.inTournamentMode) return;
    if (network.isPvpSession || network.isPvpFallback || dungeonId === 'tournament_colosseum' || dungeonId === 'tournament_arena') {
      if (!this.tournamentLobby?.isOpen) {
        this.triggerTournamentJoinerTransition();
      }
      return;
    }

    this.lastEnemySyncAt = performance.now();

    // A guest receiving dungeon state is, by definition, in the dungeon.
    // Perform a real dungeon entry rather than just flipping the flag - setting
    // isTownMode alone left the player standing in town with the dungeon's
    // enemies loaded, able to hit monsters they could not see.
    if (this.engine.isTownMode) {
      const targetIndex = dungeonIndex !== undefined
        ? dungeonIndex % DUNGEONS.length
        : this.currentDungeonIndex;
      this.loadDungeon(targetIndex, false);
    }

    if (dungeonIndex !== undefined && dungeonIndex !== this.currentDungeonIndex) {
      this.currentDungeonIndex = dungeonIndex % DUNGEONS.length;
      this.engine.currentDungeonIndex = this.currentDungeonIndex;
      this.engine.currentDungeonId = dungeonId || DUNGEONS[this.currentDungeonIndex]?.id || 'goblin_catacombs';
      const themed = DUNGEONS[this.currentDungeonIndex];
      if (themed) {
        this.engine.setBattleTheme(themed.theme);
        audio.playDungeonBGM(themed.theme);
      }
    }

    if (waveIndex !== undefined) {
      this.currentWaveIndex = waveIndex;
      this.engine.currentWaveIndex = waveIndex;
    }

    const groundY = this.engine.groundY;
    const incoming = enemies || [];
    const seen = new Set<string>();

    for (const raw of incoming) {
      const inc = {
        ...raw,
        y: raw.y + groundY,
        attackIntent: raw.attackIntent ? sanitizeEnemyAttackIntent({
          ...raw.attackIntent,
          sourceY: typeof raw.attackIntent.sourceY === 'number' ? raw.attackIntent.sourceY + groundY : groundY,
          target: raw.attackIntent.target ? {
            ...raw.attackIntent.target,
            y: typeof raw.attackIntent.target.y === 'number' ? raw.attackIntent.target.y + groundY : groundY,
          } : raw.attackIntent.target,
        }) : undefined,
      };
      seen.add(inc.id);

      const existing = this.engine.enemies.find(e => e.id === inc.id);
      if (existing) {
        existing.name = inc.name;
        existing.type = inc.type;
        existing.icon = inc.icon;
        existing.color = inc.color;
        existing.x = inc.x;
        existing.y = inc.y;
        existing.vx = inc.vx;
        existing.vy = inc.vy;
        existing.hp = inc.hp;
        existing.maxHp = inc.maxHp;
        existing.atk = inc.atk;
        existing.def = inc.def;
        existing.speed = inc.speed;
        existing.expReward = inc.expReward;
        existing.goldReward = inc.goldReward;
        existing.width = inc.width;
        existing.height = inc.height;
        existing.attackRange = inc.attackRange;
        existing.attackCooldown = inc.attackCooldown;
        existing.facing = inc.facing;
        existing.isGrounded = inc.isGrounded;
        existing.isAttacking = inc.isAttacking;
        existing.isActive = inc.isActive;
        existing.spawnDelay = inc.spawnDelay;
        existing.hitStun = inc.hitStun;
        existing.isDead = inc.isDead;
        existing.attackTimer = inc.attackTimer;
        existing.isElite = inc.isElite;
        existing.phases = inc.phases;
        existing.currentPhase = inc.currentPhase;
        existing.specialAttackTimer = inc.specialAttackTimer;
        existing.bossCastName = inc.bossCastName;
        existing.bossCastTimer = inc.bossCastTimer;
        existing.bossCastDuration = inc.bossCastDuration;
        existing.role = inc.role;
        existing.formationId = inc.formationId;
        existing.formationSlotId = inc.formationSlotId;
        existing.eliteModifiers = inc.eliteModifiers;
        existing.guardState = inc.guardState;
        existing.attackProfileId = inc.attackProfileId;
        existing.attackIntent = inc.attackIntent;
        existing.intentSequence = inc.intentSequence;
        existing.roleActionCooldown = inc.roleActionCooldown;
        existing.summonOwnerId = inc.summonOwnerId;
        existing.objectiveEntity = inc.objectiveEntity;
        existing.featureSpriteId = inc.featureSpriteId;
        if (inc.lootDrop !== undefined) existing.lootDrop = inc.lootDrop;
      } else {
        this.engine.enemies.push(inc);
      }
    }

    // Drop anything the host no longer knows about (wave rolled over).
    if (this.engine.enemies.length !== seen.size) {
      this.engine.enemies = this.engine.enemies.filter(e => seen.has(e.id));
    }

    const dungeon = DUNGEONS[this.currentDungeonIndex];
    if (dungeon) {
      const livingCount = this.engine.enemies.filter(e => !e.isDead).length;
      this.syncWaveObjectiveHud(dungeon, livingCount);
    }
  }

  public onSelectLocation(locationId: string, isHost: boolean = true) {
    // The run is starting (or we are heading to town) - the lobby is done.
    this.coopLobby?.close();

    if (locationId === 'town_eldermoor') {
      this.loadTownHub();
      return;
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
      this.loadDungeon(dungeonIdx, isHost);
    }
  }

  public loadDungeon(dungeonIndex: number, broadcastParty: boolean = false) {
    if (!this.engine || this.engine.inTournamentMode) return;
    if (network.isPvpSession || network.isPvpFallback) {
      if (this.tournamentLobby?.isOpen) {
        console.warn('[PVP] Intercepted attempt to load PvE dungeon while in Tournament Lobby; ignoring.');
        return;
      }
      console.warn('[PVP] Intercepted attempt to load PvE dungeon during PvP session! Routing to Tournament Arena.');
      this.triggerTournamentJoinerTransition();
      return;
    }
    this.waveActive = false;
    this.engine.isVictoryOrWaveCleared = false;
    this.engine.isTownMode = false;
    this.hud?.setQuestTrackerInDungeon(true);
    this.engine.player.x = this.engine.isHost ? 260 : 360;
    this.engine.player.y = this.engine.groundY;
    this.engine.player.vx = 0;
    this.engine.player.vy = 0;
    // A fresh tally per run, and one rescue per run: entering the dungeon is
    // where both are reset, not clearing it.
    this.engine.resetRunStats();
    // Teammate reports were only cleared when a summary was drawn, so leaving a
    // dungeon without clearing or dying carried their rows into the next run.
    this.partyStats = {};

    const prevDungeonIndex = this.currentDungeonIndex;
    this.currentDungeonIndex = dungeonIndex % DUNGEONS.length;
    this.engine.currentDungeonIndex = this.currentDungeonIndex;
    const dungeon = DUNGEONS[this.currentDungeonIndex];
    if (dungeon) {
      this.engine.currentDungeonId = dungeon.id;
      this.engine.setBattleTheme(dungeon.theme);
      audio.playDungeonBGM(dungeon.theme);
      if (dungeon.id === 'dragon_lair' || dungeon.theme === 'inferno') {
        const dragonVisual = resolveEnemyVisual('Ancient Red Dragon Ignis');
        if (dragonVisual) sprites.warmPaths(dragonVisual.requiredAssets);
      }
    }

    this.engine.setDungeonEncounterRuntime(this.encounter);
    this.encounter.reset();
    this.runController = null;
    this.runRoomId = null;
    this.pendingDungeonInteraction = null;
    this.runDialogueKey = null;
    this.runSyncAccumulator = 0;
    this.runTickAccumulatorMs = 0;

    if (this.voteWatchdogTimer) {
      window.clearTimeout(this.voteWatchdogTimer);
      this.voteWatchdogTimer = null;
    }
    if (this.waveClearTimer) {
      window.clearTimeout(this.waveClearTimer);
      this.waveClearTimer = null;
    }
    if (this.hostVoteTimer) {
      window.clearTimeout(this.hostVoteTimer);
      this.hostVoteTimer = null;
    }
    if (this.waveCompletionWatchdogTimer) {
      window.clearTimeout(this.waveCompletionWatchdogTimer);
      this.waveCompletionWatchdogTimer = null;
    }
    this.hud?.hideGameModeVotingModal();
    this.dungeonFlowState = 'WAVE_ACTIVE';
    this.isAdvancingRunRoom = false;
    this.isTransitioningWave = false;
    this.activeGameModeModifiers = {};
    this.currentVoteTally.clear();
    this.localVotedModeId = null;

    if (this.engine.isHost || prevDungeonIndex !== this.currentDungeonIndex) {
      this.currentWaveIndex = 0;
      this.engine.currentWaveIndex = 0;
      this.engine.enemies = [];
    }
    
    // Only Host spawns waves
    if (this.engine.isHost) {
      if (!this.initializeDungeonRun(dungeon)) this.spawnNextWave();
      if (broadcastParty && dungeon) {
        Promise.resolve({ network }).then(mod => {
          mod.network.sendPartyNextDungeon(dungeon.id, this.currentDungeonIndex);
        });
      }
    }
  }

  private localRunActorId(): string {
    return network.mySocketId || localStorage.getItem('playerShortId') || 'solo-player';
  }

  private activeRunActorIds(): string[] {
    const activeRemoteIds = Object.entries(network.remotePlayers)
      .filter(([, player]) => player.isTownMode !== true)
      .map(([id]) => id);
    const ids = [this.localRunActorId(), ...activeRemoteIds]
      .filter((id, index, all) => Boolean(id) && all.indexOf(id) === index)
      .sort();
    return ids.slice(0, 8);
  }

  private spriteFile(spriteId: GameplaySpriteId): string {
    return getGameplaySpriteFiles(spriteId)[0] || '';
  }

  /** Starts a seeded, replayable graph. Failure falls back to the legacy waves. */
  private initializeDungeonRun(dungeon?: DungeonDefinition): boolean {
    if (!this.engine || !this.engine.isHost || !dungeon) return false;
    try {
      const actorId = this.localRunActorId();
      const seed = stableHash(`${dungeon.id}:${actorId}:${Date.now()}`);
      const blueprint = {
        ...DEFAULT_DUNGEON_RUN_BLUEPRINT,
        id: `${DEFAULT_DUNGEON_RUN_BLUEPRINT.id}:${dungeon.id}`,
        dungeonId: dungeon.id,
      };
      const generated = generateDungeonRun({
        blueprint,
        content: DUNGEON_RUN_CONTENT,
        seed,
        runId: `run:${dungeon.id}:${seed.toString(16)}`,
      });
      this.runController = DungeonRunController.create(generated, this.activeRunActorIds(), this.runRelics);
      this.configureRunRoom(this.runController.getSnapshot(), true);
      network.sendRunSync(this.runController.getSnapshot(), this.encounter.snapshot());
      return true;
    } catch (error) {
      console.error('[RUN] Deterministic run initialization failed; using endless-wave fallback.', error);
      this.runController = null;
      this.encounter.reset();
      this.engine.setDungeonEncounterRuntime(null);
      return false;
    }
  }

  private applyRunSnapshot(runState: DungeonRunState): void {
    if (!this.engine || this.engine.isHost || !runState) return;
    const current = this.runController?.getSnapshot();
    if (current?.runId === runState.runId && current.revision >= runState.revision) return;
    try {
      this.runController = new DungeonRunController(runState, this.runRelics);
      const changedRoom = this.runRoomId !== runState.currentRoomId;
      this.configureRunRoom(runState, false, changedRoom);
      this.lastEnemySyncAt = performance.now();
    } catch (error) {
      console.warn('[RUN] Rejected incompatible run snapshot.', error);
    }
  }

  /** Applies live host room state after run state, so configureRunRoom cannot overwrite it. */
  private applyEncounterSnapshot(snapshot: DungeonEncounterSnapshot): void {
    if (!this.engine || this.engine.isHost) return;
    const runState = this.runController?.getSnapshot();
    if (runState && snapshot.room.id !== runState.currentRoomId) return;
    try {
      this.encounter.applySnapshot(snapshot);
      this.runRoomId = snapshot.room.id;
      this.engine.setDungeonEncounterRuntime(this.encounter);
      this.lastEnemySyncAt = performance.now();
    } catch (error) {
      console.warn('[RUN] Rejected incompatible encounter snapshot.', error);
    }
  }

  private dispatchRun(command: RunCommandBody, requestImmediateSync = true): boolean {
    if (!this.runController || !this.engine?.isHost) return false;
    const before = this.runController.getStateView();
    const transition = this.runController.dispatch({
      ...command,
      commandId: `${before.runId}:${before.lastCommandSequence + 1}:${command.type}`,
      authorityEpoch: before.authorityEpoch,
      sequence: before.lastCommandSequence + 1,
    } as DungeonRunCommand);
    if (!transition.accepted) {
      console.warn('[RUN] Command rejected:', transition.reason, command);
      return false;
    }
    this.updateRunHud(transition.state);
    this.handleRunEffects(transition.effects);
    if (requestImmediateSync) this.runSyncAccumulator = Math.max(this.runSyncAccumulator, 0.25);
    return true;
  }

  private currentRunNode(state = this.runController?.getStateView()): DungeonRoomNode | null {
    if (!state) return null;
    return state.graph.nodes.find(node => node.id === state.currentRoomId) || null;
  }

  private configureRunRoom(state: DungeonRunState, spawnEnemies: boolean, force = true): void {
    if (!this.engine) return;
    const node = this.currentRunNode(state);
    if (!node) return;
    if (force || this.runRoomId !== node.id) {
      this.runRoomId = node.id;
      this.surviveReinforcementTimer = 0;
      this.surviveSpawnNonce = 0;
      this.runDialogueKey = null;
      this.pendingDungeonInteraction = null;
      this.encounter.configureRoom(node, this.engine.arenaWidth, this.engine.groundY, `${state.seed}:${node.id}`);
      this.engine.setDungeonEncounterRuntime(this.encounter);
      this.engine.onPlayerWorldHit = (area, damage) => {
        if (!this.engine?.isHost || this.engine.isTownMode) return;
        this.consumeEncounterResult(this.encounter.hitWorldObjects(area, damage));
      };
      this.engine.onEnemyDefeatedEvent = null;

      this.currentWaveIndex = Math.max(0, node.depth);
      this.engine.currentWaveIndex = this.currentWaveIndex;
      const dungeon = DUNGEONS[this.currentDungeonIndex];
      if (spawnEnemies && dungeon && node.enemyGroupIds.length > 0) {
        const waveIndex = node.kind === 'boss'
          ? Math.max(0, dungeon.waves.length - 1)
          : node.depth % Math.max(1, dungeon.waves.length);
        this.engine.enemies = spawnWaveEnemies(
          dungeon,
          waveIndex,
          this.engine.arenaWidth,
          this.engine.player.x,
          this.engine.groundY,
        );
        this.currentWaveTotalEnemies = this.engine.enemies.length;
        this.engine.prepareEnemiesForRunRoom(node.kind);
        this.waveActive = true;
        const boss = this.engine.enemies.find(enemy => enemy.type === 'boss');
        if (boss) this.dialogue?.showBossBanner(boss.name, dungeon.subtitle);
        network.sendEnemySync(this.engine.enemies, this.engine.groundY, this.currentWaveIndex, this.currentDungeonIndex, dungeon.id);
      } else if (spawnEnemies) {
        this.engine.enemies = [];
        this.waveActive = Boolean(node.objective);
      }

      if (this.engine.isHost && (node.completion.type === 'party_choice' || node.completion.type === 'actor_choices')) {
        this.showRunRoomChoices();
      } else if (this.engine.isHost && node.objective?.type === 'destroy_nests') {
        this.pendingDungeonInteraction = 'world-object';
      }
      audio.playSlash('heavy');
    }
    this.updateRunHud(state);
  }

  private handleRunEffects(effects: readonly DungeonRunEffect[]): void {
    if (!this.engine || !this.runController) return;
    for (const effect of effects) {
      if (effect.type === 'room_entered') {
        this.configureRunRoom(this.runController.getSnapshot(), true);
      } else if (effect.type === 'choice_resolved') {
        if (effect.effectIds.includes('effect.restore-party')) this.engine.applyPartyPercentHeal(0.25, 'Ancient blessing');
        if (effect.effectIds.includes('effect.roll-treasure')) {
          this.engine.player.gold += 120 + this.currentWaveIndex * 20;
          this.hud?.showToast('Treasure secured');
        }
        if (effect.effectIds.includes('effect.offer-relic')) this.createRunRelicOffer(`choice:${effect.roomId}`);
      } else if (effect.type === 'room_completed') {
        this.waveActive = false;
        const state = this.runController.getSnapshot();
        const node = state.graph.nodes.find(candidate => candidate.id === effect.roomId);
        if (node && (node.kind === 'elite' || node.kind === 'miniboss')) {
          this.createRunRelicOffer(`clear:${effect.roomId}`);
        }
        if (state.status === 'active') {
          const exits = state.graph.exits.filter(exit => exit.fromRoomId === effect.roomId);
          const available = exits.filter(exit => {
            const target = state.graph.nodes.find(candidate => candidate.id === exit.toRoomId);
            return target?.access !== 'secret' || state.revealedSecretRoomIds.includes(target.id);
          });
          if (available.length > 0) {
            this.pendingDungeonInteraction = null;
            this.isAdvancingRunRoom = true;
            const chosenExit = available[Math.floor(Math.random() * available.length)];
            const target = state.graph.nodes.find(candidate => candidate.id === chosenExit.toRoomId);
            const targetName = target ? this.humanize(target.kind) : 'Next Chamber';
            this.hud?.showToast(`Room Cleared! Advancing to ${targetName}...`);
            window.setTimeout(() => {
              this.isAdvancingRunRoom = false;
              if (this.runController?.getSnapshot().status === 'active') {
                this.dispatchRun({ type: 'choose_exit', exitId: chosenExit.id });
              }
            }, 1000);
          }
        }
      } else if (effect.type === 'relic_offer_created') {
        this.showRelicOffer(effect.offer.id);
      } else if (effect.type === 'relic_granted') {
        this.syncRunRelics(this.runController.getSnapshot());
        const relic = this.runRelics.get(effect.relicId);
        this.hud?.showToast(relic ? this.humanize(relic.nameKey) : 'Relic acquired');
      } else if (effect.type === 'secret_revealed') {
        this.hud?.showToast('A secret route has opened');
      } else if (effect.type === 'run_completed') {
        this.pendingDungeonInteraction = null;
        network.sendRunSync(this.runController.getSnapshot(), this.encounter.snapshot());
        network.sendWaveSync({ waveIndex: this.currentWaveIndex, cleared: true });
        this.onDungeonCleared();
      } else if (effect.type === 'run_failed') {
        this.pendingDungeonInteraction = null;
        this.onRunLost();
      }
    }
  }

  private createRunRelicOffer(sourceId: string): void {
    const actorId = this.localRunActorId();
    const state = this.runController?.getSnapshot();
    if (!state || state.relicOffers.some(offer => offer.actorId === actorId && offer.sourceId === sourceId)) return;
    this.dispatchRun({ type: 'create_relic_offer', actorId, sourceId, count: 3 });
  }

  private showRelicOffer(offerId: string): void {
    const state = this.runController?.getSnapshot();
    const offer = state?.relicOffers.find(candidate => candidate.id === offerId && !candidate.chosenRelicId);
    if (!offer || !this.engine?.isHost) return;
    const randomRelicId = offer.relicIds[Math.floor(Math.random() * offer.relicIds.length)];
    const chosenRelic = this.runRelics.get(randomRelicId);
    const relicName = chosenRelic ? this.humanize(chosenRelic.nameKey) : 'Sacred Blessing';
    this.hud?.showToast(`BLESSING GRANTED: ${relicName}!`);
    audio.playLevelUp();
    this.dispatchRun({ type: 'choose_relic', actorId: offer.actorId, offerId: offer.id, relicId: randomRelicId });
  }

  private humanize(key: string): string {
    const last = key.split('.').filter(Boolean).slice(-2, -1)[0] || key;
    return last.split(/[-_]/g).map(word => word ? word[0].toUpperCase() + word.slice(1) : '').join(' ');
  }

  private showRunRoomChoices(): boolean {
    const state = this.runController?.getSnapshot();
    const node = this.currentRunNode(state);
    if (!state || !node || !node.choices.length || !this.engine?.isHost) return false;
    this.pendingDungeonInteraction = null;
    this.runDialogueKey = null;
    const chosenChoice = node.choices[Math.floor(Math.random() * node.choices.length)];
    const choiceName = this.humanize(chosenChoice.titleKey);
    this.hud?.showToast(`Dungeon Blessing: ${choiceName}`);
    this.dispatchRun({ type: 'resolve_room_choice', actorId: this.localRunActorId(), choiceId: chosenChoice.id });
    return true;
  }

  private showRunRouteChoices(): boolean {
    const state = this.runController?.getSnapshot();
    const node = this.currentRunNode(state);
    if (!state || !node || !this.engine?.isHost) return false;
    const runtime = state.roomStates[node.id];
    if (runtime?.status !== 'completed' || state.status !== 'active') return false;
    const exits = state.graph.exits.filter(exit => exit.fromRoomId === node.id);
    if (!exits.length) return false;
    const available = exits.filter(exit => {
      const target = state.graph.nodes.find(candidate => candidate.id === exit.toRoomId);
      return target?.access !== 'secret' || state.revealedSecretRoomIds.includes(target.id);
    });
    if (!available.length) return false;
    this.pendingDungeonInteraction = null;
    const chosenExit = available[Math.floor(Math.random() * available.length)];
    const target = state.graph.nodes.find(candidate => candidate.id === chosenExit.toRoomId);
    const targetName = target ? this.humanize(target.kind) : 'Next Chamber';
    this.hud?.showToast(`Advancing to ${targetName}...`);
    window.setTimeout(() => {
      if (this.runController?.getSnapshot().status === 'active') {
        this.dispatchRun({ type: 'choose_exit', exitId: chosenExit.id });
      }
    }, 800);
    return true;
  }

  private consumeEncounterResult(result: EncounterUpdateResult): void {
    if (!this.engine?.isHost || !this.runController) return;
    for (const damage of result.playerDamage) {
      if (damage.targetId === this.localRunActorId()) {
        this.engine.applyEncounterPlayerDamage(damage.amount, damage.x);
      } else if (network.remotePlayers[damage.targetId]) {
        network.sendPlayerDamage(damage.targetId, {
          hitId: `hazard:${damage.sequence}:${damage.sourceId}`.slice(0, 96),
          rawDamage: damage.amount,
          sourceX: damage.x,
          knockbackDir: damage.x <= network.remotePlayers[damage.targetId].x ? 1 : -1,
          isTownMode: false,
          sceneId: this.engine.networkSceneId,
          parryability: 'dodge-only',
          intentId: `hazard:${damage.sequence}`.slice(0, 96),
          sourceEnemyId: damage.sourceId.slice(0, 160),
          profileId: 'ranged-shot',
        });
      }
    }
    for (const damage of result.enemyDamage) {
      const enemy = this.engine.enemies.find(candidate => candidate.id === damage.targetId && !candidate.isDead);
      if (enemy) this.engine.applyDamageToEnemy(enemy, damage.amount, false, enemy.x >= damage.x ? 1 : -1);
    }
    for (const event of result.objectiveEvents) {
      if (event.type === 'tick') continue;
      this.dispatchRun({ type: 'objective_event', event });
    }
  }

  private updateDungeonRun(dt: number): void {
    if (!this.engine || !this.runController || this.engine.isTownMode) return;
    // This view is owned by the controller and is read-only here. A deep
    // snapshot is created only at the 4 Hz network boundary, not every frame.
    const state = this.runController.getStateView();
    if (this.engine.isHost && state.status === 'active') {
      const actorIds = this.activeRunActorIds();
      if (actorIds.join('|') !== state.activeActorIds.join('|')) {
        this.dispatchRun({ type: 'set_active_actors', actorIds });
      }
      const result = this.encounter.update(dt, {
        localActor: { actorId: this.localRunActorId(), x: this.engine.player.x, y: this.engine.player.y, active: !this.engine.player.downed },
        remoteActors: Object.entries(network.remotePlayers).map(([actorId, player]) => ({ actorId, x: player.x, y: player.y + this.engine!.groundY, active: !player.isTownMode })),
        enemies: this.engine.enemies.map(enemy => ({
          enemyId: enemy.id,
          x: enemy.x,
          y: enemy.y,
          alive: !enemy.isDead,
          objectiveDamagePerSecond: Math.max(12, enemy.atk * 0.18),
        })),
        spawnsSealed: !this.engine.hasPendingEnemyReinforcements(),
      });
      this.consumeEncounterResult(result);
      if (this.runController.getStateView().status !== 'active') return;

      // Objective time is wall-clock time, but reducing/cloning the whole run
      // graph at 60 Hz was one of the largest avoidable combat allocations.
      // Batch the exact accumulated milliseconds into the same 4 Hz cadence as
      // snapshots; maxTickMs still bounds a resumed/background frame.
      this.runTickAccumulatorMs += Math.min(1_000, Math.max(0, dt * 1_000));
      this.runSyncAccumulator += dt;
      if (this.runTickAccumulatorMs >= 250) {
        const elapsedMs = Math.min(1_000, Math.max(1, Math.floor(this.runTickAccumulatorMs)));
        this.runTickAccumulatorMs -= elapsedMs;
        this.dispatchRun({ type: 'advance_time', deltaMs: elapsedMs }, false);
        if (this.runController.getStateView().status !== 'active') return;
      }
      if (this.runSyncAccumulator >= 0.25) {
        this.runSyncAccumulator = 0;
        network.sendRunSync(this.runController.getSnapshot(), this.encounter.snapshot());
      }

      // Watchdog 1: Reconcile Encounter Objective Completion
      const node = this.currentRunNode(state);
      if (node) {
        const runtime = state.roomStates[node.id];
        const livingEnemies = this.engine.enemies.filter(e => !e.isDead && e.hp > 0).length;
        const encSnapshot = this.encounter.snapshot();
        const encSucceeded = encSnapshot?.objectiveStatus === 'succeeded';

        // Continuous Spawning for Survive Objective across all maps:
        // Keep enemies continuously arriving so the player is actively engaged until the timer expires.
        if (node.objective?.type === 'survive' && runtime?.status === 'active' && runtime.objectiveState?.status === 'active' && !encSucceeded) {
          this.surviveReinforcementTimer += dt;
          if (this.engine.isHost && (livingEnemies === 0 || (livingEnemies < 3 && this.surviveReinforcementTimer >= 1.5) || this.surviveReinforcementTimer >= 3.8)) {
            if (livingEnemies < 6) {
              this.surviveReinforcementTimer = 0;
              const count = livingEnemies === 0 ? 3 : 2;
              const dungeon = DUNGEONS[this.currentDungeonIndex];
              if (dungeon) {
                const waveIndex = node.kind === 'boss'
                  ? Math.max(0, dungeon.waves.length - 1)
                  : node.depth % Math.max(1, dungeon.waves.length);
                const reinforcements = spawnSurviveWaveReinforcements(
                  dungeon,
                  waveIndex,
                  this.engine.arenaWidth,
                  this.engine.player.x,
                  this.engine.groundY,
                  count,
                  ++this.surviveSpawnNonce,
                );
                for (const enemy of reinforcements) {
                  this.engine.enemies.push(enemy);
                  this.engine.particles.addFloatingText(enemy.x, enemy.y - 30, 'REINFORCEMENT!', '#f59e0b', true, 12);
                }
                this.engine.prepareEnemiesForRunRoom(node.kind);
                this.currentWaveTotalEnemies = this.engine.enemies.length;
                network.sendEnemySync(this.engine.enemies, this.engine.groundY, this.currentWaveIndex, this.currentDungeonIndex, dungeon.id);
              }
            }
          }
        }

        const isSurviveFinished = node.objective?.type === 'survive'
          && (encSucceeded || ((runtime?.objectiveState as any)?.elapsedMs ?? 0) >= (node.objective?.durationMs ?? 0));

        if (runtime?.status === 'active' && (encSucceeded || isSurviveFinished || (node.objective?.type !== 'survive' && livingEnemies === 0))) {
          if (node.objective && runtime.objectiveState && runtime.objectiveState.status !== 'succeeded') {
            if (node.objective.type === 'destroy_nests') {
              for (const nestId of node.objective.nestObjectIds) {
                this.dispatchRun({ type: 'objective_event', event: { type: 'world_object_destroyed', objectId: nestId } });
              }
            } else if (node.objective.type === 'kill_all' && runtime.objectiveState.type === 'kill_all') {
              if (!runtime.objectiveState.spawnsSealed) {
                this.dispatchRun({ type: 'objective_event', event: { type: 'spawns_sealed' } });
              }
              for (const enemyId of runtime.objectiveState.spawnedEnemyIds) {
                this.dispatchRun({ type: 'objective_event', event: { type: 'enemy_defeated', enemyId } });
              }
            } else if (node.objective.type === 'survive') {
              const remainingMs = Math.max(1, (node.objective.durationMs || 30_000) - (((runtime.objectiveState as any).elapsedMs) || 0));
              this.dispatchRun({ type: 'advance_time', deltaMs: remainingMs });
              // Clear remaining survive mobs cleanly with victory sparks
              for (const enemy of this.engine.enemies) {
                if (!enemy.isDead && enemy.hp > 0) {
                  enemy.hp = 0;
                  enemy.isDead = true;
                  this.engine.particles.playVfx('fx_spark_a', enemy.x, enemy.y - 12, { scale: 1.2 });
                }
              }
            }
          }
        }

        // Watchdog 2: Auto-Advance Completed Rooms (Zero Deadlocks)
        const updatedRuntime = this.runController.getStateView().roomStates[node.id];
        if (updatedRuntime?.status === 'completed' && !this.isAdvancingRunRoom) {
          const exits = state.graph.exits.filter(exit => exit.fromRoomId === node.id);
          const available = exits.filter(exit => {
            const target = state.graph.nodes.find(candidate => candidate.id === exit.toRoomId);
            return target?.access !== 'secret' || state.revealedSecretRoomIds.includes(target.id);
          });
          const chosenExit = available[0] || exits[0];
          if (chosenExit) {
            this.isAdvancingRunRoom = true;
            const target = state.graph.nodes.find(candidate => candidate.id === chosenExit.toRoomId);
            const targetName = target ? this.humanize(target.kind) : 'Next Chamber';
            this.hud?.showToast(node.objective?.type === 'survive' ? `Wave Survived! Advancing to ${targetName}...` : `Room Cleared! Advancing to ${targetName}...`);
            window.setTimeout(() => {
              this.isAdvancingRunRoom = false;
              if (this.runController?.getSnapshot().status === 'active' && this.runController.getSnapshot().currentRoomId === node.id) {
                this.dispatchRun({ type: 'choose_exit', exitId: chosenExit.id });
              }
            }, 800);
          } else if (node.id === state.graph.finaleRoomId) {
            this.isAdvancingRunRoom = true;
            this.onDungeonCleared();
          }
        }
      }
    }
    this.updateRunHud(this.runController.getStateView());
  }

  private updateRunHud(state: DungeonRunState): void {
    this.syncRunRelics(state);
    const node = this.currentRunNode(state);
    if (!node) return;
    const runtime = state.roomStates[node.id];
    const objective = runtime?.objectiveState;
    if (!objective) {
      this.hud?.setDungeonObjective({
        kind: 'kill-all', title: this.humanize(node.kind), progressText: runtime?.status === 'completed' ? 'Complete' : 'Explore',
        complete: runtime?.status === 'completed', spriteId: node.sprites.roomIconSpriteId as GameplaySpriteId,
      });
    } else {
      let current = 0;
      let target = 1;
      let progressText = '';
      let kind: 'kill-all' | 'defend-relic' | 'escort-npc' | 'survive-waves' | 'destroy-nests' | 'timed-escape' = 'kill-all';
      if (objective.type === 'kill_all') {
        current = objective.defeatedEnemyIds.length; target = Math.max(1, objective.spawnedEnemyIds.length); progressText = `${current}/${target} defeated`;
      } else if (objective.type === 'defend_relic') {
        kind = 'defend-relic'; current = objective.elapsedMs; target = node.objective?.type === 'defend_relic' ? node.objective.durationMs : 1; progressText = `Relic ${Math.ceil(objective.targetHp)} HP`;
      } else if (objective.type === 'escort') {
        kind = 'escort-npc'; current = objective.reachedCheckpointIds.length; target = node.objective?.type === 'escort' ? node.objective.checkpointIds.length : 1; progressText = `${current}/${target} checkpoints - ${Math.ceil(objective.hp)} HP`;
      } else if (objective.type === 'survive') {
        kind = 'survive-waves'; current = objective.elapsedMs; target = node.objective?.type === 'survive' ? node.objective.durationMs : 1; progressText = `${Math.ceil((target - current) / 1000)}s remaining`;
      } else if (objective.type === 'destroy_nests') {
        kind = 'destroy-nests'; current = objective.destroyedNestIds.length; target = node.objective?.type === 'destroy_nests' ? node.objective.nestObjectIds.length : 1; progressText = `${current}/${target} nests destroyed`;
      } else if (objective.type === 'timed_escape') {
        kind = 'timed-escape'; current = objective.escapedActorIds.length; target = Math.max(1, objective.activeActorIds.length); const duration = node.objective?.type === 'timed_escape' ? node.objective.durationMs : 0; progressText = `${current}/${target} escaped - ${Math.ceil(Math.max(0, duration - objective.elapsedMs) / 1000)}s`;
      }
      this.hud?.setDungeonObjective({
        kind,
        title: this.humanize(objective.type),
        current,
        target,
        progressPercent: Math.min(100, (current / Math.max(1, target)) * 100),
        progressText,
        complete: objective.status === 'succeeded',
        spriteId: node.sprites.objectiveMarkerSpriteId as GameplaySpriteId,
      });
    }
    const owned = state.relicsByActorId[this.localRunActorId()] || [];
    const counts = new Map<string, number>();
    for (const id of owned) counts.set(id, (counts.get(id) || 0) + 1);
    this.hud?.setDungeonRelics([...counts].map(([id, stacks]) => {
      const relic = this.runRelics.get(id)!;
      return { id, name: this.humanize(relic.nameKey), stacks, spriteId: relic.iconSpriteId as GameplaySpriteId };
    }));
    this.hud?.setDungeonContextAction(this.pendingDungeonInteraction
      ? { label: this.pendingDungeonInteraction === 'route' ? 'ROUTE' : this.pendingDungeonInteraction === 'choice' ? 'CHOOSE' : 'STRIKE OBJECT', spriteId: node.sprites.objectiveMarkerSpriteId as GameplaySpriteId }
      : null);
    const dungeon = DUNGEONS[this.currentDungeonIndex];
    if (dungeon) this.hud?.setWaveInfo(`${dungeon.name} - Room ${node.depth + 1}`, this.engine?.enemies.filter(enemy => !enemy.isDead).length || 0);
  }

  private syncRunRelics(state: DungeonRunState): void {
    if (!this.engine) return;
    const definitions = (state.relicsByActorId[this.localRunActorId()] || [])
      .map(id => this.runRelics.get(id))
      .filter((relic): relic is NonNullable<typeof relic> => Boolean(relic));
    this.engine.setRunRelics(definitions);
  }

  /** "Wave 12" in an endless run; "Wave 2/4" everywhere else. */
  private waveLabel(dungeon: DungeonDefinition): string {
    // The index has already moved on by the time the last wave is cleared, so
    // the banner read "Wave 5/4" on the final one. Endless has no total to
    // exceed, so only the counted kind needs holding at its own length.
    const total = dungeon.waves.length;
    const n = dungeon.endless
      ? this.currentWaveIndex + 1
      : Math.min(this.currentWaveIndex + 1, total);
    if (this.currentWaveIndex + 1 > total) {
      return `${dungeon.name} - Wave ${this.currentWaveIndex + 1}${this.bestEndlessWave ? `  (best ${this.bestEndlessWave})` : ''}`;
    }
    return dungeon.endless
      ? `${dungeon.name} - Wave ${n}${this.bestEndlessWave ? `  (best ${this.bestEndlessWave})` : ''}`
      : `${dungeon.name} - Wave ${n}/${total}`;
  }

  private syncWaveObjectiveHud(dungeon: DungeonDefinition, livingCount?: number): void {
    if (!this.engine || this.runController || this.engine.isTownMode) return;
    const enemies = this.engine.enemies || [];
    const alive = livingCount !== undefined ? livingCount : enemies.filter(e => e.hp > 0 && !e.isDead).length;
    const total = Math.max(1, this.currentWaveTotalEnemies || enemies.length);
    const defeated = Math.max(0, total - alive);
    const hasBoss = enemies.some(e => e.type === 'boss');
    const hasScheduledSpawns = enemies.some(e => (Number(e.spawnDelay) || 0) > 0 || e.isActive === false) || this.engine.hasPendingEnemyReinforcements();
    const isComplete = alive === 0 && !hasScheduledSpawns;

    this.hud?.setWaveInfo(this.waveLabel(dungeon), alive);
    if (enemies.length === 0 && hasScheduledSpawns) {
      this.hud?.setDungeonObjective({
        kind: 'kill-all',
        title: hasBoss ? 'DEFEAT BOSS' : 'KILL ALL',
        current: 0,
        target: 1,
        progressPercent: 0,
        progressText: 'Spawning enemies...',
        complete: false,
      });
    } else {
      this.hud?.setDungeonObjective({
        kind: 'kill-all',
        title: hasBoss ? 'DEFEAT BOSS' : 'KILL ALL',
        current: defeated,
        target: total,
        progressPercent: Math.min(100, (defeated / total) * 100),
        progressText: `${defeated}/${total} defeated`,
        complete: isComplete,
      });
    }
  }

  /**
   * Remembers how deep this account has ever gone.
   *
   * An endless mode with no record is just a treadmill - the number is the
   * whole point of playing it again.
   */
  private recordEndlessDepth(wavesCleared: number) {
    if (wavesCleared <= this.bestEndlessWave) return;
    this.bestEndlessWave = wavesCleared;
    localStorage.setItem('bestEndlessWave', String(wavesCleared));
    this.hud?.showToast(`New record: wave ${wavesCleared}`);
  }

  /**
   * Keeps the level the party sees in step with the real one.
   *
   * This was set once at startup, so every level gained afterwards was invisible
   * to the lobby - a level 11 player showed to their party as whatever they were
   * when the game opened.
   */
  private refreshNetworkProfile() {
    if (!this.engine) return;
    const level = this.engine.player.level;
    const classId = this.engine.player.characterClass.id;
    network.updateProfile({ classId, level, power: this.engine.computePower() });
  }

  private spawnNextWave() {
    if (!this.engine) return;
    const dungeon = DUNGEONS[this.currentDungeonIndex];
    if (!dungeon) return;

    this.dungeonFlowState = 'WAVE_ACTIVE';
    this.isTransitioningWave = false;
    this.waveActive = true;
    this.engine.isVictoryOrWaveCleared = false;

    // Preserves regex for test/endgame.test.mjs:
    // !dungeon.endless && this.currentWaveIndex >= dungeon.waves.length
    if (!dungeon.endless && this.currentWaveIndex >= dungeon.waves.length) {
      this.onDungeonCleared();
      return;
    }

    this.engine.setBattleTheme(dungeon.theme);
    this.engine.currentDungeonIndex = this.currentDungeonIndex;
    this.engine.currentDungeonId = dungeon.id;
    this.engine.currentWaveIndex = this.currentWaveIndex;
    const enemies = spawnWaveEnemies(
      dungeon,
      this.currentWaveIndex,
      this.engine.arenaWidth,
      this.engine.player.x,
      this.engine.groundY,
    );

    // Apply active Game Mode modifiers
    if (this.activeGameModeModifiers.enemyHpMult) {
      const mult = this.activeGameModeModifiers.enemyHpMult;
      for (const enemy of enemies) {
        enemy.maxHp = Math.round(enemy.maxHp * mult);
        enemy.hp = enemy.maxHp;
      }
    }
    if (this.activeGameModeModifiers.enemyAtkMult) {
      const mult = this.activeGameModeModifiers.enemyAtkMult;
      for (const enemy of enemies) {
        enemy.atk = Math.round(enemy.atk * mult);
      }
    }
    if (this.activeGameModeModifiers.goldMult) {
      const mult = this.activeGameModeModifiers.goldMult;
      for (const enemy of enemies) {
        enemy.goldReward = Math.round(enemy.goldReward * mult);
      }
    }
    if (this.activeGameModeModifiers.expMult) {
      const mult = this.activeGameModeModifiers.expMult;
      for (const enemy of enemies) {
        enemy.expReward = Math.round(enemy.expReward * mult);
      }
    }

    if (this.activeGameModeModifiers.healOnKillPct) {
      const healPct = this.activeGameModeModifiers.healOnKillPct;
      this.engine.onEnemyDefeatedEvent = () => {
        if (!this.engine?.player) return;
        const heal = Math.round(this.engine.player.maxHp * healPct);
        this.engine.player.hp = Math.min(this.engine.player.maxHp, this.engine.player.hp + heal);
        this.engine.particles.addFloatingText(this.engine.player.x, this.engine.player.y - 40, `+${heal} HP`, '#4caf50', true, 18);
      };
    } else {
      this.engine.onEnemyDefeatedEvent = null;
    }

    this.engine.enemies = enemies;
    this.currentWaveTotalEnemies = enemies.length;
    audio.playSlash('heavy');

    const bossEnemy = enemies.find(e => e.type === 'boss');
    if (bossEnemy) {
      this.dialogue?.showBossBanner(bossEnemy.name, dungeon.subtitle);
    }

    const aliveEnemies = enemies.filter(e => e.hp > 0 && !e.isDead);
    this.syncWaveObjectiveHud(dungeon, aliveEnemies.length);

    // Immediately broadcast newly spawned wave to party members.
    // This used to be a dynamic import(); when that chunk failed to load the
    // guest never learned a wave had spawned, so its wave counter froze.
    network.sendEnemySync(this.engine.enemies, this.engine.groundY, this.currentWaveIndex, this.currentDungeonIndex, dungeon.id);
    network.sendWaveSync({
      waveIndex: this.currentWaveIndex,
      cleared: false
    });
  }

  /**
   * Every client counts only its own blows, so the party summary has to be
   * assembled from everyone reporting theirs. We send ours, give the others a
   * moment to arrive, then draw whatever showed up - a teammate who dropped
   * out simply does not appear rather than holding up the card.
   */
  private showRunSummary(title: string, subtitle: string, canRematch: boolean) {
    if (!this.engine) return;
    // Cleared, defeated and abandoned runs all end here, so whatever the last
    // one wired up has to be cleared first - otherwise CONTINUE after a defeat
    // would open the victory gateway from the clear before it.
    if (this.runSummary) {
      this.runSummary.onClose = null;
      this.runSummary.onRematch = null;
    }
    const e = this.engine;

    if (network.isPartied) {
      network.sendRunStats({
        name: localStorage.getItem('playerName') || 'Player',
        classId: e.player.characterClass.id,
        damageDealt: Math.round(e.damageDealt),
        damageTaken: Math.round(e.damageTaken),
        kills: e.killCount,
        revives: e.revivesGiven,
      });
    }

    const draw = () => {
      const mine: SummaryRow = {
        socketId: network.mySocketId || 'me',
        isMe: true,
        name: localStorage.getItem('playerName') || 'You',
        classId: e.player.characterClass.id,
        damageDealt: Math.round(e.damageDealt),
        damageTaken: Math.round(e.damageTaken),
        kills: e.killCount,
        revives: e.revivesGiven,
      };
      const rows = [mine, ...Object.values(this.partyStats)];
      this.partyStats = {};
      this.runSummary?.open(rows, title, subtitle, canRematch);
    };

    // Solo has nobody to wait for.
    if (network.isPartied) window.setTimeout(draw, 900);
    else draw();
  }

  private onDungeonCleared() {
    if (!this.engine) return;
    this.waveActive = false;
    this.engine.isVictoryOrWaveCleared = true;
    this.engine.clearCombatHazardsAndNegativeStatuses();
    if (this.engine.isHost) {
      network.sendWaveSync({ waveIndex: this.currentWaveIndex, cleared: true });
    }

    recordEvent('dungeons_cleared');

    // Update max cleared dungeon for progression gating
    if (this.currentDungeonIndex >= (this.engine.player.maxDungeonCleared || 0)) {
      this.engine.player.maxDungeonCleared = this.currentDungeonIndex + 1;
      this.engine.triggerSave();
    }
    
    const dungeon = DUNGEONS[this.currentDungeonIndex];
    if (dungeon) {
      this.hud?.setDungeonObjective({
        kind: 'kill-all',
        title: 'VICTORY',
        current: 1,
        target: 1,
        progressPercent: 100,
        progressText: 'Dungeon Cleared!',
        complete: true,
      });
    }
    audio.playFanfare();
    this.engine.particles.addFloatingText(this.engine.player.x, this.engine.player.y - 60, 'DUNGEON CLEARED!', '#ffd700', true, 28);

    this.showRunSummary(
      'DUNGEON CLEARED',
      dungeon ? dungeon.name : 'Victory',
      true,
    );

    // If final Void Nexus dungeon cleared
    // The gateway is the question "where next", and it only makes sense once
    // you have read what just happened. Both used to open together, so a
    // cleared dungeon put two panels on screen at the same time - one of them
    // half behind the other - and neither said which to answer first.
    const openGateway = () => {
      this.dialogue?.close();
      if (dungeon && dungeon.id === 'void_nexus') {
        this.hud?.showToast('The Void Overlord has fallen! Peace returns to Aethelgard!');
        window.setTimeout(() => this.loadTownHub(true), 1500);
        return;
      }

      window.setTimeout(() => {
        const nextDungeon = DUNGEONS[this.currentDungeonIndex + 1];
        if (!nextDungeon) {
          this.hud?.showToast('All realms cleansed! Returning to Town Hub...');
          this.loadTownHub(true);
          return;
        }
        const requiredLevel = nextDungeon.minLevel || 1;
        if (this.engine!.player.level < requiredLevel) {
          this.hud?.showToast(`Lv. ${requiredLevel} Required for ${nextDungeon.name}! Returning to Town...`);
          this.loadTownHub(true);
          return;
        }
        this.hud?.showToast(`Cleansed ${dungeon ? dungeon.name : 'Realm'}! Advancing to ${nextDungeon.name}...`);
        this.loadDungeon(this.currentDungeonIndex + 1, true);
      }, 1500);
    };

    // Rematch goes straight back in, so it never asks where to go next.
    if (this.runSummary) {
      this.runSummary.onClose = openGateway;
      this.runSummary.onRematch = () => this.loadDungeon(this.currentDungeonIndex, true);
    }
  }

  /** Say a canned line: shown over our own head at once, and sent to the party. */
  public sayQuickChat(lineId: string) {
    if (!this.engine) return;
    this.engine.showChatBubble('me', lineId);
    network.sendQuickChat(lineId);
  }

  /** Drop a marker where we are standing, for pointing at something. */
  public dropPing() {
    if (!this.engine) return;
    const { x, y } = this.engine.player;
    this.engine.addPing(x, y);
    network.sendPing(x, y);
  }

  /**
   * One full screen at a time.
   *
   * Screens used to close each other by hand at each call site, so the routes
   * that remembered worked and the routes that forgot left two stacked. Opening
   * co-op from the world map was one of those: the lobby opened underneath the
   * map, and you had to close the map yourself to reach the thing you had just
   * asked for. Every route goes through here now, so a new screen cannot be
   * added without inheriting the rule.
   */
  public showScreen(which: 'map' | 'lobby' | 'none') {
    if (which !== 'map') this.worldMap?.close();
    if (which !== 'lobby') {
      this.coopLobby?.close();
      this.tournamentLobby?.close();
    }
    this.hud?.closePanels();

    if (which === 'map') {
      this.worldMap?.open(
        this.engine?.player.maxDungeonCleared || 0,
        this.engine?.player.level || 1,
      );
    } else if (which === 'lobby') {
      if (network.isPvpSession || network.isPvpFallback) {
        this.openTournamentLobby();
      } else {
        this.coopLobby?.open();
      }
    }
  }

  public interactWithActiveNpc() {
    if (!this.engine || !this.townHub || !this.dialogue || !this.engine.isTownMode) return;
    const activeNpc = this.townHub.getActiveNpc();
    if (activeNpc) {
      this.townHub.interactWithNpc(activeNpc, this.engine, this.dialogue, () => {
        this.showScreen('map');
      }, () => {
        this.openTournamentLobby();
      });
    }
  }

  public openTournamentLobby(): void {
    if (!this.engine) return;
    network.isPvpSession = true;
    if (!this.tournamentLobby) {
      this.tournamentLobby = new TournamentLobbyUI(this.container, this.engine, (match) => {
        this.startTournamentMatch(match);
      });
    }
    this.tournamentLobby.open();
  }

  public triggerTournamentJoinerTransition(extraSyncData?: any): void {
    if (!this.engine || this.engine.inTournamentMode) return;
    // The host's match begins with its own START, which the server turns into
    // dungeon_start for the room. A fallback packet must never launch the host.
    if (this.engine.isHost) return;
    console.log('[PVP] Auto-correcting Joiner from PvE Dungeon into Colosseum PvP Arena...');
    network.isPvpSession = true;
    network.isPvpFallback = true;
    this.tournamentLobby?.close();
    this.worldMap?.close();
    this.dialogue?.close();
    this.coopLobby?.close();

    const pvpFmt = (extraSyncData?.pvpFormat || this.tournamentLobby?.currentFormat || network.currentLobbyState?.pvpFormat || '1v1') as any;
    const matchTheme = (extraSyncData?.arenaTheme === 'tournament_arena' || extraSyncData?.dungeonId === 'tournament_arena' || extraSyncData?.theme === 'tournament_arena')
      ? 'tournament_arena'
      : 'tournament_colosseum';

    const match = new TournamentMatch({
      format: pvpFmt,
      roundsToWin: 2,
      roundDurationSec: PVP_ROUND_DURATION_SEC,
      mapTheme: matchTheme,
    });

    const localActorId = network.getActorId();
    const members = network.currentLobbyState?.members || [];
    const teams = extraSyncData?.pvpTeams || network.currentLobbyState?.pvpTeams;
    const myMember = members.find((m: any) => (m.actorId === localActorId || m.uuid === localActorId || m.socketId === network.socket?.id));
    const assignedTeam = (teams && teams[localActorId])
      || myMember?.team
      || (network.isHost ? 'red' : 'blue');

    const spectating = myMember?.seat === 'spectator';
    this.engine.pvpTeam = assignedTeam;
    match.setupTeamsFromLobby(members as any, localActorId, pvpFmt, teams, assignedTeam);

    for (const sid of Object.keys(network.remotePlayers)) {
      const r = network.remotePlayers[sid];
      if (r) {
        r.team = (teams && r.actorId && teams[r.actorId])
          || r.team
          || (r.actorId === localActorId ? assignedTeam : (assignedTeam === 'red' ? 'blue' : 'red'));
      }
    }

    this.startTournamentMatch(match, spectating);
  }

  /**
   * Show the post-match card and bank the spoils.
   *
   * Payout happens here, once, when the card is built - not in the old timer
   * that ran while the arena was already tearing down, where a dropped frame
   * or a scene change could skip the reward entirely.
   */
  private presentPvpResults(summary: PvpMatchSummary): void {
    if (!this.engine) return;
    this.pvpResults?.close();

    // A spectator did not fight, so the bout is not theirs to win or lose:
    // no record entry, no streak break, no purse. They still get the card,
    // because the scoreboard is the point of watching.
    const spectating = this.engine.pvpObserver;
    const settlement = spectating
      ? {
          record: loadPvpRecord(),
          rewards: { base: 0, rounds: 0, mvp: 0, streak: 0, firstWin: 0, total: 0 },
          title: pvpTitleFor(loadPvpRecord()),
          newTitle: null as string | null,
        }
      : settlePvpMatch(loadPvpRecord(), summary);
    if (!spectating) savePvpRecord(settlement.record);
    if (settlement.rewards.total > 0) {
      this.engine.player.gold += settlement.rewards.total;
      // Gold is on the save whitelist; without this the purse shown on the
      // card and the purse in the next session would disagree.
      this.engine.triggerSave();
    }

    // The vote is the fighters': a bench spectator neither votes nor counts.
    const members = (network.currentLobbyState?.members || []).filter(m => m.seat !== 'spectator').length;
    const canRematch = Boolean(network.room) && members >= 2;
    const needed = canRematch ? members : 0;

    const localRow = summary.rows.find(row => row.isLocal);
    const localName = localRow?.name || this.engine.player.name || 'Champion';

    this.pvpResults = new PvpResultsUI(
      this.container,
      {
        summary,
        record: settlement.record,
        rewards: settlement.rewards,
        title: settlement.title,
        newTitle: settlement.newTitle,
        localName,
        spectator: spectating,
      },
      (action) => this.handlePvpResultsAction(action),
      {
        onVote: () => network.sendPvpRematchVote(),
      },
    );
    this.pvpResults.open();
    this.pvpResults.setRematchState({ votes: 0, total: needed, needed, started: false });
    // The lobby snapshot can be a beat stale; the server's headcount is the
    // one the vote actually has to satisfy.
    if (canRematch) network.requestPvpRematchState();

    if (spectating) audio.playCrowdCheer(0.7);
    else if (summary.localWon) audio.playVictory();
    else audio.playCrowdCheer(0.5);
  }

  private handlePvpResultsAction(action: PvpResultsAction): void {
    if (!this.engine) return;
    this.pvpResults?.close();
    this.pvpResults = null;

    if (action === 'rematch') {
      // Kept for completeness; the card casts a vote instead so a lone player
      // cannot restart a room everyone else has left.
      network.sendPvpRematchVote();
      return;
    }

    if (action === 'lobby') {
      this.engine.endTournament();
      network.leaveLobby();
      // Let the leave round-trip before creating a fresh room; otherwise the
      // server still sees this socket seated in the old one.
      window.setTimeout(() => {
        this.openTournamentLobby();
      }, 320);
      return;
    }

    this.engine.endTournament();
    network.leaveLobby();
  }

  public startTournamentMatch(match: TournamentMatch, spectating = false): void {
    if (!this.engine) return;
    // A rematch arrives as a second dungeon_start. Drop the previous match's
    // card and arena state first, or the new round would start behind it.
    this.pvpResults?.close();
    this.pvpResults = null;
    if (this.engine.inTournamentMode) this.engine.endTournament(false);
    // Set after any teardown: ending the old match clears the bench flag.
    this.engine.setPvpObserver(spectating);
    network.isPvpSession = true;
    network.isPvpFallback = true;
    this.waveActive = false;
    this.engine.isVictoryOrWaveCleared = false;
    this.engine.isTownMode = false;
    this.runController = null;
    this.runRoomId = null;
    this.encounter.reset();

    if (this.voteWatchdogTimer) {
      window.clearTimeout(this.voteWatchdogTimer);
      this.voteWatchdogTimer = null;
    }
    if (this.waveClearTimer) {
      window.clearTimeout(this.waveClearTimer);
      this.waveClearTimer = null;
    }
    if (this.hostVoteTimer) {
      window.clearTimeout(this.hostVoteTimer);
      this.hostVoteTimer = null;
    }
    if (this.waveCompletionWatchdogTimer) {
      window.clearTimeout(this.waveCompletionWatchdogTimer);
      this.waveCompletionWatchdogTimer = null;
    }

    this.hud?.setQuestTrackerInDungeon(false);
    this.hud?.setDungeonObjective(null);
    this.hud?.setDungeonRelics([]);
    this.hud?.setDungeonContextAction(null);
    this.hud?.setWaveInfo(`COLOSSEUM - ${match.config.format.toUpperCase()}`, match.fighters.filter(f => f.team === 'blue').length);

    // The host owns the round simulation; its settled rounds are mirrored to
    // the server so both sides score from one board and a clock-expired round
    // (which produces no death packet) still counts.
    this.engine.onPvpRoundResolved = (record) => {
      if (network.isHost) network.sendPvpRoundReport(record);
    };

    this.engine.startTournament(match);
    this.hud?.setPvpMode(true);
    audio.playDungeonBGM();
    this.hud?.showToast(`Tournament Arena: ${match.config.format.toUpperCase()} Match Started!`);

    // Host periodically emits PvP handshake to keep all joiners synced
    if (network.isHost) {
      if (this.tournamentHostBroadcastInterval) {
        window.clearInterval(this.tournamentHostBroadcastInterval);
      }
      this.tournamentHostBroadcastInterval = window.setInterval(() => {
        if (this.engine?.inTournamentMode && network.isHost && network.room) {
          network.broadcastPvpHandshake('tournament_colosseum', match.config.format, 'match');
        }
      }, 1500);
    }
  }

  private interactInDungeon(): boolean {
    if (!this.engine || this.engine.isTownMode) return false;
    // A held rescue always wins over a tap-only room action or parry.
    if (this.engine.nearestDownedAlly()) return true;
    if (this.pendingDungeonInteraction === 'choice') {
      this.runDialogueKey = null;
      if (this.showRunRoomChoices()) return true;
    }
    if (this.pendingDungeonInteraction === 'route') {
      this.runDialogueKey = null;
      if (this.showRunRouteChoices()) return true;
    }
    if (this.pendingDungeonInteraction === 'world-object' && this.engine.isHost) {
      const result = this.encounter.hitWorldObjects({
        x: this.engine.player.x + this.engine.player.facing * 46,
        y: this.engine.player.y - 24,
        radius: 82,
        sourceId: this.localRunActorId(),
      }, Math.max(35, this.engine.player.totalAtk * 1.5));
      this.consumeEncounterResult(result);
      return result.worldDamage.length > 0;
    }
    return this.engine.parryPlayer();
  }

  /** Current control context. Gameplay actions cannot leak through a modal. */
  private resolveInputContext(): InputContext {
    if (this.dialogue?.isOpen || this.coopLobby?.isOpen || this.tournamentLobby?.isOpen || this.hud?.isInputBlocking()) return 'menu';
    if (this.container.querySelector(
      '.world-map-modal, .quest-log-modal, .lb-backdrop, .rs-back, .dialogue-modal-backdrop, .tournament-lobby-modal',
    )) return 'menu';
    return 'gameplay';
  }

  private handleInputAction(event: InputActionEvent): void {
    if (event.phase !== 'pressed' || !this.engine) return;

    const skillIndex = skillIndexForAction(event.action);
    if (skillIndex !== null) {
      this.engine.castSkill(skillIndex);
      return;
    }

    switch (event.action) {
      case 'basicAttack':
        this.engine.castSkill(0);
        break;
      case 'interact':
        if (this.engine.isTownMode) this.interactWithActiveNpc();
        else this.interactInDungeon();
        break;
      case 'quickHeal': {
        const result = this.engine.quickHeal();
        if (result === 'none') this.hud?.showToast('No healing potions');
        else if (result === 'full') this.hud?.showToast('Already at full health');
        else if (result === 'blocked') this.hud?.showToast('Cannot heal while downed');
        this.hud?.refreshPotionSlot();
        break;
      }
      case 'jump':
        this.engine.jumpPlayer(this.input.router.isHeld('moveDown'));
        break;
      case 'dash':
        this.engine.dashPlayer();
        break;
      case 'questLog':
        this.hud?.questLogUI?.toggle();
        break;
      case 'worldMap':
        if (this.container.querySelector('.world-map-modal')) this.worldMap?.close();
        else this.showScreen('map');
        break;
      case 'returnTown':
        audio.playTeleport();
        this.loadTownHub();
        break;
      case 'menuToggle':
        this.hud?.togglePauseMenu();
        break;
      case 'menuCancel':
        // The lobby owns Escape and has its own close/leave confirmation.
        if (this.coopLobby?.isOpen) break;
        if (this.container.querySelector('.world-map-modal')) this.worldMap?.close();
        else if (this.container.querySelector('.quest-log-modal')) this.hud?.questLogUI?.close();
        else if (this.container.querySelector('.rs-back')) this.runSummary?.close();
        else this.hud?.closeTopInputPanel();
        break;
      case 'menuConfirm':
        if (this.dialogue?.isOpen) this.dialogue.advanceText();
        else this.hud?.navigateMenu('confirm');
        break;
      case 'menuUp':
      case 'menuDown':
      case 'menuLeft':
      case 'menuRight':
        this.hud?.navigateMenu(event.action.slice(4).toLowerCase() as 'up' | 'down' | 'left' | 'right');
        break;
      case 'chatToggle':
        this.hud?.toggleQuickChat();
        break;
      case 'chatCancel':
        this.hud?.closeQuickChat();
        break;
      // Text fields keep their native Enter behavior. The action exists so a
      // future network chat composer can subscribe without bypassing contexts.
      case 'chatSubmit':
      case 'moveLeft':
      case 'moveRight':
      case 'moveDown':
        break;
    }
  }

  private setupInputListeners() {
    if (this.inputListenersReady) return;
    this.inputListenersReady = true;
    this.input.start(window);
    // Canvas attack remains mouse/pen only. Touch players use the large attack
    // button, so laying a finger on the world cannot fire through the HUD.
    this.input.bindElement(this.canvas, 'basicAttack', {
      pointerTypes: ['mouse', 'pen'],
      mouseButton: 0,
    });
    // The same physical canvas gesture means "next" while dialogue owns the
    // input context. Exactly one of these two actions is accepted at a time.
    this.input.bindElement(this.canvas, 'menuConfirm', {
      pointerTypes: ['mouse', 'pen'],
      mouseButton: 0,
    });
  }

  /**
   * Spectator controls: drag to pan, pinch or scroll to zoom, and a handful
   * of keys for desktop. Everything is capture-phase on the window and gated
   * on the canvas being the target, so a drag can never also count as an
   * attack click and the HUD keeps its own pointer handling.
   */
  private setupSpectatorCameraInput(): void {
    const canvas = this.canvas;
    const spectating = () => Boolean(this.engine?.pvpSpectating);
    const onCanvas = (event: Event) => event.target === canvas;

    window.addEventListener('pointerdown', (event: PointerEvent) => {
      if (!spectating() || !onCanvas(event)) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      this.spectatorPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.spectatorPointers.size === 2) this.spectatorPinchDistance = this.spectatorPointerDistance();
      event.preventDefault();
      event.stopPropagation();
    }, { capture: true, passive: false });

    window.addEventListener('pointermove', (event: PointerEvent) => {
      if (!spectating()) return;
      const previous = this.spectatorPointers.get(event.pointerId);
      if (!previous) return;
      this.spectatorPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (this.spectatorPointers.size >= 2) {
        const distance = this.spectatorPointerDistance();
        if (this.spectatorPinchDistance > 0 && distance > 0 && this.engine) {
          this.engine.setSpectatorZoom(this.engine.spectatorZoom * (distance / this.spectatorPinchDistance));
        }
        this.spectatorPinchDistance = distance;
      } else {
        const dx = event.clientX - previous.x;
        if (dx !== 0) this.engine?.panSpectatorCameraBy(dx);
      }
      event.preventDefault();
      event.stopPropagation();
    }, { capture: true, passive: false });

    // The attack binding listens for clicks, and a drag ends in one. While
    // spectating the canvas is a camera surface, not a weapon.
    window.addEventListener('click', (event: MouseEvent) => {
      if (!spectating() || !onCanvas(event)) return;
      event.preventDefault();
      event.stopPropagation();
    }, { capture: true });

    const release = (event: PointerEvent) => {
      if (!this.spectatorPointers.delete(event.pointerId)) return;
      if (this.spectatorPointers.size < 2) this.spectatorPinchDistance = 0;
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);

    window.addEventListener('wheel', (event: WheelEvent) => {
      if (!spectating() || !onCanvas(event)) return;
      this.engine?.nudgeSpectatorZoom(wheelZoomSteps(event.deltaY, event.deltaMode));
      event.preventDefault();
    }, { passive: false });

    window.addEventListener('keydown', (event: KeyboardEvent) => {
      if (!spectating()) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(input|textarea|select)$/i.test(target.tagName)) return;
      switch (event.code) {
        case 'ArrowLeft':
        case 'KeyA':
        case 'ArrowRight':
        case 'KeyD':
          this.spectatorKeys.add(event.code);
          event.preventDefault();
          break;
        case 'Equal':
        case 'NumpadAdd':
          this.engine?.nudgeSpectatorZoom(1);
          event.preventDefault();
          break;
        case 'Minus':
        case 'NumpadSubtract':
          this.engine?.nudgeSpectatorZoom(-1);
          event.preventDefault();
          break;
        case 'KeyP':
          if (!event.repeat) this.engine?.toggleSpectatorPause();
          this.syncSpectatorBar();
          break;
        case 'KeyF':
          if (!event.repeat) this.engine?.toggleSpectatorFollow();
          break;
        case 'KeyQ':
          if (!event.repeat) this.engine?.cycleSpectateTarget(-1);
          break;
        case 'KeyE':
          if (!event.repeat) this.engine?.cycleSpectateTarget(1);
          break;
      }
    });
    window.addEventListener('keyup', (event) => { this.spectatorKeys.delete(event.code); });
    window.addEventListener('blur', () => this.spectatorKeys.clear());
  }

  private spectatorPointerDistance(): number {
    const [a, b] = Array.from(this.spectatorPointers.values());
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  /** Keep the spectator bar in step with the engine once per frame. */
  private syncSpectatorBar(): void {
    const engine = this.engine;
    const bar = this.spectatorBar;
    if (!engine || !bar) return;
    if (!engine.pvpSpectating) {
      bar.close();
      return;
    }
    bar.open();
    bar.setState({
      targetName: engine.spectateTargetName(),
      targetTeam: engine.spectateTargetTeam() || engine.pvpTeam,
      mode: engine.spectatorMode,
      zoom: engine.spectatorZoom,
      canPause: engine.pvpCanPause,
      paused: engine.pvpPaused,
    });
  }

  /** Compatibility bridge for the existing HUD while movement is normalized. */
  public get touchMoveDir(): number {
    return this.input.router.moveAxis();
  }

  public set touchMoveDir(value: number) {
    this.input.router.setAxis('touch:joystick', value);
  }

  /** Compatibility bridge for hold-to-revive. */
  public get touchReviveHeld(): boolean {
    return this.input.router.isHeld('interact');
  }

  public set touchReviveHeld(held: boolean) {
    const token = 'touch:revive';
    if (held) this.input.press('interact', 'touch', token);
    else this.input.release('interact', 'touch', token);
  }

  /** HUD adapter: one semantic action regardless of pointer implementation. */
  public bindInputAction(element: HTMLElement, action: InputAction, options: PointerBindingOptions = {}): () => void {
    return this.input.bindElement(element, action, options);
  }

  public triggerInputAction(action: InputAction): boolean {
    return this.input.tap(action, 'ui');
  }

  public inputBindingLabel(action: InputAction, device: 'keyboard' | 'gamepad' = 'keyboard'): string {
    return this.input.bindingLabel(action, device);
  }

  public remapInput(
    device: 'keyboard' | 'gamepad',
    action: InputAction,
    binding: string | number,
    replaceConflict = false,
  ) {
    return device === 'keyboard'
      ? this.input.remap(device, action, String(binding), replaceConflict ? 'replace' : 'reject')
      : this.input.remap(device, action, Number(binding), replaceConflict ? 'replace' : 'reject');
  }

  public setInputAccessibility(patch: Partial<InputAccessibilityPreferences>) {
    return this.input.setAccessibility(patch, this.container);
  }

  /** Duration of the frame just run, for input that accumulates over time. */
  private lastFrameDt = 0;

  private processContinuousInput() {
    if (!this.engine) return;
    this.engine.movePlayer(this.input.router.moveAxis());

    // Reviving shares the interact key with talking to an NPC - there are no
    // NPCs in a dungeon, so the two never compete. Held, not tapped: a rescue
    // that costs nothing is not a rescue.
    const holding = this.input.router.isHeld('interact');
    this.engine.updateRevive(this.lastFrameDt, holding);
  }

  private gameLoop(timestamp: number) {
    if (!this.engine || !this.isRunning) return;
    this.animationFrameId = requestAnimationFrame(this.boundGameLoop);

    const rawDt = Math.max(0, (timestamp - this.lastTime) / 1000);
    const dt = Math.min(rawDt, 0.1);
    this.lastFrameDt = dt;
    this.lastTime = timestamp;

    try {
      this.input.refreshContext();
      this.input.pollGamepads();
      this.processContinuousInput();
      const preferences = this.input.preferences.snapshot();

      if (this.engine) {
        this.engine.setVisualPreferences(preferences);
        // Quality decisions use wall-clock frame cost, not ultimate-slowed
        // simulation time, otherwise the busiest effects masquerade as fast.
        this.engine.particles.recordFrameTime(rawDt * 1000);
        this.syncRenderResolution();
        // Held keys move the free spectator camera before the world steps, so
        // the shot eases from where the player left it.
        const panAxis =
          (this.spectatorKeys.has('ArrowRight') || this.spectatorKeys.has('KeyD') ? 1 : 0)
          - (this.spectatorKeys.has('ArrowLeft') || this.spectatorKeys.has('KeyA') ? 1 : 0);
        if (panAxis !== 0 && this.engine.pvpSpectating) {
          this.engine.panSpectatorCamera(panAxis * SPECTATOR_VIEW.keyPanSpeed * dt);
        }

        this.engine.update(dt);
        if (!this.engine.isTownMode && this.runController) this.updateDungeonRun(dt);
        // Smooth network snapshots into render positions once per active
        // frame. Rendering reads these interpolated coordinates directly.
        // A paused practice bout is frozen, so nothing is interpolated either.
        if (!this.engine.pvpPaused) network.updateRemotePlayers(dt);
        this.syncSpectatorBar();

        // In Town Mode: update NPC proximity + Portal auto-detection
        if (this.engine.isTownMode && this.townHub) {
          this.townHub.update(this.engine.player.x, this.engine.player.y);

          // --- Portal Proximity Auto-Detection ---
          const portalDist = Math.abs(this.engine.player.x - this.engine.portalX);
          const wasNear = this.engine.isPlayerNearPortal;
          this.engine.isPlayerNearPortal = portalDist < 100;

          // Auto-open WorldMap when player enters portal zone.
          // Never while partied: picking a dungeon here calls createLobby, which
          // used to split the guest into their own room and silently break the
          // whole run. The host drives where the party goes.
          if (this.engine.isPlayerNearPortal && !wasNear && !this.dialogue?.isOpen && !network.isPartied) {
            this.showScreen('map');
          }
          // Auto-close WorldMap when player leaves portal zone
          if (!this.engine.isPlayerNearPortal && wasNear) {
            this.worldMap?.close();
          }
        }

        // In Dungeon Mode: check wave progression
        if (!this.engine.isTownMode && !this.engine.inTournamentMode) {
          const livingEnemies = this.engine.enemies.filter(e => !e.isDead);
          const aliveEnemies = this.engine.enemies.filter(e => e.hp > 0 && !e.isDead);
          const enemiesRemaining = aliveEnemies.length;
          const hasScheduledSpawns = this.engine.enemies.some(e => (Number(e.spawnDelay) || 0) > 0 || e.isActive === false) || this.engine.hasPendingEnemyReinforcements();
          const dungeon = DUNGEONS[this.currentDungeonIndex];
          if (dungeon && !this.runController) {
            this.syncWaveObjectiveHud(dungeon, enemiesRemaining);

            // Guest watchdog: if the host's state stream goes quiet we have
            // most likely been dropped from the room (mobile reconnect). Ask
            // for a fresh snapshot instead of sitting in an empty dungeon.
            if (!this.engine.isHost && network.room) {
              const now = performance.now();
              const stale = now - this.lastEnemySyncAt > 2000;
              const cooledDown = now - this.lastResyncRequestAt > 3000;
              if (stale && cooledDown) {
                this.lastResyncRequestAt = now;
                console.warn('[NET] No host state for >2s - requesting full sync.');
                network.requestFullSync();
              }
            }

            // Fail-safe watchdog: if living enemies reach 0 during WAVE_ACTIVE, never let the dungeon freeze
            if (!this.runController && this.engine.isHost && this.waveActive && this.dungeonFlowState === 'WAVE_ACTIVE' && !this.isTransitioningWave && enemiesRemaining === 0) {
              if (!this.waveCompletionWatchdogTimer) {
                this.waveCompletionWatchdogTimer = window.setTimeout(() => {
                  this.waveCompletionWatchdogTimer = null;
                  if (this.engine?.isHost && this.waveActive && this.dungeonFlowState === 'WAVE_ACTIVE' && !this.isTransitioningWave) {
                    const currentAlive = this.engine.enemies.filter(e => e.hp > 0 && !e.isDead).length;
                    if (currentAlive === 0) {
                      console.warn('[Dungeon] Watchdog: 0 living enemies remaining, clearing phantom entities and force-advancing wave');
                      this.engine.enemies = [];
                      this.isTransitioningWave = true;
                      this.handleWaveActiveComplete();
                    }
                  }
                }, 1800);
              }
            } else if (enemiesRemaining > 0 && this.waveCompletionWatchdogTimer) {
              window.clearTimeout(this.waveCompletionWatchdogTimer);
              this.waveCompletionWatchdogTimer = null;
            }

            // Bulletproof wave progression with sequential state machine:
            // 1. WAVE_ACTIVE: Checks enemiesRemaining === 0 AND all scheduled spawns have finished.
            // 2. isTransitioningWave lock flag prevents duplicate triggers from simultaneous kills.
            if (!this.runController && this.engine.isHost && this.waveActive && this.dungeonFlowState === 'WAVE_ACTIVE' && !this.isTransitioningWave && enemiesRemaining === 0 && !hasScheduledSpawns) {
              if (this.waveCompletionWatchdogTimer) {
                window.clearTimeout(this.waveCompletionWatchdogTimer);
                this.waveCompletionWatchdogTimer = null;
              }
              this.isTransitioningWave = true;
              this.handleWaveActiveComplete();
            }
          }
        }

        this.hud?.update();
        this.networkProfileRefreshTimer -= dt;
        if (this.networkProfileRefreshTimer <= 0) {
          this.networkProfileRefreshTimer = 0.5;
          this.refreshNetworkProfile();
        }
        this.coopDebug?.update(rawDt, this.engine, this.currentWaveIndex, this.currentDungeonIndex);
      }

      // Render Canvas. Draw in CSS-pixel space scaled up to the device-pixel
      // backing store, with smoothing off so pixel art stays crisp.
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.ctx.imageSmoothingEnabled = false;
      this.ctx.clearRect(0, 0, this.viewWidth, this.viewHeight);
      if (this.engine) {
        if (!preferences.screenShake) {
          this.engine.particles.screenShakeTime = 0;
          this.engine.particles.screenShakeMagnitude = 0;
        }
        if (!preferences.screenFlashes) this.engine.particles.screenFlashes.length = 0;
        this.engine.render(this.ctx, this.viewWidth, this.viewHeight);
      }
    } catch (err) {
      console.error('GameLoop Error:', err);
    }
  }

  /**
   * Phase 2: WAVE_CLEARED - brief 1.5s celebration / cleanup
   */
  private handleWaveActiveComplete(): void {
    if (!this.engine || !this.engine.isHost) return;
    this.dungeonFlowState = 'WAVE_CLEARED';
    this.waveActive = false;
    this.engine.isVictoryOrWaveCleared = true;
    this.engine.clearCombatHazardsAndNegativeStatuses();

    // Record depth reached
    this.recordEndlessDepth(this.currentWaveIndex + 1);

    // Broadcast wave cleared to guests
    network.sendWaveSync({
      waveIndex: this.currentWaveIndex,
      cleared: false,
    });

    audio.playFanfare();
    this.hud?.showToast('Wave Cleared!');

    if (this.waveCompletionWatchdogTimer) {
      window.clearTimeout(this.waveCompletionWatchdogTimer);
      this.waveCompletionWatchdogTimer = null;
    }
    if (this.waveClearTimer) {
      window.clearTimeout(this.waveClearTimer);
    }
    const dungeon = DUNGEONS[this.currentDungeonIndex];
    if (dungeon && !dungeon.endless && (this.currentWaveIndex + 1) >= dungeon.waves.length) {
      // Final wave of dungeon defeated: celebrate with fanfare and advance to victory
      this.waveClearTimer = window.setTimeout(() => {
        this.waveClearTimer = null;
        this.currentWaveIndex++;
        this.onDungeonCleared();
      }, 1500);
      return;
    }
    // Strict Dungeon State Machine Phase 2: 1.5s celebration / cleanup
    this.waveClearTimer = window.setTimeout(() => {
      this.waveClearTimer = null;
      this.initiateGameModeVoting();
    }, 1500);
  }

  /**
   * Phase 3: GAMEMODE_VOTING - 5-second synchronized countdown
   * Host selects 3 options and broadcasts START_GAMEMODE_VOTE to all players.
   */
  private initiateGameModeVoting(): void {
    if (!this.engine || !this.engine.isHost) return;
    this.dungeonFlowState = 'GAMEMODE_VOTING';
    const seed = stableHash(`${this.currentDungeonIndex}:${this.currentWaveIndex}:${Date.now()}`);
    const options = selectThreeGameModes(seed);
    this.activeVotingOptions = options;
    this.currentVoteTally.clear();
    this.localVotedModeId = null;

    const duration = 5000;
    const endTime = Date.now() + duration;
    const nextWave = this.currentWaveIndex + 1;

    const packet: StartGameModeVotePacket = {
      options,
      duration,
      endTime,
      nextWave,
    };

    // Broadcast START_GAMEMODE_VOTE event to ALL players in the dungeon lobby simultaneously
    network.sendStartGameModeVote(packet);

    // Start local voting UI and timer
    this.startVotingFlow(packet);

    // Host timer for the strict 5-second countdown
    if (this.hostVoteTimer) {
      window.clearTimeout(this.hostVoteTimer);
    }
    this.hostVoteTimer = window.setTimeout(() => {
      this.hostVoteTimer = null;
      if (this.dungeonFlowState === 'GAMEMODE_VOTING') {
        this.resolveHostVote();
      }
    }, duration);
  }

  private handleIncomingStartVote(packet: StartGameModeVotePacket): void {
    if (!this.engine || this.engine.isHost) return;
    this.dungeonFlowState = 'GAMEMODE_VOTING';
    this.activeVotingOptions = packet.options;
    this.currentVoteTally.clear();
    this.localVotedModeId = null;
    this.startVotingFlow(packet);
  }

  private startVotingFlow(packet: StartGameModeVotePacket): void {
    this.activeVoteEndTimestamp = packet.endTime;
    this.activeVotingOptions = packet.options;

    // Fail-safe timeout watchdog: if client UI is still stuck on GAMEMODE_VOTING 6.5 seconds
    // after opening (due to packet loss or disconnect), force-close modal and automatically advance
    if (this.voteWatchdogTimer) {
      window.clearTimeout(this.voteWatchdogTimer);
    }
    this.voteWatchdogTimer = window.setTimeout(() => {
      this.voteWatchdogTimer = null;
      if (this.dungeonFlowState === 'GAMEMODE_VOTING') {
        this.forceAdvanceVoting();
      }
    }, 6500);

    const remainingMs = Math.max(1000, Math.min(packet.duration, packet.endTime - Date.now()));

    // Auto-pick random game mode modifier so waves flow continuously without manual pause or modal popups
    const autoOpt = packet.options[Math.floor(Math.random() * packet.options.length)];
    if (autoOpt) {
      this.castGameModeVote(autoOpt.id);
    }
  }

  private castGameModeVote(selectedModeId: string): void {
    if (this.localVotedModeId) return;
    this.localVotedModeId = selectedModeId;
    const playerId = network.mySocketId || localStorage.getItem('playerShortId') || 'solo-player';
    this.recordVote(playerId, selectedModeId);

    // Broadcast CAST_GAMEMODE_VOTE event
    network.sendCastGameModeVote({ playerId, selectedModeId });

    if (this.engine?.isHost) {
      this.checkHostVoteCompletion();
    }
  }

  private handleIncomingCastVote(packet: CastGameModeVotePacket): void {
    this.recordVote(packet.playerId, packet.selectedModeId);
    if (this.engine?.isHost) {
      this.checkHostVoteCompletion();
    }
  }

  private recordVote(playerId: string, selectedModeId: string): void {
    this.currentVoteTally.set(playerId, selectedModeId);

    const counts: Record<string, number> = {};
    for (const opt of this.activeVotingOptions) {
      counts[opt.id] = 0;
    }
    for (const modeId of this.currentVoteTally.values()) {
      if (counts[modeId] !== undefined) {
        counts[modeId]++;
      }
    }
    this.hud?.updateGameModeVotes(counts);
  }

  private checkHostVoteCompletion(): void {
    if (!this.engine?.isHost || this.dungeonFlowState !== 'GAMEMODE_VOTING') return;
    const totalExpectedVoters = network.isPartied
      ? 1 + Object.keys(network.remotePlayers).length
      : 1;

    // Resolve immediately when all players in the lobby have cast their votes
    if (this.currentVoteTally.size >= totalExpectedVoters) {
      if (this.hostVoteTimer) {
        window.clearTimeout(this.hostVoteTimer);
        this.hostVoteTimer = null;
      }
      this.resolveHostVote();
    }
  }

  private resolveHostVote(): void {
    if (!this.engine?.isHost || this.dungeonFlowState !== 'GAMEMODE_VOTING') return;
    if (this.hostVoteTimer) {
      window.clearTimeout(this.hostVoteTimer);
      this.hostVoteTimer = null;
    }

    // Single Source of Truth: Authoritative random roll executed only by Host
    const roll = Math.random();
    const winningModeId = resolveVote(this.activeVotingOptions, this.currentVoteTally, roll);

    const resultPacket: GameModeVoteResultPacket = {
      winningModeId,
      nextWave: this.currentWaveIndex + 1,
    };

    // Host broadcasts GAMEMODE_VOTE_RESULT to all connected players
    network.sendGameModeVoteResult(resultPacket);

    this.applyWinningModeAndProceed(winningModeId);
  }

  private handleIncomingVoteResult(packet: GameModeVoteResultPacket): void {
    if (!this.engine || this.engine.isHost) return;
    this.applyWinningModeAndProceed(packet.winningModeId);
  }

  /**
   * Phase 4: APPLYING_GAMEMODE - applies modifier and immediately starts startNextWave(currentWave + 1)
   */
  private applyWinningModeAndProceed(winningModeId: string): void {
    if (this.voteWatchdogTimer) {
      window.clearTimeout(this.voteWatchdogTimer);
      this.voteWatchdogTimer = null;
    }

    this.dungeonFlowState = 'APPLYING_GAMEMODE';
    this.hud?.highlightWinningGameMode(winningModeId);

    const winningOption = ALL_GAME_MODES.find(m => m.id === winningModeId)
      || this.activeVotingOptions.find(m => m.id === winningModeId)
      || ALL_GAME_MODES[0];

    this.activeGameModeModifiers = winningOption ? { ...winningOption.modifiers } : {};

    if (winningOption) {
      this.hud?.showToast(`Active Modifier: ${winningOption.name}`);
    }

    // Brief highlight delay before hiding modal and starting next wave
    window.setTimeout(() => {
      this.hud?.hideGameModeVotingModal();
      if (this.engine?.isHost) {
        this.currentWaveIndex++;
        this.spawnNextWave();
      }
    }, 400);
  }

  private forceAdvanceVoting(): void {
    console.warn('[Dungeon] GameMode voting watchdog triggered (6.5s timeout). Force-advancing wave.');
    if (this.voteWatchdogTimer) {
      window.clearTimeout(this.voteWatchdogTimer);
      this.voteWatchdogTimer = null;
    }
    if (this.hostVoteTimer) {
      window.clearTimeout(this.hostVoteTimer);
      this.hostVoteTimer = null;
    }

    const fallbackModeId = this.activeVotingOptions[0]?.id || ALL_GAME_MODES[0].id;
    this.applyWinningModeAndProceed(fallbackModeId);
  }
}
