/**
 * Complete Authentic Pixel-Art HUD & Virtual Gamepad Powered by Kenney RPG UI Sprites
 * Features:
 * 1. Real Sprite Health Bars (Red) & EXP Bars (Yellow) with 9-slice barBack frames
 * 2. Real Sprite Player Frame (panel_brown / panelInset_brown)
 * 3. Real Sprite Virtual Joystick with Runic Crystal Knob & Directional Arrow Sprites
 * 4. Real Sprite Jump (buttonRound_brown) & Dash (buttonRound_blue with 2.5s live cooldown overlay)
 * 5. Real Sprite Skill Hotbar (buttonSquare_brown) with Kyrise 32x32 Pixel Art Icons
 * 6. Real Sprite Inventory & Wave Dialogs
 */

import { SideViewEngine } from '../engine/SideViewEngine';
import { QUICK_CHAT } from '../network/QuickChat';
import { voice } from '../network/VoiceChat';
import { LeaderboardUI } from './LeaderboardUI';
import { ItemData, RARITY_CONFIGS } from '../items/ItemDatabase';
import { audio } from '../engine/AudioManager';
import { sprites } from '../engine/SpriteManager';
import { SkillDefinition, CHARACTER_CLASSES } from '../classes/ClassDefinitions';
import { SideViewGame } from '../SideViewGame';
import { network } from '../network/NetworkManager';
import { quests } from '../quests/QuestManager';
import { QuestLogUI } from './QuestLogUI';
import { WorldMapUI } from './WorldMapUI';
import { DUNGEONS } from '../dungeons/DungeonManager';

export class GameHUD {
  /**
   * Whether the window-level listeners are already attached.
   *
   * render() rebuilds the whole HUD and re-runs attachEvents and the gamepad
   * setup, and it is called again every time an item is equipped or used. The
   * markup is replaced each time so element listeners die with their elements -
   * but window is not replaced, so every equip added another Escape handler and
   * another full set of joystick handlers. After three equips, one Escape press
   * toggled the menu four times and one drag moved the joystick four times.
   */
  private globalsBound = false;

  /** Last threat class written, so the transition is not restarted each frame. */
  private threatClass = '';
  /** Which allies the rail was last built for, so it is not rebuilt per frame. */
  private allyKey = '';
  /**
   * Interface glyphs.
   *
   * The icon packs cover objects that exist in the world - scrolls, maps,
   * medals, chests - and those are used as-is. They have nothing for system
   * controls like music, fullscreen or a microphone, and emoji is exactly what
   * this pass exists to remove, so those are drawn here: one flat set that
   * takes its size and colour from CSS like any other text.
   */
  private static readonly GLYPHS: Record<string, string> = {
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    note: '<path d="M9 18V5l10-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
    speaker: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 8.5a5 5 0 0 1 0 7"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/>',
    headset: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="2" y="13" width="5" height="7" rx="2"/><rect x="17" y="13" width="5" height="7" rx="2"/>',
    expand: '<path d="M4 9V4h5"/><path d="M20 9V4h-5"/><path d="M4 15v5h5"/><path d="M20 15v5h-5"/>',
    micOff: '<path d="M9 9V6a3 3 0 0 1 6 0v4"/><path d="M5 11a7 7 0 0 0 11 5.5"/><path d="M12 18v3"/><path d="M3 3l18 18"/>',
    headsetOff: '<path d="M4 14v-2a8 8 0 0 1 12.5-6.6"/><rect x="2" y="13" width="5" height="7" rx="2"/><path d="M3 3l18 18"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
    pin: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    check: '<path d="M4 12.5l5 5L20 6.5"/>',
    box: '<rect x="4.5" y="4.5" width="15" height="15" rx="2"/>',
    // Stat marks. These read at 14px, which the emoji they replace did not.
    sword: '<path d="M17 3h4v4L11 17l-4-4L17 3z"/><path d="M6 14l4 4"/><path d="M3 21l3.5-3.5"/>',
    shield: '<path d="M12 3l7 3v5c0 4.6-3 8.2-7 10-4-1.8-7-5.4-7-10V6l7-3z"/>',
    heart: '<path d="M12 20s-7-4.4-7-9.5A4 4 0 0 1 12 8a4 4 0 0 1 7 2.5C19 15.6 12 20 12 20z"/>',
    orb: '<path d="M12 3s6 6.4 6 10a6 6 0 0 1-12 0c0-3.6 6-10 6-10z"/>',
    spark: '<path d="M13 2L5 13h5l-1 9 8-11h-5l1-9z"/>',
    wind: '<path d="M3 8h10a3 3 0 1 0-3-3"/><path d="M3 12h14a3 3 0 1 1-3 3"/><path d="M3 16h7"/>',
  };

  /** One glyph as inline SVG, inheriting colour so CSS still drives the look. */
  public static glyph(name: string, cls = 'hud-glyph'): string {
    const body = GameHUD.GLYPHS[name];
    if (!body) return '';
    return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }

  private container: HTMLElement;
  private engine: SideViewEngine;
  private game?: SideViewGame;
  private inventoryOpen: boolean = false;
  private leaderboard = new LeaderboardUI(document.body);
  public questLogUI: QuestLogUI | null = null;
  public worldMapUI: WorldMapUI | null = null;
  private selectedItem: { item: ItemData; isEquipped: boolean; slotOrIdx: string | number } | null = null;

  // Joystick state
  private joystickActive: boolean = false;
  private joystickTouchId: number | null = null;
  private joystickCenterX: number = 0;
  private joystickCenterY: number = 0;

  constructor(rootElement: HTMLElement, engine: SideViewEngine, game?: SideViewGame) {
    this.engine = engine;
    this.game = game;
    this.container = document.createElement('div');
    this.container.id = 'game-hud-overlay';
    rootElement.appendChild(this.container);
    this.questLogUI = new QuestLogUI(rootElement);
    this.injectStyles();
    this.render();

    // Subscribe to quest events for toast alerts
    quests.subscribe((evt) => {
      this.showToast(evt.message);
    });

    // Listen for multiplayer invites
    this.setupInviteListener();
  }

  private getSkillIcon(skill: SkillDefinition, classId: string): string {
    if (skill.iconImage) return skill.iconImage;
    const cid = classId.toLowerCase();
    const icons: { [key: string]: string[] } = {
      warrior: ['sword_03a.png', 'sword_02a.png', 'shield_01a.png', 'scroll_01b.png', 'sword_01c.png', 'crystal_01h.png'],
      paladin: ['sword_02c.png', 'shield_03a.png', 'helmet_02a.png', 'crystal_01i.png', 'potion_01a.png', 'crystal_01c.png'],
      berserker: ['sword_02a.png', 'potion_03b.png', 'boots_01e.png', 'ring_01a.png', 'shard_01g.png', 'gem_01b.png'],
      dragoon: ['staff_02ab.png', 'armor_01c.png', 'crystal_01g.png', 'staff_02d.png', 'gem_01j.png', 'crystal_01f.png'],
      mage: ['staff_03a.png', 'crystal_01f.png', 'ring_03b.png', 'spellbook_03a.png', 'crystal_01d.png', 'gem_01c.png'],
      priest: ['necklace_01a.png', 'potion_01b.png', 'spellbook_02a.png', 'ring_02a.png', 'crystal_01j.png', 'gem_01d.png'],
      necromancer: ['skull_01a.png', 'potion_03e.png', 'bone01a.png', 'spellbook_01a.png', 'crystal_01d.png', 'gem_01e.png'],
      archer: ['bow_03a.png', 'arrow_03a.png', 'leaf_01a.png', 'bow_02a.png', 'boots_01b.png', 'arrow_03e.png'],
      ninja: ['shard_01a.png', 'scroll_01f.png', 'boots_01d.png', 'sword_01a.png', 'sword_02c.png', 'gem_01i.png'],
      assassin: ['sword_01d.png', 'potion_03c.png', 'hat_01a.png', 'shard_01d.png', 'ring_01d.png', 'gem_01f.png']
    };
    const pool = icons[cid] || icons['warrior'];
    const skillIdx = Number(skill.id.split('_')[1]) - 1;
    const file = pool[skillIdx % pool.length] || 'sword_03a.png';
    return `/assets/rpg-icons/32x32/${file}`;
  }

  private injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #game-hud-overlay {
        position: absolute;
        inset: 0;
        /* Its own stacking context. Without a z-index here the overlay creates
           none, so every child's z-index - the pause menu at 110, a toast at
           99999 - competed directly with whatever else was on the page. That is
           how the party lobby ended up painted behind the HUD. Contained, the
           HUD sits as one layer and full-screen panels can simply out-rank it. */
        z-index: 10;
        pointer-events: none;
        user-select: none;
        -webkit-user-select: none;
        -webkit-touch-callout: none;
        font-family: 'Cinzel', 'Outfit', 'Inter', -apple-system, sans-serif;
        color: #f8fafc;
        overflow: hidden;
        image-rendering: pixelated;
        touch-action: manipulation;
      }

      /* Top Left: Player Status with Authentic Kenney Sprite Frame */
      .hud-top-left {
        position: absolute;
        top: max(8px, env(safe-area-inset-top));
        left: max(8px, env(safe-area-inset-left));
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 6px;
        z-index: 10;
        pointer-events: none;
      }

      .player-status-panel {
        position: relative;
        background: url('/assets/kenney-rpg-ui/panel_brown.png') repeat;
        background-size: 100% 100%;
        padding: 8px 14px 10px 10px;
        display: flex;
        align-items: center;
        gap: 8px;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.9);
        pointer-events: auto;
        z-index: 10;
      }

      .player-portrait-box {
        width: 44px;
        height: 44px;
        background: url('/assets/kenney-rpg-ui/panelInset_beigeLight.png') no-repeat center center;
        background-size: 100% 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2px;
      }

      .player-portrait-canvas {
        width: 38px;
        height: 38px;
        image-rendering: pixelated;
      }

      .player-bars {
        display: flex;
        flex-direction: column;
        gap: 4px;
        width: 145px;
      }

      .player-name-row {
        display: flex;
        justify-content: space-between;
        font-size: 11px;
        font-weight: 900;
        letter-spacing: 0.5px;
        text-shadow: 1px 1px 2px #000;
      }

      /* 100% Authentic Sprite Bar Containers */
      .sprite-bar-frame {
        height: 12px;
        position: relative;
        display: flex;
        align-items: center;
        background: url('/assets/kenney-rpg-ui/barBack_horizontalMid.png') repeat-x;
        background-size: auto 100%;
        border-left: 4px solid transparent;
        border-right: 4px solid transparent;
        border-image: url('/assets/kenney-rpg-ui/barBack_horizontalLeft.png') 0 4 0 4 fill;
        overflow: hidden;
      }

      .sprite-bar-lag {
        position: absolute;
        top: 0;
        left: 0;
        height: 100%;
        background: #f59e0b;
        transition: width 0.55s ease-out;
        z-index: 1;
      }

      .sprite-bar-fill {
        height: 100%;
        position: relative;
        z-index: 2;
        transition: width 0.12s linear;
      }

      .sprite-bar-hp {
        background: url('/assets/kenney-rpg-ui/barRed_horizontalMid.png') repeat-x;
        background-size: auto 100%;
      }

      .sprite-bar-mp {
        background: url('/assets/kenney-rpg-ui/barBlue_horizontalBlue.png') repeat-x;
        background-size: auto 100%;
      }

      .sprite-bar-exp {
        background: url('/assets/kenney-rpg-ui/barYellow_horizontalMid.png') repeat-x;
        background-size: auto 100%;
        height: 7px;
      }

      /* Top Center: Wave Banner with Sprite Panel */
      .dungeon-wave-banner {
        position: relative;
        max-width: min(420px, 60vw);
        /* Say it explicitly. The two lines relied on default block stacking and
           ran together into one crowded strip; a column with a gap cannot. */
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 3px;
        padding: 6px 14px;
        background: url('/assets/kenney-rpg-ui/panel_brown.png') repeat;
        background-size: 100% 100%;
        padding: 6px 24px;
        text-align: center;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.85);
        pointer-events: none;
        z-index: 10;
      }

      .player-id-row {
        font-size: 8.5px;
        font-weight: 700;
        letter-spacing: 0.6px;
        color: #cbb894;
        font-family: 'Outfit', sans-serif;
        text-shadow: 1px 1px 2px #000;
        margin-top: 1px;
      }

      .player-power {
        color: #ffd700 !important;
        margin-left: 8px;
        letter-spacing: 0.5px;
      }

      .player-id-row span {
        color: #ffe8b0;
        font-weight: 900;
        letter-spacing: 1px;
      }

      .wave-title {
        font-size: 11px;
        font-weight: 900;
        color: #ffd700;
        letter-spacing: 1px;
        text-transform: uppercase;
        text-shadow: 1px 1px 2px #000;
        /* Wrapping is better than a name that runs out of its own panel. */
        white-space: normal;
        line-height: 1.25;
      }

      .wave-mobs-left {
        font-size: 9px;
        color: #f1f5f9;
        font-weight: 700;
        font-family: 'Outfit', sans-serif;
        text-shadow: 1px 1px 1px #000;
      }

      /* Combo Display */
      .combo-display {
        position: absolute;
        top: 65px;
        right: 25px;
        font-size: 24px;
        font-weight: 900;
        color: #ffd700;
        text-shadow: 2px 2px 0 #000, -2px -2px 0 #e43b44;
        transform: rotate(-6deg);
        display: none;
        pointer-events: none;
        z-index: 10;
      }

      /* Top Right: Gold & Navigation Buttons */
      .hud-glyph {
        width: 1.15em; height: 1.15em;
        flex: none;
        vertical-align: -0.2em;
      }

      /* The only chrome left in the top right besides the gold. */
      .hud-menu-btn {
        display: inline-flex; align-items: center; justify-content: center;
        width: 34px; height: 34px; padding: 0; cursor: pointer;
        background: url('/assets/kenney-rpg-ui/buttonSquare_brown.png') no-repeat center/100% 100%;
        border: none; color: #f3e6c8;
      }
      .hud-menu-btn:active { transform: translateY(1px); }
      .hud-menu-btn .hud-glyph { width: 18px; height: 18px; }

      .pause-back {
        position: absolute; inset: 0; z-index: 110;
        display: flex; align-items: center; justify-content: center;
        background: rgba(6, 5, 10, 0.78);
        /* The HUD root is pointer-events: none and every interactive piece has
           to hand it back. Without this the menu opened and looked right and
           not one button in it could be pressed - including CLOSE. */
        pointer-events: auto;
      }

      .pause-panel {
        width: min(520px, 92vw); max-height: 88vh; overflow-y: auto;
        padding: 18px 22px;
        background: url('/assets/kenney-rpg-ui/panelInset_brown.png') repeat;
        background-size: 100% 100%;
        border: 3px solid #d4af37; border-radius: 5px;
        box-shadow: 0 18px 50px rgba(0,0,0,0.7);
      }

      .pause-title {
        font-family: 'Cinzel', serif; font-weight: 900;
        font-size: 19px; letter-spacing: 3px; color: #ffd700;
        text-align: center; margin-bottom: 14px;
        text-shadow: 0 2px 6px rgba(0,0,0,0.9);
      }

      .play-modes { display: flex; gap: 8px; margin-bottom: 12px; }
      .play-mode {
        flex: 1; padding: 9px; cursor: pointer;
        background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.14);
        border-radius: 3px; color: #9b8a68;
        font-family: 'Cinzel', serif; font-weight: 800;
        font-size: 12px; letter-spacing: 1.2px;
      }
      .play-mode.is-on { color: #ffd700; border-color: #d4af37; background: rgba(212,175,55,0.16); }
      .play-row {
        display: flex; align-items: center; gap: 10px;
        padding: 9px 10px; margin-bottom: 6px;
        background: rgba(0,0,0,0.3);
        border: 1px solid rgba(255,255,255,0.1); border-radius: 3px;
      }
      .play-meta { flex: 1; min-width: 0; }
      .play-name { font-size: 12.5px; font-weight: 800; color: #f3e6c8; }
      .play-sub { font-size: 10.5px; color: #8a9099; }
      .play-go {
        flex: none; padding: 7px 14px; cursor: pointer;
        background: rgba(212,175,55,0.2); border: 1px solid #d4af37; border-radius: 3px;
        color: #ffd700; font-weight: 800; font-size: 10.5px; letter-spacing: 0.8px;
      }
      .play-go:disabled {
        opacity: 0.4; cursor: default;
        border-color: rgba(255,255,255,0.16); color: #8a7b5c; background: rgba(0,0,0,0.25);
      }

      .sk-points { text-align: center; font-size: 12px; color: #c9b48a; margin-bottom: 12px; }
      .sk-points b { color: #ffd700; font-size: 14px; }
      .sk-row {
        display: flex; align-items: center; gap: 10px;
        padding: 8px 10px; margin-bottom: 6px;
        background: rgba(0,0,0,0.3);
        border: 1px solid rgba(255,255,255,0.1); border-radius: 3px;
      }
      .sk-row img { width: 26px; height: 26px; image-rendering: pixelated; flex: none; }
      .sk-meta { flex: 1; min-width: 0; }
      .sk-name { font-size: 12.5px; font-weight: 800; color: #f3e6c8; }
      .sk-bonus { font-size: 10.5px; color: #7dd3fc; }
      .sk-pips { display: flex; gap: 3px; flex: none; }
      .sk-pip { width: 9px; height: 9px; border-radius: 2px; background: rgba(255,255,255,0.14); }
      .sk-pip.on { background: #ffd700; }
      .sk-up {
        flex: none; width: 30px; height: 30px; cursor: pointer;
        background: rgba(212,175,55,0.2); border: 1px solid #d4af37; border-radius: 3px;
        color: #ffd700; font-weight: 900; font-size: 15px; line-height: 1;
      }
      .sk-up:disabled { opacity: 0.28; cursor: default; border-color: rgba(255,255,255,0.16); color: #8a7b5c; }

      .pause-group { margin-bottom: 14px; }
      .pause-label {
        font-size: 10px; font-weight: 800; letter-spacing: 1.6px;
        color: #9b8a68; margin-bottom: 7px;
      }

      .pause-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(146px, 1fr));
        gap: 8px;
      }

      /* Tiles, not a row of text buttons - that row is what made the game read
         as a web page rather than a game. */
      .pause-tile {
        display: flex; align-items: center; gap: 9px;
        padding: 10px 12px; cursor: pointer;
        background: rgba(0,0,0,0.3);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 3px;
        color: #f3e6c8;
        font-family: 'Outfit', sans-serif;
        font-size: 12.5px; font-weight: 700; letter-spacing: 0.3px;
        text-align: left;
      }
      .pause-tile:hover { background: rgba(212, 175, 55, 0.16); border-color: #d4af37; }
      .pause-tile:active { transform: translateY(1px); }
      .pause-tile img {
        width: 22px; height: 22px; flex: none;
        image-rendering: pixelated;
      }
      .pause-tile .hud-glyph { width: 22px; height: 22px; color: #d4af37; }
      .pause-tile span { flex: 1; }

      .pause-foot {
        display: flex; align-items: center; justify-content: space-between;
        gap: 10px; padding-top: 10px;
        border-top: 1px solid rgba(255,255,255,0.1);
      }
      .pause-id { font-size: 11px; color: #9b8a68; letter-spacing: 0.5px; }
      .pause-id b { color: #f3e6c8; letter-spacing: 1.5px; }
      /* The one primary action in the panel, so it keeps a button plate while
         the tiles stay flat. It carried .inv-btn for this, which is the class
         that made Bag look permanently selected. */
      .pause-close {
        padding: 8px 20px; cursor: pointer;
        border: none;
        background: url('/assets/kenney-rpg-ui/buttonLong_brown.png') no-repeat center/100% 100%;
        border: none; color: #fff8e1;
        font-family: 'Cinzel', serif; font-weight: 800;
        font-size: 12px; letter-spacing: 1.2px;
      }

      /* The plate's footer: what the character is worth, not what they can
         press. Gold lived alone in the top right, which made a number look
         like a control. */
      .plate-meta {
        display: flex; align-items: center; gap: 10px;
        margin-top: 3px;
        font-size: 10.5px; font-weight: 700; letter-spacing: 0.3px;
      }
      .plate-gold {
        display: inline-flex; align-items: center; gap: 3px;
        color: #ffd700;
      }
      .plate-gold img { image-rendering: pixelated; }
      .plate-power {
        display: inline-flex; align-items: center; gap: 3px;
        color: #7dd3fc;
      }
      .plate-power .hud-glyph { width: 11px; height: 11px; }
      /* The ID is read out loud to a friend once, so it does not need weight -
         but it does need to be on screen without opening anything. */
      .plate-id { margin-left: auto; color: #9b8a68; font-weight: 600; }
      .plate-id b { color: #f3e6c8; letter-spacing: 1px; }

      /* Experience as the plate's underline. It was a third framed bar, which
         gave a slow background number the same weight as health. The plate is
         already position:relative, and its 10px bottom padding leaves room. */
      .plate-exp {
        position: absolute;
        left: 6px; right: 6px; bottom: 3px;
        height: 3px;
        background: rgba(0, 0, 0, 0.55);
        border-radius: 2px;
        overflow: hidden;
      }
      .plate-exp-fill {
        height: 100%;
        background: linear-gradient(90deg, #a78bfa, #f0abfc);
        transition: width 0.25s ease-out;
      }

      /* Threat-responsive chrome.
         The HUD carries a level set every frame from what is actually on
         screen. When nothing threatens, the panels that only report state step
         back; the moment something does, they are at full strength again. The
         controls dim far less than the readouts - a button you are about to
         press should not look disabled - and nothing here changes hit testing,
         so a dimmed control is still exactly as tappable. */
      /* Stepping back, not disappearing. 0.38 was deep enough that the cards
         could not be read at a glance, which is worse than the crowding it was
         meant to relieve. */
      .hud-calm .player-status-panel,
      .hud-calm .mini-quest-tracker,
      .hud-calm .hud-top-right,
      .hud-calm .voice-dock {
        opacity: 0.85;
      }
      .hud-calm .skills-hotbar,
      .hud-calm .mobile-controls-wrapper {
        opacity: 0.95;
      }

      .player-status-panel,
      .mini-quest-tracker,
      .hud-top-right,
      .voice-dock,
      .skills-hotbar,
      .mobile-controls-wrapper {
        transition: opacity 0.45s ease-out;
      }

      /* A boss is the one moment the readouts should be louder than normal. */
      .hud-boss .player-status-panel {
        box-shadow: 0 4px 15px rgba(0,0,0,0.9), 0 0 0 2px rgba(239, 68, 68, 0.55);
      }

      /* Coming back has to be instant - a fade-in you can watch is a fade-in
         that arrives after the hit that needed it. */
      .hud-town .player-status-panel,
      .hud-town .skills-hotbar,
      .hud-alert .player-status-panel,
      .hud-boss .player-status-panel,
      .hud-alert .skills-hotbar,
      .hud-boss .skills-hotbar {
        transition: opacity 0.08s ease-out;
      }

      .ally-rail {
        display: none;
        flex-direction: column;
        gap: 3px;
        margin-top: 4px;
        pointer-events: none;
      }
      .ally-rail.has-allies { display: flex; }

      .ally {
        display: flex; align-items: center; gap: 6px;
        padding: 3px 7px;
        width: 152px;
        background: rgba(10, 8, 16, 0.72);
        border-left: 3px solid var(--ally, #4fade5);
        border-radius: 2px;
      }

      .ally-name {
        flex: 1; min-width: 0;
        font-size: 10.5px; font-weight: 700; color: #dfe4ea;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }

      .ally-hp {
        width: 46px; height: 4px;
        background: rgba(0,0,0,0.6);
        border-radius: 2px; overflow: hidden;
      }
      .ally-hp-fill {
        height: 100%; background: #4ade80;
        transition: width 0.2s linear;
      }
      .ally-hp-fill.hurt { background: #facc15; }
      .ally-hp-fill.critical { background: #ef4444; }

      /* Down is the one state that has to carry across a busy screen, so it
         pulses rather than sitting quietly in a colour. */
      .ally.is-down {
        border-left-color: #ef4444;
        animation: allyDown 0.9s ease-in-out infinite;
      }
      .ally.is-down .ally-name { color: #fca5a5; }
      .ally-down-tag {
        font-size: 8.5px; font-weight: 900; letter-spacing: 0.8px;
        color: #ef4444;
      }
      @keyframes allyDown {
        0%, 100% { background: rgba(70, 10, 14, 0.75); }
        50%      { background: rgba(130, 20, 26, 0.85); }
      }

      @media (max-width: 767px), (orientation: landscape) and (max-height: 500px) {
        .ally { width: 118px; padding: 2px 5px; }
        .ally-name { font-size: 9.5px; }
        .ally-hp { width: 34px; }
      }

      .hud-top-right {
        position: absolute;
        top: max(8px, env(safe-area-inset-top));
        right: max(8px, env(safe-area-inset-right));
        display: flex;
        /* Wrap rather than run into the player panel. Ten items in a fixed row
           only fits while nothing is added to it, and voice added two. */
        flex-wrap: wrap;
        justify-content: flex-end;
        max-width: calc(100vw - 300px);
        row-gap: 5px;
        gap: 5px;
        pointer-events: auto;
        z-index: 10;
        align-items: center;
      }

      .gold-badge {
        background: url('/assets/kenney-rpg-ui/panelInset_brown.png') repeat;
        background-size: 100% 100%;
        padding: 5px 12px;
        font-size: 11px;
        font-weight: 900;
        color: #ffd700;
        display: flex;
        align-items: center;
        gap: 5px;
        text-shadow: 1px 1px 2px #000;
      }

      .inv-btn {
        background: url('/assets/kenney-rpg-ui/buttonLong_blue.png') no-repeat center center;
        background-size: 100% 100%;
        border: none;
        color: #ffffff;
        padding: 6px 12px 8px 12px;
        font-weight: 900;
        font-size: 10.5px;
        cursor: pointer;
        font-family: 'Cinzel', serif;
        touch-action: manipulation;
        text-shadow: 1px 1px 2px #000;
        white-space: nowrap;
      }

      .inv-btn:active {
        background-image: url('/assets/kenney-rpg-ui/buttonLong_blue_pressed.png');
        transform: translateY(2px);
      }

      .inv-btn-quest {
        background-image: url('/assets/kenney-rpg-ui/buttonLong_brown.png') !important;
        color: #fef08a !important;
      }

      .inv-btn-fs {
        background-image: url('/assets/kenney-rpg-ui/buttonSquare_brown.png') !important;
        color: #ffd700 !important;
        width: 28px;
        height: 28px;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
      }

      /* Mini Quest Tracker Widget */
      .mini-quest-tracker {
        position: absolute;
        /* Clear of a wrapped two-line button row. */
        top: 78px;
        right: 10px;
        width: 220px;
        background: url('/assets/kenney-rpg-ui/panel_brown.png') repeat;
        background-size: 100% 100%;
        padding: 8px 10px;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.85);
        pointer-events: auto;
        cursor: pointer;
        z-index: 10;
        display: flex;
        flex-direction: column;
        gap: 3px;
        transition: transform 0.1s ease;
      }

      /* MapleStory / Dark Souls Style Top Boss Health Bar */
      .epic-boss-banner {
        position: absolute;
        top: 14px;
        left: 50%;
        transform: translateX(-50%);
        width: 480px;
        max-width: 90vw;
        background: url('/assets/kenney-rpg-ui/panel_brown.png') repeat;
        background-size: 100% 100%;
        padding: 8px 14px;
        display: flex;
        align-items: center;
        gap: 10px;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.9), 0 0 20px rgba(239, 68, 68, 0.4);
        border-radius: 4px;
        z-index: 25;
        animation: bossBarSlideDown 0.4s ease-out;
      }

      @keyframes bossBarSlideDown {
        from { transform: translate(-50%, -30px); opacity: 0; }
        to { transform: translate(-50%, 0); opacity: 1; }
      }

      .boss-portrait-icon {
        font-size: 28px;
        filter: drop-shadow(0 0 8px #ef4444);
      }

      .boss-bar-details {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .boss-header-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .boss-name-text {
        font-family: 'Cinzel', serif;
        font-weight: 900;
        font-size: 13px;
        color: #fef08a;
        text-shadow: 1px 1px 2px #000;
        letter-spacing: 0.5px;
      }

      .boss-hp-percentage {
        font-weight: 800;
        font-size: 11px;
        color: #ef4444;
      }

      .boss-hp-track {
        position: relative;
        height: 12px;
        background: #0f172a;
        border: 1.5px solid #ffd700;
        border-radius: 3px;
        overflow: hidden;
      }

      .boss-hp-lag {
        position: absolute;
        top: 0;
        left: 0;
        height: 100%;
        background: #f59e0b;
        transition: width 0.6s ease-out;
      }

      .boss-hp-fill {
        position: absolute;
        top: 0;
        left: 0;
        height: 100%;
        background: linear-gradient(to right, #dc2626, #ef4444, #f87171);
        transition: width 0.15s linear;
      }

      .mini-quest-tracker:hover {
        transform: scale(1.02);
      }

      .tracker-title {
        font-size: 10px;
        font-weight: 900;
        color: #ffd700;
        text-shadow: 1px 1px 2px #000;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid rgba(255, 215, 0, 0.3);
        padding-bottom: 3px;
      }

      .tracker-quest-name {
        font-size: 11px;
        font-weight: 800;
        color: #ffffff;
        text-shadow: 1px 1px 2px #000;
      }

      .tracker-obj-list {
        display: flex;
        flex-direction: column;
        gap: 2px;
        font-size: 9.5px;
        color: #cbd5e1;
      }

      /* Floating Toast Notification */
      .hud-toast-banner {
        position: absolute;
        top: 18px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(18, 12, 28, 0.95);
        border: 2px solid #ffd700;
        border-radius: 6px;
        padding: 8px 22px;
        color: #fef08a;
        font-weight: 800;
        font-size: 13px;
        box-shadow: 0 6px 25px rgba(0, 0, 0, 0.85), 0 0 15px rgba(255, 215, 0, 0.45);
        z-index: 99999;
        pointer-events: none;
        animation: toastSlideDown 0.3s ease-out;
        text-shadow: 1px 1px 2px #000;
      }

      @keyframes toastSlideDown {
        from { transform: translate(-50%, -20px); opacity: 0; }
        to { transform: translate(-50%, 0); opacity: 1; }
      }

      /* Touch Talk Button for NPC Interaction */
      /* Reviving is the one prompt that must read instantly, so it is louder
         than the talk prompt it replaces. */
      .touch-revive-btn {
        box-shadow: 0 0 0 2px rgba(74, 222, 128, 0.9), 0 0 14px rgba(74, 222, 128, 0.5);
      }

      .downed-overlay {
        position: absolute;
        left: 50%;
        top: 24%;
        transform: translateX(-50%);
        display: none;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 14px 26px;
        background: rgba(20, 4, 6, 0.82);
        border: 2px solid rgba(239, 68, 68, 0.75);
        border-radius: 6px;
        pointer-events: none;
        z-index: 60;
        text-align: center;
      }

      .downed-overlay.is-down { display: flex; }

      .downed-title {
        font-family: 'Cinzel', serif;
        font-weight: 900;
        font-size: 20px;
        letter-spacing: 2px;
        color: #ef4444;
        text-shadow: 0 2px 6px rgba(0,0,0,0.9);
      }

      .downed-sub {
        font-size: 11.5px;
        color: #fca5a5;
        letter-spacing: 0.4px;
      }

      .downed-bar {
        width: 220px;
        height: 9px;
        background: rgba(0,0,0,0.7);
        border: 1px solid rgba(239, 68, 68, 0.6);
        border-radius: 4px;
        overflow: hidden;
      }

      .downed-fill {
        height: 100%;
        width: 100%;
        background: linear-gradient(90deg, #ef4444, #fbbf24);
        transition: width 0.12s linear;
      }

      .touch-talk-btn {
        width: 68px;
        height: 68px;
        background: url('/assets/kenney-rpg-ui/buttonRound_blue.png') no-repeat center center;
        background-size: 100% 100%;
        box-shadow: 0 0 20px rgba(59, 130, 246, 0.85);
        animation: pulseTalkBtn 1.5s infinite ease-in-out;
        color: #ffd700;
        font-weight: 900;
        font-size: 11px;
        display: none;
        border: none;
      }

      @keyframes pulseTalkBtn {
        0%, 100% { transform: scale(1); filter: brightness(1); }
        50% { transform: scale(1.08); filter: brightness(1.3); }
      }

      /* Desktop & Mobile Hotbar with Sprite Buttons */
      /* Superseded by the skill ring further down, which is in this same sheet
         and therefore wins. Kept as the shape to fall back to if the ring is
         ever reverted - it is not reachable as written. */
      .skills-hotbar {
        position: absolute;
        bottom: 12px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 6px;
        background: url('/assets/kenney-rpg-ui/panel_brown.png') repeat;
        background-size: 100% 100%;
        padding: 6px 10px 8px 10px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.9);
        pointer-events: auto;
        z-index: 10;
      }

      .hotbar-slot {
        position: relative;
        width: 48px;
        height: 48px;
        background: url('/assets/kenney-rpg-ui/buttonSquare_brown.png') no-repeat center center;
        background-size: 100% 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        touch-action: manipulation;
        overflow: hidden;
      }

      .potion-slot {
        margin-left: 8px;
        box-shadow: inset 0 0 0 2px rgba(74, 222, 128, 0.35);
      }

      .potion-count {
        position: absolute;
        right: 2px;
        bottom: 1px;
        font-size: 10px;
        font-weight: 900;
        color: #4ade80;
        text-shadow: 1px 1px 2px #000;
      }

      .potion-slot.empty {
        filter: grayscale(1);
        opacity: 0.45;
      }

      .hotbar-slot:active {
        background-image: url('/assets/kenney-rpg-ui/buttonSquare_brown_pressed.png');
        transform: scale(0.95);
      }

      .slot-key-badge {
        position: absolute;
        top: 3px;
        left: 3px;
        background: rgba(0, 0, 0, 0.85);
        color: #ffd700;
        font-size: 8px;
        font-weight: 900;
        padding: 0 3px;
        border-radius: 2px;
        border: 1px solid #ffd700;
        z-index: 2;
      }

      .slot-icon-img {
        image-rendering: pixelated;
        margin-top: 1px;
      }

      .slot-skill-name {
        font-size: 6.5px;
        font-weight: 900;
        color: #ffffff;
        text-align: center;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 40px;
        font-family: 'Outfit', sans-serif;
        text-shadow: 1px 1px 1px #000;
      }

      .slot-cooldown-overlay {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.85);
        color: #ffd700;
        font-size: 13px;
        font-weight: 900;
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 3;
        font-family: 'Outfit', sans-serif;
      }

      /* ---------------------------------------------------- */
      /* MULTI-DEVICE VIRTUAL TOUCH GAMEPAD WITH SPRITES      */
      /* ---------------------------------------------------- */

      .mobile-controls-wrapper {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 20;
      }

      /* Left-Side Virtual Touch Joystick & D-Pad */
      .mobile-joystick-area {
        position: absolute;
        bottom: max(16px, env(safe-area-inset-bottom));
        left: max(16px, env(safe-area-inset-left));
        width: 140px;
        height: 140px;
        pointer-events: auto;
        touch-action: none;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .joystick-base {
        width: 124px;
        height: 124px;
        border-radius: 50%;
        background: url('/assets/kenney-rpg-ui/panelInset_brown.png') repeat;
        background-size: 100% 100%;
        border: 3px solid #d4af37;
        box-shadow: 0 0 20px rgba(0, 0, 0, 0.9), inset 0 0 14px rgba(212, 175, 55, 0.4);
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        user-select: none;
      }

      .joystick-knob {
        width: 54px;
        height: 54px;
        border-radius: 50%;
        background: url('/assets/kenney-rpg-ui/buttonRound_brown.png') no-repeat center center;
        background-size: 100% 100%;
        box-shadow: 0 0 16px rgba(255, 215, 0, 0.85);
        position: absolute;
        pointer-events: none;
        transform: translate(0px, 0px);
        transition: transform 0.04s ease-out;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      /* The knob's centre mark, drawn rather than typed. It was the glyph
         U+2756, which depends on the device having that character - on a phone
         it can land as a tofu box or a colour emoji. A rotated square is the
         same diamond everywhere. */
      .joystick-knob::before {
        content: '';
        width: 11px;
        height: 11px;
        background: #ffd700;
        transform: rotate(45deg);
        box-shadow: 0 0 4px #000;
      }

      .joystick-arrow-img {
        position: absolute;
        width: 18px;
        height: 18px;
        image-rendering: pixelated;
        pointer-events: none;
        opacity: 0.7;
        transition: transform 0.1s ease, opacity 0.1s ease;
      }
      .arrow-left-img { left: 6px; }
      .arrow-right-img { right: 6px; }

      .joystick-arrow-img.active {
        opacity: 1;
        transform: scale(1.4);
        filter: drop-shadow(0 0 6px #ffd700);
      }

      /* Right-Side Virtual Action Buttons (Jump & Dash) */
      .mobile-action-hub {
        position: absolute;
        bottom: max(16px, env(safe-area-inset-bottom));
        right: max(16px, env(safe-area-inset-right));
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 10px;
        pointer-events: auto;
      }

      /* Touch controls are for touch.
         Neither of these had a display rule, so on a desktop the joystick,
         TALK, JUMP and DASH were drawn on top of a layout that already has
         keys for all four - two full control schemes on screen at once. That
         is a large part of what made one screen feel crammed. They come back
         below, on devices whose primary input is a finger or whose window is
         small enough to be using the touch hotbar anyway. */
      .mobile-joystick-area,
      .mobile-action-hub {
        display: none;
      }

      @media (hover: none) and (pointer: coarse), (max-width: 860px) {
        .mobile-joystick-area { display: block; }
        .mobile-action-hub { display: flex; }
      }

      /* The quick chat menu. Sits above the dock it opens from, and is built
         from the shared line table so the wire ids and the labels cannot drift
         apart. */
      .qc-wheel {
        position: absolute;
        display: none;
        pointer-events: auto;
        flex-direction: column;
        gap: 5px;
        z-index: 70;
        padding: 7px;
        background: rgba(12, 10, 20, 0.94);
        border: 2px solid #d4af37;
        border-radius: 6px;
      }

      .qc-wheel.open { display: flex; }

      .qc-line {
        min-width: 118px;
        padding: 8px 12px;
        cursor: pointer;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 4px;
        color: #f3e6c8;
        font-family: 'Outfit', sans-serif;
        font-weight: 700;
        font-size: 12.5px;
        text-align: left;
      }

      .qc-line:active { transform: scale(0.97); }

      .voice-dock {
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        bottom: 108px;
        display: flex;
        gap: 8px;
        z-index: 60;
        pointer-events: auto;
      }

      .voice-dock-btn {
        width: 42px;
        height: 42px;
        border-radius: 50%;
        border: 2px solid #6b4a24;
        background: rgba(59, 42, 22, 0.92);
        color: #ffe8b0;
        font-size: 17px;
        line-height: 1;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        user-select: none;
        -webkit-user-select: none;
        touch-action: manipulation;
      }

      .voice-dock-btn:active { transform: scale(0.9); }

      .voice-dock-count {
        font-size: 9px;
        font-weight: 900;
        margin-top: 1px;
      }

      /* On a short screen the skill bar sits higher, so lift the dock clear. */
      @media (max-height: 520px) {
        .voice-dock { bottom: 92px; }
        .voice-dock-btn { width: 36px; height: 36px; font-size: 15px; }
      }

      .touch-action-btn {
        border-radius: 50%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        font-weight: 900;
        cursor: pointer;
        user-select: none;
        -webkit-user-select: none;
        touch-action: none;
        transition: transform 0.08s ease;
        position: relative;
        overflow: hidden;
        border: none;
      }

      .touch-action-btn:active {
        transform: scale(0.88);
      }

      .jump-touch-btn {
        width: 68px;
        height: 68px;
        background: url('/assets/kenney-rpg-ui/buttonRound_brown.png') no-repeat center center;
        background-size: 100% 100%;
        box-shadow: 0 0 18px rgba(245, 158, 11, 0.65);
        color: #ffffff;
        font-size: 11px;
        text-shadow: 1px 1px 2px #000;
        font-family: 'Cinzel', serif;
      }

      .dash-touch-btn {
        width: 56px;
        height: 56px;
        background: url('/assets/kenney-rpg-ui/buttonRound_blue.png') no-repeat center center;
        background-size: 100% 100%;
        box-shadow: 0 0 16px rgba(14, 165, 233, 0.65);
        color: #ffffff;
        font-size: 10px;
        text-shadow: 1px 1px 2px #000;
        font-family: 'Cinzel', serif;
      }

      .dash-cooldown-overlay {
        position: absolute;
        inset: 0;
        border-radius: 50%;
        background: rgba(0, 0, 0, 0.85);
        color: #38bdf8;
        font-size: 14px;
        font-weight: 900;
        display: none;
        align-items: center;
        justify-content: center;
        font-family: 'Outfit', sans-serif;
        z-index: 5;
      }

      /* The skill ring.

         This lived inside the phone breakpoint, so anything wider than
         860px got a flat strip of labelled buttons along the bottom - the
         layout that reads as a toolbar. The ring is the arrangement this
         game is played with, on every screen: slots placed around the
         thumb, no labels, the basic attack largest.

         It sits after the strip rules on purpose. Same specificity, so the
         later block wins and the strip becomes the fallback that never
         applies rather than something to delete and lose. */
      .skills-hotbar {
        background: none;
        box-shadow: none;
        padding: 0;
        bottom: 0;
        left: auto;
        right: 0;
        transform: none;
        width: 100vw;
        height: 100vh;
        pointer-events: none; /* Let touches pass through to underlying elements */
      }

      .hotbar-slot {
        position: absolute;
        pointer-events: auto;
        border-radius: 50%;
        width: 44px;
        height: 44px;
        background-image: url('/assets/kenney-rpg-ui/buttonRound_brown.png');
      }

      .slot-skill-name {
        display: none;
      }

      .slot-key-badge {
        font-size: 6.5px;
        padding: 0 2px;
        top: -4px;
        left: -4px;
      }

      /* The Main Attack Button (Skill 0) */
      .hotbar-slot[data-skill-idx="0"] {
        width: 86px;
        height: 86px;
        /* Pulled in from the corner. At right/bottom 22 it sat 83px clear of
           the nearest skill while the arc's own slots are about 7px apart, so
           the button you press most read as belonging to nothing. */
        bottom: calc(22px + env(safe-area-inset-bottom));
        right: calc(22px + env(safe-area-inset-right));
        z-index: 10;
      }
      .hotbar-slot[data-skill-idx="0"] .slot-icon-img {
        width: 48px;
        height: 48px;
      }

      /* Outer Arc layout for active skills 1-5 (Radius 155px) */
      .hotbar-slot[data-skill-idx="1"], .hotbar-slot[data-skill-idx="2"], 
      .hotbar-slot[data-skill-idx="3"], .hotbar-slot[data-skill-idx="4"], 
      .hotbar-slot[data-skill-idx="5"] {
        width: 58px;
        height: 58px;
      }
      .hotbar-slot[data-skill-idx="1"] { bottom: calc(45px + env(safe-area-inset-bottom)); right: calc(211px + env(safe-area-inset-right)); }
      .hotbar-slot[data-skill-idx="2"] { bottom: calc(109px + env(safe-area-inset-bottom)); right: calc(195px + env(safe-area-inset-right)); }
      .hotbar-slot[data-skill-idx="3"] { bottom: calc(162px + env(safe-area-inset-bottom)); right: calc(158px + env(safe-area-inset-right)); }
      .hotbar-slot[data-skill-idx="4"] { bottom: calc(198px + env(safe-area-inset-bottom)); right: calc(103px + env(safe-area-inset-right)); }
      .hotbar-slot[data-skill-idx="5"] { bottom: calc(211px + env(safe-area-inset-bottom)); right: calc(39px + env(safe-area-inset-right)); }

      /* The potion. On mobile the slots are placed one by one and this one had
         no place of its own, so it sat wherever the container defaulted to.
         It goes on the LEFT, above the joystick: the skills are a tight arc
         under the right thumb, and a heal squeezed among them would be pressed
         by accident in exactly the fight where you cannot afford to. */
      .potion-slot {
        /* Beside the joystick, not above it. Above looks natural on a tall
           phone but the left column also carries the player panel, and on a
           short landscape screen (320px) panel + potion + joystick do not fit
           - the potion landed on top of the panel. Sitting to the right of the
           joystick keeps one position on every device, which is what muscle
           memory needs from a heal button. */
        bottom: calc(max(20px, env(safe-area-inset-bottom)) + 22px);
        left: calc(176px + env(safe-area-inset-left));
        right: auto;
        margin-left: 0;
        /* Same size as a skill button: this is the panic button, so it should
           not be the smallest target on screen. */
        width: 58px;
        height: 58px;
        box-shadow: inset 0 0 0 2px rgba(74, 222, 128, 0.5);
      }

      .potion-slot .slot-skill-name { display: none; }
      .potion-slot .slot-key-badge { display: none; }
      .potion-count {
        right: 3px;
        bottom: 2px;
        font-size: 11px;
      }

      /* On a pointer device the joystick is hidden, and the potion was placed
         next to it - which left it stranded alone in the bottom-left corner.
         Here it joins the ring instead, outside the arc so it is never a
         mis-tap for a skill. */
      /* The action hub travels with the ring.

         These positions lived inside the phone breakpoint while the ring
         moved to the base sheet, so on a touch device wider than 860px the
         arc applied and the hub did not: jump, dash and talk fell back to a
         flex column against the right edge, on top of the skills. */
      .mobile-action-hub {
        bottom: 0;
        right: 0;
        width: 100vw;
        height: 100vh;
        pointer-events: none;
      }

      .touch-action-btn {
        position: absolute;
        pointer-events: auto;
      }

      /* Inner Arc: Jump and Dash (Radius 95px) */
      /* Jump, dash and talk sat threaded through the skill arc - jump came
         within 5px of a skill button - so the right thumb had two unrelated
         kinds of action mixed into one shape. They are their own column now,
         left of the arc, which is where this genre puts its utility buttons.
         Ordered by how often they are pressed, nearest thumb first. */
      .jump-touch-btn {
        width: 54px;
        height: 54px;
        bottom: calc(28px + env(safe-area-inset-bottom));
        right: calc(300px + env(safe-area-inset-right));
        font-size: 9px;
      }
      .dash-touch-btn {
        width: 50px;
        height: 50px;
        bottom: calc(92px + env(safe-area-inset-bottom));
        right: calc(300px + env(safe-area-inset-right));
        font-size: 8.5px;
      }

      /* Talk button sitting safely out of the action arc */
      .touch-talk-btn {
        width: 50px;
        height: 50px;
        bottom: calc(156px + env(safe-area-inset-bottom));
        right: calc(300px + env(safe-area-inset-right));
        font-size: 8.5px;
      }

      @media (hover: hover) and (pointer: fine) and (min-width: 861px) {
        .potion-slot {
          bottom: calc(36px + env(safe-area-inset-bottom));
          right: 269px;
          left: auto;
        }
      }

      @media (max-width: 860px) {
        .player-status-panel {
          top: 6px;
          left: 6px;
          padding: 4px 8px;
          gap: 6px;
        }
        .player-portrait-box {
          width: 32px;
          height: 32px;
        }
        .player-portrait-canvas {
          width: 28px;
          height: 28px;
        }
        .player-bars {
          width: 105px;
        }
        .player-name-row {
          font-size: 9.5px;
        }
        .player-id-row {
          font-size: 7.5px;
          letter-spacing: 0.4px;
        }
        .dungeon-wave-banner {
          padding: 3px 10px;
          gap: 2px;
        }
        .dungeon-wave-banner {
          padding: 3px 12px;
        }
        .wave-title {
          font-size: 9.5px;
        }
        .wave-mobs-left {
          font-size: 8px;
        }
        .hud-top-right {
          top: max(6px, env(safe-area-inset-top));
          right: max(6px, env(safe-area-inset-right));
          gap: 4px;
          transform: scale(0.85);
          transform-origin: top right;
          flex-wrap: wrap;
          justify-content: flex-end;
          width: 80%; /* Prevent stretching across whole screen */
        }
        .gold-badge {
          padding: 3px 6px;
          font-size: 9px;
        }
        .inv-btn {
          padding: 4px 6px;
          font-size: 8.5px;
        }
        .mini-quest-tracker {
          display: none; /* Hide on small mobile to avoid screen clutter */
        }

        /* MLBB-Style Action HUD for Right Thumb */
        .mobile-joystick-area {
          bottom: max(20px, env(safe-area-inset-bottom));
          left: max(20px, env(safe-area-inset-left));
          width: 140px;
          height: 140px;
        }
        .joystick-base {
          width: 125px;
          height: 125px;
        }
        .joystick-knob {
          width: 52px;
          height: 52px;
        }

      }

      /* Inventory Modal with Sprite Panel */
      .inventory-modal {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 92vw;
        max-width: 560px;
        max-height: 88vh;
        overflow-y: auto;
        background: url('/assets/kenney-rpg-ui/panel_brown.png') repeat;
        background-size: 100% 100%;
        padding: 16px 20px;
        box-shadow: 0 0 35px rgba(0, 0, 0, 0.95);
        display: none;
        flex-direction: column;
        gap: 12px;
        pointer-events: auto;
        z-index: 100;
      }

      .inv-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 2px solid rgba(212, 175, 55, 0.4);
        padding-bottom: 6px;
      }

      .inv-title {
        margin: 0;
        font-size: 14px;
        font-weight: 900;
        color: #ffd700;
        letter-spacing: 1px;
        text-shadow: 1px 1px 2px #000;
      }

      .inv-close-btn {
        background: url('/assets/kenney-rpg-ui/buttonSquare_brown.png') no-repeat center center;
        background-size: 100% 100%;
        border: none;
        color: #ef4444;
        font-size: 14px;
        font-weight: 900;
        width: 28px;
        height: 28px;
        cursor: pointer;
      }

      .inv-grid-container {
        display: grid;
        grid-template-columns: 1fr 1.2fr;
        gap: 10px;
      }

      @media (max-width: 540px) {
        .inv-grid-container {
          grid-template-columns: 1fr;
        }
      }

      .equipment-paperdoll {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 6px;
        background: url('/assets/kenney-rpg-ui/panelInset_brown.png') repeat;
        background-size: 100% 100%;
        padding: 10px;
      }

      .equip-slot {
        height: 48px;
        background: url('/assets/kenney-rpg-ui/buttonSquare_beige.png') no-repeat center center;
        background-size: 100% 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        position: relative;
        border-radius: 4px;
        transition: transform 0.1s ease;
      }

      .equip-slot:hover {
        transform: scale(1.04);
      }

      .equip-slot.filled {
        background-image: url('/assets/kenney-rpg-ui/buttonSquare_blue.png');
      }

      .equip-slot-label {
        font-size: 7.5px;
        color: #475569;
        text-transform: uppercase;
        font-weight: 900;
      }

      .inventory-bag {
        background: url('/assets/kenney-rpg-ui/panelInset_brown.png') repeat;
        background-size: 100% 100%;
        padding: 10px;
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 6px;
        max-height: 220px;
        overflow-y: auto;
      }

      .bag-slot {
        width: 48px;
        height: 48px;
        background: url('/assets/kenney-rpg-ui/buttonSquare_beige.png') no-repeat center center;
        background-size: 100% 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        position: relative;
        padding: 2px;
        border-radius: 4px;
        transition: transform 0.1s ease;
      }

      .bag-slot:hover {
        transform: scale(1.05);
      }

      .bag-slot:active {
        background-image: url('/assets/kenney-rpg-ui/buttonSquare_beige_pressed.png');
        transform: scale(0.96);
      }

      /* Rarity Styling for Slots & Badges */
      .rarity-common {
        border: 1.5px solid #94a3b8 !important;
        box-shadow: 0 0 4px rgba(148, 163, 184, 0.4);
      }
      .rarity-uncommon {
        border: 1.5px solid #4ade80 !important;
        box-shadow: 0 0 6px rgba(74, 222, 128, 0.5);
      }
      .rarity-rare {
        border: 1.5px solid #38bdf8 !important;
        box-shadow: 0 0 8px rgba(56, 189, 248, 0.6);
      }
      .rarity-epic {
        border: 1.5px solid #c084fc !important;
        box-shadow: 0 0 10px rgba(192, 132, 252, 0.7);
      }
      .rarity-legendary {
        border: 1.5px solid #fbbf24 !important;
        box-shadow: 0 0 14px rgba(251, 191, 36, 0.85);
        animation: legendaryPulse 2s infinite alternate;
      }

      @keyframes legendaryPulse {
        from { box-shadow: 0 0 8px rgba(251, 191, 36, 0.6); }
        to { box-shadow: 0 0 18px rgba(251, 191, 36, 1.0); }
      }

      /* Item Inspection Pane Card */
      .item-inspector-pane {
        grid-column: 1 / -1;
        background: url('/assets/kenney-rpg-ui/panelInset_beige.png') repeat;
        background-size: 100% 100%;
        padding: 10px 14px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        border: 2px solid #5a3d1c;
        border-radius: 4px;
        color: #1e1b4b;
      }

      .inspector-header {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .inspector-icon-box {
        width: 44px;
        height: 44px;
        background: url('/assets/kenney-rpg-ui/buttonSquare_brown.png') no-repeat center center;
        background-size: 100% 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .inspector-title-col {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .inspector-item-name {
        font-family: 'Cinzel', serif;
        font-weight: 900;
        font-size: 13px;
        text-shadow: 1px 1px 1px rgba(0,0,0,0.3);
      }

      .inspector-rarity-pill {
        font-size: 9px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        display: inline-flex;
        gap: 4px;
      }

      .inspector-stats-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        font-size: 11px;
        font-weight: 800;
        background: rgba(0, 0, 0, 0.08);
        padding: 6px 8px;
        border-radius: 4px;
      }

      .cmp-row {
        margin-top: 8px;
        padding: 7px 9px;
        background: rgba(0, 0, 0, 0.3);
        border-left: 3px solid #6b4a24;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
      }

      .cmp-head {
        width: 100%;
        font-size: 9.5px;
        font-weight: 900;
        letter-spacing: 1px;
        color: #cbb894;
        margin-bottom: 2px;
      }

      .cmp-up { color: #4ade80; }
      .cmp-down { color: #f87171; }
      .cmp-side { color: #fbbf24; }

      .cmp-chip {
        font-size: 10px;
        font-weight: 800;
        background: rgba(0, 0, 0, 0.35);
        padding: 2px 7px;
        border-radius: 3px;
      }

      .stat-chip {
        color: #065f46;
      }

      .inspector-desc {
        font-size: 10.5px;
        font-style: italic;
        color: #334155;
        line-height: 1.3;
      }

      .inspector-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
        margin-top: 4px;
      }

      .inspector-btn {
        background: url('/assets/kenney-rpg-ui/buttonLong_blue.png') no-repeat center center;
        background-size: 100% 100%;
        border: none;
        color: #ffffff;
        padding: 5px 14px;
        font-weight: 900;
        font-size: 11px;
        font-family: 'Cinzel', serif;
        cursor: pointer;
        text-shadow: 1px 1px 2px #000;
      }

      .inspector-btn:active {
        background-image: url('/assets/kenney-rpg-ui/buttonLong_blue_pressed.png');
        transform: translateY(1px);
      }

      .inspector-btn-danger {
        background: url('/assets/kenney-rpg-ui/buttonLong_brown.png') no-repeat center center !important;
        background-size: 100% 100% !important;
        color: #f87171 !important;
      }

      /* Hotbar Skill Floating Tooltip */
      .skill-tooltip-popup {
        position: absolute;
        bottom: 68px;
        left: 50%;
        transform: translateX(-50%);
        width: 220px;
        background: url('/assets/kenney-rpg-ui/panel_brown.png') repeat;
        background-size: 100% 100%;
        padding: 8px 12px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.9);
        display: none;
        flex-direction: column;
        gap: 4px;
        pointer-events: none;
        z-index: 100;
        animation: tooltipFade 0.15s ease-out;
      }

      @keyframes tooltipFade {
        from { opacity: 0; transform: translate(-50%, 6px); }
        to { opacity: 1; transform: translate(-50%, 0); }
      }

      .tooltip-skill-name {
        font-family: 'Cinzel', serif;
        font-weight: 900;
        font-size: 12px;
        color: #ffd700;
        text-shadow: 1px 1px 2px #000;
      }

      .tooltip-badges-row {
        display: flex;
        justify-content: space-between;
        font-size: 9.5px;
        font-weight: 800;
        color: #38bdf8;
      }

      .tooltip-desc {
        font-size: 9px;
        color: #e2e8f0;
        line-height: 1.3;
      }
    `;
    document.head.appendChild(style);
  }

  public render() {
    const p = this.engine.player;

    this.container.innerHTML = `
      <!-- Top Left: the player panel with the banner stacked beneath it.
           These were two separately positioned elements and the banner was
           held clear of the panel by a fixed 52px. Adding the ID row made the
           panel taller than that, and the banner landed on top of the health
           bars. A column cannot get that wrong: the banner is below the panel
           because it comes after it, at whatever height the panel happens to
           be. -->
      <div class="hud-top-left">
      <!-- One plate.
           This was a portrait, a name row, an ID row, a power chip and three
           framed bars, with the gold living separately in the top right - six
           pieces of chrome for one idea. The ID moved into the menu, since it
           is read out once and never watched. Gold and Power fold in here
           because they describe the character rather than being controls. EXP
           became a hairline along the bottom edge: it matters, but not enough
           to spend a third bar on it. -->
      <div class="player-status-panel">
        <div class="player-portrait-box">
          <canvas class="player-portrait-canvas" id="hud-portrait-cvs" width="48" height="48"></canvas>
        </div>
        <div class="player-bars">
          <div class="player-name-row">
            <span style="color: ${p.characterClass.accentColor}">${p.characterClass.name}</span>
            <span style="color: #ffd700" id="hud-level-text">Lv. ${p.level}</span>
          </div>

          <div class="sprite-bar-frame" title="Health (HP)">
            <div class="sprite-bar-lag sprite-bar-lag-hp" id="hud-hp-lag" style="width: 100%"></div>
            <div class="sprite-bar-fill sprite-bar-hp" id="hud-hp-bar" style="width: 100%"></div>
          </div>

          <div class="sprite-bar-frame" style="height: 10px;" title="Mana (MP)">
            <div class="sprite-bar-lag sprite-bar-lag-mp" id="hud-mp-lag" style="width: 100%; background: #60a5fa;"></div>
            <div class="sprite-bar-fill sprite-bar-mp" id="hud-mp-bar" style="width: 100%"></div>
          </div>

          <div class="plate-meta">
            <span class="plate-gold" title="Gold">
              <img src="/assets/gui/PNG/iconCircle_brown.png" width="12" height="12" alt="" />
              <span id="hud-gold-text">${p.gold}</span>
            </span>
            <span class="plate-power" id="hud-power" title="Total Power - every level, item and upgrade counts">${GameHUD.glyph('spark')} ${this.engine.computePower().toLocaleString()}</span>
            <span class="plate-id" title="Your Player ID - give this to a friend to be invited">ID <b id="hud-id-text">${localStorage.getItem('playerShortId') || '&mdash;'}</b></span>
          </div>
        </div>

        <!-- Experience, as the plate's own underline. -->
        <div class="plate-exp" title="Experience (EXP)"><div class="plate-exp-fill" id="hud-exp-bar" style="width: 0%"></div></div>
      </div>

      <!-- Who else is here.
           Almost no 2D side-scroller has a party HUD - the genre's references
           are single-player, so there is nothing to copy. Without this the
           downed and revive system is invisible until you happen to walk past
           the body: you cannot answer "is anyone in trouble" from the screen. -->
      <div class="ally-rail" id="ally-rail"></div>

      <!-- Zone and wave, stacked under the player panel -->
      <div class="dungeon-wave-banner" id="dungeon-wave-banner">
        <div class="wave-title" id="wave-title-text">DUNGEON BATTLE</div>
        <div class="wave-mobs-left" id="wave-mobs-text">Enemies remaining: 0</div>
      </div>
      </div>

      <!-- Top Center: Epic Boss Health Bar (MapleStory / Dark Souls Style) -->
      <div class="epic-boss-banner" id="epic-boss-banner" style="display: none;">
        <div class="boss-portrait-icon" id="boss-portrait-icon"><img src="/assets/gui/PNG/buttonSquare_brown.png" width="32" height="32" /></div>
        <div class="boss-bar-details">
          <div class="boss-header-row">
            <span class="boss-name-text" id="boss-name-text">BOSS NAME</span>
            <span class="boss-hp-percentage" id="boss-hp-percentage">100%</span>
          </div>
          <div class="boss-hp-track">
            <div class="boss-hp-lag" id="boss-hp-lag" style="width: 100%;"></div>
            <div class="boss-hp-fill" id="boss-hp-fill" style="width: 100%;"></div>
          </div>
        </div>
      </div>

      <!-- Combo Display -->
      <div class="combo-display" id="combo-display">0x COMBO!</div>

      <!-- Toast Notification Banner -->
      <div class="hud-toast-banner" id="hud-toast-banner" style="display: none;"></div>

      <!-- Top right. One button.
           This was a row of eleven - gold, BGM, SFX, MIC, VOICE, QUESTS, MAP,
           RANK, TOWN, BAG, FULLSCREEN - which wrapped onto a second line on
           narrow screens and read as a web toolbar. None of it is touched
           during a fight. Everything except the gold moved into the menu
           below, keeping its id so every existing handler still finds it. -->
      <div class="hud-top-right">
        <button class="hud-menu-btn" id="hud-menu-btn" title="Menu (Esc)">
          ${GameHUD.glyph('menu')}
        </button>
      </div>

      <!-- Skill levels.
           One point per level, five to a skill, +12% damage each. All of that
           was computed, saved and loaded already; there was simply nowhere to
           spend a point, so they accumulated and did nothing. -->
      <!-- Where a run begins.
           This used to be two buttons on every card of the world map, so the
           same choice was spelled out a dozen times and the level gate lived on
           each copy. One screen: pick how you are playing, then pick where. -->
      <div class="pause-back" id="play-back" style="display:none">
        <div class="pause-panel">
          <div class="pause-title">START A RUN</div>
          <div class="play-modes">
            <button class="play-mode is-on" data-mode="solo">SOLO</button>
            <button class="play-mode" data-mode="party">MULTIPLAYER</button>
          </div>
          <div class="pause-label" id="play-hint">Choose where to go</div>
          <div id="play-list"></div>
          <div class="pause-foot">
            <span class="pause-id">Locked runs show what they need</span>
            <button class="pause-close" id="play-close-btn">CLOSE</button>
          </div>
        </div>
      </div>

      <div class="pause-back" id="skills-back" style="display:none">
        <div class="pause-panel">
          <div class="pause-title">SKILLS</div>
          <div class="sk-points">Unspent points: <b id="sk-points">0</b></div>
          <div id="sk-list"></div>
          <div class="pause-foot">
            <span class="pause-id">One point per level &middot; five per skill</span>
            <button class="pause-close" id="skills-close-btn">CLOSE</button>
          </div>
        </div>
      </div>

      <div class="pause-back" id="pause-back" style="display:none">
        <div class="pause-panel">
          <div class="pause-title">MENU</div>

          <div class="pause-group">
            <div class="pause-label">ADVENTURE</div>
            <div class="pause-grid">
              <button class="pause-tile" id="toggle-quests-btn">
                <img src="/assets/ui_sprites/icons/I_Scroll.png" alt="" /><span>Quests</span>
              </button>
              <button class="pause-tile" id="toggle-map-btn">
                <img src="/assets/ui_sprites/icons/I_Map.png" alt="" /><span>World Map</span>
              </button>
              <button class="pause-tile" id="toggle-rank-btn" title="Power Rankings">
                <img src="/assets/ui_sprites/icons/Ac_Medal01.png" alt="" /><span>Rankings</span>
              </button>
              <button class="pause-tile" id="toggle-play-btn">
                <img src="/assets/ui_sprites/icons/S_Sword01.png" alt="" /><span>Start a Run</span>
              </button>
              <button class="pause-tile" id="toggle-skills-btn">
                <img src="/assets/ui_sprites/icons/S_Buff01.png" alt="" /><span>Skills</span>
              </button>
              <button class="pause-tile" id="toggle-inv-btn">
                <img src="/assets/ui_sprites/icons/I_Chest01.png" alt="" /><span>Bag</span>
              </button>
              <button class="pause-tile" id="return-town-btn" style="display: ${this.engine.isTownMode ? 'none' : 'flex'};">
                ${GameHUD.glyph('home')}<span>Return to Town</span>
              </button>
            </div>
          </div>

          <div class="pause-group" id="pause-party-group" style="display:none">
            <div class="pause-label">PARTY</div>
            <div class="pause-grid">
              <button class="pause-tile" data-keeps-menu id="toggle-mic-btn" title="Toggle Microphone">
                ${GameHUD.glyph('mic')}<span>Microphone</span>
              </button>
              <button class="pause-tile" data-keeps-menu id="toggle-voice-btn" title="Toggle Party Audio">
                ${GameHUD.glyph('headset')}<span>Party Audio</span>
              </button>
            </div>
          </div>

          <div class="pause-group">
            <div class="pause-label">SETTINGS</div>
            <div class="pause-grid">
              <button class="pause-tile" data-keeps-menu id="toggle-music-btn" title="Toggle Music">
                ${GameHUD.glyph('note')}<span>Music</span>
              </button>
              <button class="pause-tile" data-keeps-menu id="toggle-sfx-btn" title="Toggle Sound SFX">
                ${GameHUD.glyph('speaker')}<span>Sound</span>
              </button>
              <button class="pause-tile" data-keeps-menu id="toggle-fullscreen-btn" title="Toggle Fullscreen">
                ${GameHUD.glyph('expand')}<span>Fullscreen</span>
              </button>
            </div>
          </div>

          <div class="pause-foot">
            <span class="pause-id">ID <b>${localStorage.getItem('playerShortId') || '&mdash;'}</b></span>
            <button class="pause-close" id="pause-close-btn">CLOSE</button>
          </div>
        </div>
      </div>

      <!-- Mini Quest Tracker -->
      <div class="mini-quest-tracker" id="mini-quest-tracker">
        <div class="tracker-title">
          <span><img src="/assets/gui/PNG/buttonSquare_brown.png" width="12" height="12" style="vertical-align:middle;" /> ACTIVE QUEST</span>
          <span style="font-size: 8.5px; color: #94a3b8;">[CLICK / J]</span>
        </div>
        <div class="tracker-quest-name" id="tracker-quest-name">Act I: The Stolen Keystone</div>
        <div class="tracker-obj-list" id="tracker-obj-list">
          <div>Talk to Elder Justinian in Eldermoor</div>
        </div>
      </div>

      <!-- Bottom Center: 6-Skill Cooldown Hotbar with Kyrise Icons & Sprite Slots -->
      <div class="skills-hotbar" id="skills-hotbar">
        <div class="skill-tooltip-popup" id="skill-tooltip-popup"></div>
        ${p.characterClass.skills.map((s, idx) => `
          <div class="hotbar-slot" data-skill-idx="${idx}" title="${s.name} (${s.description})">
            <span class="slot-key-badge">${s.key}</span>
            <img src="${this.getSkillIcon(s, p.characterClass.id)}" width="24" height="24" class="slot-icon-img" />
            <span class="slot-skill-name">${s.name}</span>
            <div class="slot-cooldown-overlay" id="cd-overlay-${s.id}">0</div>
          </div>
        `).join('')}
        <!-- Potions were reachable only through the inventory screen, which you
             cannot open while a boss is chasing you - so in the one fight where
             a potion matters it may as well not exist. Same row as the skills,
             because that is where your hand already is. -->
        <div class="hotbar-slot potion-slot" id="potion-slot" title="Drink a healing potion (Q)">
          <span class="slot-key-badge">Q</span>
          <img src="/assets/ui_sprites/icons/P_Red01.png" width="24" height="24" class="slot-icon-img" />
          <span class="slot-skill-name">Potion</span>
          <div class="potion-count" id="potion-count">0</div>
        </div>
      </div>

      <!-- MULTI-DEVICE VIRTUAL TOUCH CONTROLS (Joystick, Jump, Dash with Real Sprites) -->
      <!-- Party voice, down at the bottom where it is easy to see and reach
           during a fight. The top-bar pair is the same controls; both are
           driven by the same object, so either can be used. Hidden entirely
           when there is no party to talk to. -->
      <div class="voice-dock" id="voice-dock" style="display:none">
        <button class="voice-dock-btn" id="dock-mic-btn" title="Toggle Microphone">${GameHUD.glyph('mic')}</button>
        <button class="voice-dock-btn" id="dock-spk-btn" title="Toggle Party Audio">${GameHUD.glyph('headset')}</button>
        <button class="voice-dock-btn" id="dock-chat-btn" title="Quick chat">${GameHUD.glyph('chat')}</button>
        <button class="voice-dock-btn" id="dock-ping-btn" title="Ping your position">${GameHUD.glyph('pin')}</button>
      </div>

      <div class="qc-wheel" id="qc-wheel"></div>

      <div class="mobile-controls-wrapper">
        <!-- Left Side: Touch Joystick -->
        <div class="mobile-joystick-area" id="touch-joystick-zone">
          <div class="joystick-base" id="joystick-base">
            <img src="/assets/kenney-rpg-ui/arrowBrown_left.png" class="joystick-arrow-img arrow-left-img" id="joy-arrow-left" />
            <img src="/assets/kenney-rpg-ui/arrowBrown_right.png" class="joystick-arrow-img arrow-right-img" id="joy-arrow-right" />
            <div class="joystick-knob" id="joystick-knob"></div>
          </div>
        </div>

        <!-- Right Side: Touch Action Hub (Talk, Jump & Dash) -->
        <div class="downed-overlay" id="downed-overlay">
          <div class="downed-title">YOU ARE DOWN</div>
          <div class="downed-sub" id="downed-sub">Hold on - a teammate can still reach you</div>
          <div class="downed-bar"><div class="downed-fill" id="downed-fill"></div></div>
        </div>

        <div class="mobile-action-hub">
          <button class="touch-action-btn touch-talk-btn" id="touch-talk-btn">
            <img src="/assets/gui/PNG/iconCircle_beige.png" width="20" height="20" />
            <span>TALK</span>
          </button>
          <button class="touch-action-btn jump-touch-btn" id="touch-jump-btn">
            <img src="/assets/gui/PNG/arrowBrown_right.png" width="20" height="20" style="transform: rotate(-90deg);" />
            <span>JUMP</span>
          </button>
          <button class="touch-action-btn dash-touch-btn" id="touch-dash-btn">
            <img src="/assets/gui/PNG/cursorSword_silver.png" width="20" height="20" />
            <span>DASH</span>
            <div class="dash-cooldown-overlay" id="dash-cooldown-overlay">0</div>
          </button>
        </div>
      </div>

      <!-- Inventory Modal -->
      <div class="inventory-modal" id="inventory-modal">
        <div class="inv-header">
          <h2 class="inv-title">HERO INVENTORY & EQUIPMENT</h2>
          <button class="inv-close-btn" id="close-inv-btn">${GameHUD.glyph('close')}</button>
        </div>
        <div class="inv-grid-container">
          <!-- Left: Equipment Paperdoll Slots -->
          <div class="equipment-paperdoll">
            <div class="equip-slot ${p.equipment.helmet ? 'filled rarity-' + p.equipment.helmet.rarity : ''}" data-slot="helmet">
              <span class="equip-slot-label">Helm</span>
              ${p.equipment.helmet ? `<img src="${p.equipment.helmet.image}" width="28" height="28" style="image-rendering:pixelated;" />` : ''}
            </div>
            <div class="equip-slot ${p.equipment.wings ? 'filled rarity-' + p.equipment.wings.rarity : ''}" data-slot="wings">
              <span class="equip-slot-label">Wings</span>
              ${p.equipment.wings ? `<img src="${p.equipment.wings.image}" width="28" height="28" style="image-rendering:pixelated;" />` : ''}
            </div>
            <div class="equip-slot ${p.equipment.amulet ? 'filled rarity-' + p.equipment.amulet.rarity : ''}" data-slot="amulet">
              <span class="equip-slot-label">Amulet</span>
              ${p.equipment.amulet ? `<img src="${p.equipment.amulet.image}" width="28" height="28" style="image-rendering:pixelated;" />` : ''}
            </div>
            <div class="equip-slot ${p.equipment.weapon ? 'filled rarity-' + p.equipment.weapon.rarity : ''}" data-slot="weapon">
              <span class="equip-slot-label">Weapon</span>
              ${p.equipment.weapon ? `<img src="${p.equipment.weapon.image}" width="28" height="28" style="image-rendering:pixelated;" />` : ''}
            </div>
            <div class="equip-slot ${p.equipment.armor ? 'filled rarity-' + p.equipment.armor.rarity : ''}" data-slot="armor">
              <span class="equip-slot-label">Armor</span>
              ${p.equipment.armor ? `<img src="${p.equipment.armor.image}" width="28" height="28" style="image-rendering:pixelated;" />` : ''}
            </div>
            <div class="equip-slot ${p.equipment.shield ? 'filled rarity-' + p.equipment.shield.rarity : ''}" data-slot="shield">
              <span class="equip-slot-label">Shield</span>
              ${p.equipment.shield ? `<img src="${p.equipment.shield.image}" width="28" height="28" style="image-rendering:pixelated;" />` : ''}
            </div>
            <div class="equip-slot ${p.equipment.ring ? 'filled rarity-' + p.equipment.ring.rarity : ''}" data-slot="ring">
              <span class="equip-slot-label">Ring</span>
              ${p.equipment.ring ? `<img src="${p.equipment.ring.image}" width="28" height="28" style="image-rendering:pixelated;" />` : ''}
            </div>
            <div class="equip-slot ${p.equipment.boots ? 'filled rarity-' + p.equipment.boots.rarity : ''}" data-slot="boots">
              <span class="equip-slot-label">Boots</span>
              ${p.equipment.boots ? `<img src="${p.equipment.boots.image}" width="28" height="28" style="image-rendering:pixelated;" />` : ''}
            </div>
          </div>

          <!-- Right: Bag Items -->
          <div class="inventory-bag" id="inv-bag-grid">
            <!-- Rendered dynamically -->
          </div>

          <!-- Bottom: Item Inspection Details Pane -->
          <div class="item-inspector-pane" id="item-inspector-pane">
            <div style="font-size: 11px; color: #64748b; font-style: italic; text-align: center;">Click any item or equipment slot to inspect details & stats</div>
          </div>
        </div>
      </div>
    `;

    this.attachEvents();
    this.setupVirtualTouchGamepad();
    // Both have had their one chance to bind to window.
    this.globalsBound = true;
  }

  private attachEvents() {
    // Inventory toggle
    const toggleBtn = this.container.querySelector('#toggle-inv-btn');
    const closeBtn = this.container.querySelector('#close-inv-btn');
    const invModal = this.container.querySelector('#inventory-modal') as HTMLElement;

    // render() rebuilds the whole HUD from a template string, so the modal that
    // comes back is a brand new element with the stylesheet's own display -
    // hidden. The open flag survived but nothing reapplied it, so equipping an
    // item, which calls render(), made the bag vanish and looked like being
    // thrown back to the game.
    if (invModal && this.inventoryOpen) {
      invModal.style.display = 'flex';
      this.renderInventoryItems();
    }

    const openInv = (e: Event) => {
      e.stopPropagation();
      this.inventoryOpen = !this.inventoryOpen;
      invModal.style.display = this.inventoryOpen ? 'flex' : 'none';
      if (this.inventoryOpen) {
        audio.playClick();
        this.renderInventoryItems();
      }
    };

    toggleBtn?.addEventListener('click', openInv);

    const closeInv = (e: Event) => {
      e.stopPropagation();
      this.inventoryOpen = false;
      invModal.style.display = 'none';
      audio.playClick();
    };

    closeBtn?.addEventListener('click', closeInv);

    // Quests button
    const questsBtn = this.container.querySelector('#toggle-quests-btn');
    questsBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.questLogUI?.toggle();
    });

    // Map button
    const mapBtn = this.container.querySelector('#toggle-map-btn');
    mapBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.game?.showScreen('map');
    });

    // Return to Town button
    const townBtn = this.container.querySelector('#return-town-btn');
    townBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      audio.playTeleport();
      this.game?.loadTownHub();
    });

    // Music toggle
    const musicBtn = this.container.querySelector('#toggle-music-btn');
    musicBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const enabled = audio.toggleMusic();
      musicBtn.innerHTML = enabled ? `<img src='/assets/gui/PNG/iconCircle_blue.png' width='16' height='16'/>` : `<img src='/assets/gui/PNG/iconCross_blue.png' width='16' height='16'/>`;
      this.showToast(enabled ? 'Music Enabled' : 'Music Muted');
    });

    this.container.querySelector('#toggle-rank-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      audio.playClick();
      this.leaderboard.open(this.engine.computePower(), this.engine.player.level);
    });

    const potionSlot = this.container.querySelector('#potion-slot') as HTMLElement;
    const drink = (e?: Event) => {
      e?.stopPropagation();
      const result = this.engine.quickHeal();
      if (result === 'none') this.showToast('No healing potions');
      else if (result === 'full') this.showToast('Already at full health');
      this.paintPotionSlot();
    };
    potionSlot?.addEventListener('click', drink);
    potionSlot?.addEventListener('touchstart', drink, { passive: true });
    this.paintPotionSlot();

    // Party voice. The browser will not hand over a microphone without a user
    // gesture, so the first press is what joins the call.
    const micBtn = this.container.querySelector('#toggle-mic-btn') as HTMLElement;
    const voiceBtn = this.container.querySelector('#toggle-voice-btn') as HTMLElement;

    const dock = this.container.querySelector('#voice-dock') as HTMLElement;
    const dockMic = this.container.querySelector('#dock-mic-btn') as HTMLElement;
    const dockSpk = this.container.querySelector('#dock-spk-btn') as HTMLElement;
    // The menu. Everything that used to sit in the top right lives here now,
    // so this one button has to open it and Escape has to close it - the two
    // gestures a player will try without being told.
    // The run launcher. The gate that used to live on each world map card
    // lives here instead: story dungeons open in order, side content opens on
    // level alone, and a run you cannot enter says what it needs.
    const playBack = this.container.querySelector('#play-back') as HTMLElement;
    let playMode: 'solo' | 'party' = 'solo';
    const paintPlay = () => {
      const list = this.container.querySelector('#play-list');
      if (!list || !this.engine) return;
      const lvl = this.engine.player.level || 1;
      const cleared = this.engine.player.maxDungeonCleared || 0;
      // Same rule as the world map: sorted for reading, never reordered. The
      // index carried alongside each row is the array position, because that is
      // what the story-order check counts - sorting the array itself would
      // quietly change which runs unlock which.
      const ordered = DUNGEONS.map((d, i) => ({ d, i }))
        .sort((a, b) => (a.d.minLevel || 1) - (b.d.minLevel || 1));
      list.innerHTML = ordered.map(({ d, i }) => {
        const inOrder = Boolean((d as any).sideContent) || i <= cleared;
        const levelMet = lvl >= (d.minLevel || 1);
        const open = inOrder && levelMet;
        const why = !inOrder ? 'Clear the previous run first' : `Needs Lv. ${d.minLevel || 1}`;
        return `
          <div class="play-row">
            <div class="play-meta">
              <div class="play-name">${d.name}</div>
              <div class="play-sub">${open ? `Lv. ${d.minLevel || 1}+` : why}</div>
            </div>
            <button class="play-go" data-idx="${i}" ${open ? '' : 'disabled'}>GO</button>
          </div>`;
      }).join('');
      list.querySelectorAll('.play-go').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = Number((btn as HTMLElement).dataset.idx);
          const d = DUNGEONS[idx];
          if (!d) return;
          if (playBack) playBack.style.display = 'none';
          audio.playTeleport();
          if (playMode === 'solo') {
            this.game?.onSelectLocation(d.id, true);
          } else {
            network.createLobby(d.id, d.minLevel || 1, () => {}, () => {});
            this.game?.showScreen('lobby');
          }
        });
      });
    };

    this.container.querySelectorAll('.play-mode').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        playMode = (btn as HTMLElement).dataset.mode === 'party' ? 'party' : 'solo';
        this.container.querySelectorAll('.play-mode').forEach(b => b.classList.remove('is-on'));
        btn.classList.add('is-on');
      });
    });

    this.container.querySelector('#toggle-play-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      paintPlay();
      if (playBack) playBack.style.display = 'flex';
    });
    this.container.querySelector('#play-close-btn')?.addEventListener('click', () => {
      if (playBack) playBack.style.display = 'none';
    });
    playBack?.addEventListener('click', (e) => {
      if (e.target === playBack) playBack.style.display = 'none';
    });

    const skillsBack = this.container.querySelector('#skills-back') as HTMLElement;
    const paintSkills = () => {
      if (!skillsBack || !this.engine) return;
      const p = this.engine.player;
      const pts = p.skillPoints || 0;
      const ptsEl = this.container.querySelector('#sk-points');
      if (ptsEl) ptsEl.textContent = String(pts);
      const list = this.container.querySelector('#sk-list');
      if (!list) return;
      list.innerHTML = p.characterClass.skills.map((sk) => {
        const lvl = this.engine.skillLevel(sk.id);
        const pips = Array.from({ length: 5 }, (_, n) =>
          `<span class="sk-pip ${n < lvl ? 'on' : ''}"></span>`).join('');
        const icon = this.getSkillIcon(sk, p.characterClass.id);
        return `
          <div class="sk-row">
            <img src="${icon}" alt="" />
            <div class="sk-meta">
              <div class="sk-name">${sk.name}</div>
              <div class="sk-bonus">${lvl > 0 ? `+${lvl * 12}% damage` : 'No points spent'}</div>
            </div>
            <div class="sk-pips">${pips}</div>
            <button class="sk-up" data-skill="${sk.id}" ${pts > 0 && lvl < 5 ? '' : 'disabled'}>+</button>
          </div>`;
      }).join('');
      list.querySelectorAll('.sk-up').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = (btn as HTMLElement).dataset.skill;
          if (id && this.engine.upgradeSkill(id)) paintSkills();
        });
      });
    };

    this.container.querySelector('#toggle-skills-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const back = this.container.querySelector('#pause-back') as HTMLElement;
      if (back) back.style.display = 'none';
      paintSkills();
      if (skillsBack) skillsBack.style.display = 'flex';
    });
    this.container.querySelector('#skills-close-btn')?.addEventListener('click', () => {
      if (skillsBack) skillsBack.style.display = 'none';
    });
    skillsBack?.addEventListener('click', (e) => {
      if (e.target === skillsBack) skillsBack.style.display = 'none';
    });

    const menuBtn = this.container.querySelector('#hud-menu-btn') as HTMLElement;
    const pauseBack = this.container.querySelector('#pause-back') as HTMLElement;
    const setMenu = (open: boolean) => {
      if (!pauseBack) return;
      pauseBack.style.display = open ? 'flex' : 'none';
      const party = this.container.querySelector('#pause-party-group') as HTMLElement;
      if (party) party.style.display = network.room ? 'block' : 'none';
    };
    // A tile that opens something else has to take the menu down with it.
    //
    // Every tile handler closed the menu itself, or forgot to - and four of the
    // six forgot. Pressing Bag, Quests, Rankings or Return to Town left the menu
    // sitting on top of what you had just asked for, so you had to dismiss it by
    // hand before you could use anything. Settings toggles are the exception:
    // they belong in the menu and must not dismiss it.
    //
    // Capture phase, because the tile handlers call stopPropagation and a
    // bubbling listener would never see the click.
    pauseBack?.addEventListener('click', (e) => {
      const tile = (e.target as HTMLElement)?.closest?.('.pause-tile');
      if (tile && !tile.hasAttribute('data-keeps-menu')) setMenu(false);
    }, true);

    menuBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      setMenu(pauseBack?.style.display === 'none');
    });
    this.container.querySelector('#pause-close-btn')?.addEventListener('click', () => setMenu(false));
    // Clicking the darkened area outside the panel closes it too.
    pauseBack?.addEventListener('click', (e) => { if (e.target === pauseBack) setMenu(false); });
    if (!this.globalsBound) window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape') return;
      // The lobby owns Escape while it is open, and it sits above this.
      if (this.game?.coopLobby?.isOpen) return;
      setMenu(pauseBack?.style.display === 'none');
    });

    const dockChat = this.container.querySelector('#dock-chat-btn') as HTMLElement;
    const dockPing = this.container.querySelector('#dock-ping-btn') as HTMLElement;
    const wheel = this.container.querySelector('#qc-wheel') as HTMLElement;

    // Built from the shared line table, so the labels on screen and the ids on
    // the wire cannot drift apart.
    if (wheel) {
      wheel.innerHTML = QUICK_CHAT
        .map(l => `<button class="qc-line" data-line="${l.id}" style="color:${l.color}">${l.label}</button>`)
        .join('');
      wheel.querySelectorAll('.qc-line').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = (btn as HTMLElement).dataset.line;
          if (id) this.game?.sayQuickChat(id);
          wheel.classList.remove('open');
        });
      });
    }

    const placeWheel = () => {
      if (!wheel || !dockChat) return;
      const r = dockChat.getBoundingClientRect();
      const host = this.container.getBoundingClientRect();
      wheel.style.left = `${Math.max(6, r.left - host.left - 30)}px`;
      wheel.style.bottom = `${Math.max(6, host.bottom - r.top + 8)}px`;
    };

    dockChat?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!wheel) return;
      placeWheel();
      wheel.classList.toggle('open');
    });

    dockPing?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.game?.dropPing();
    });

    // Anywhere else closes it, so it never sits over the fight.
    this.container.addEventListener('click', () => wheel?.classList.remove('open'));

    const paintVoice = () => {
      const inParty = Boolean(network.room);
      if (micBtn) micBtn.style.display = inParty ? '' : 'none';
      if (voiceBtn) voiceBtn.style.display = inParty ? '' : 'none';
      if (dock) dock.style.display = inParty ? 'flex' : 'none';

      if (dockMic) {
        dockMic.innerHTML = GameHUD.glyph(voice.isMicOn ? 'mic' : 'micOff');
        dockMic.style.opacity = voice.isMicOn ? '1' : '0.5';
      }
      if (dockSpk) {
        // The tooltip carries the real state, so a silent call can be diagnosed
        // rather than guessed at.
        dockSpk.title = voice.lastError || voice.status;
        const live = voice.peerCount;
        dockSpk.innerHTML = !voice.isSpeakerOn
          ? GameHUD.glyph('headsetOff')
          : `${GameHUD.glyph('headset')}${live > 0 ? `<span class="voice-dock-count">${live}</span>` : (voice.attemptedPeers > 0 ? '<span class="voice-dock-count">…</span>' : '')}`;
        dockSpk.style.opacity = voice.isSpeakerOn ? '1' : '0.5';
      }
      if (micBtn) {
        micBtn.innerHTML = `${GameHUD.glyph(voice.isMicOn ? 'mic' : 'micOff')} ${voice.isMicOn ? 'ON' : 'MUTED'}`;
        micBtn.style.opacity = voice.isMicOn ? '1' : '0.55';
      }
      if (voiceBtn) {
        // Connected and connecting are different states and matter to the
        // player: "..." means the handshake is still going, a number means
        // audio is actually flowing. Showing one figure for both hides the
        // failure that matters.
        const live = voice.peerCount;
        const trying = voice.attemptedPeers;
        const mark = GameHUD.glyph(voice.isSpeakerOn ? 'headset' : 'headsetOff');
        const label = !voice.isSpeakerOn ? 'OFF'
          : live > 0 ? String(live)
          : trying > 0 ? '…'
          : 'ON';
        voiceBtn.innerHTML = `${mark} ${label}`;
        voiceBtn.style.opacity = voice.isSpeakerOn ? '1' : '0.55';
        voiceBtn.title = live > 0
          ? `Talking with ${live} in the party`
          : trying > 0 ? 'Connecting to the party…' : 'Party audio';
      }
    };
    voice.addStateListener(paintVoice);
    voice.onError = (msg) => this.showToast(msg);
    paintVoice();

    dockMic?.addEventListener('click', async (e) => {
      e.stopPropagation();
      await voice.ensureJoined(network.socket);
      voice.toggleMic();
    });
    dockSpk?.addEventListener('click', async (e) => {
      e.stopPropagation();
      await voice.ensureJoined(network.socket);
      voice.toggleSpeaker();
      // Tapping it reports what the call is actually doing. Without this, a
      // call that connects but carries no sound looks the same as one that
      // never connected.
      this.showToast(voice.isSpeakerOn ? `Party audio: ${voice.status}` : 'Party audio off');
    });

    micBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!voice.isJoined) {
        await voice.ensureJoined(network.socket);
        this.showToast('Joined party voice');
      }
      voice.toggleMic();
      this.showToast(voice.isMicOn ? 'Mic on' : 'Mic muted');
    });

    voiceBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!voice.isJoined) await voice.ensureJoined(network.socket);
      voice.toggleSpeaker();
      this.showToast(voice.isSpeakerOn ? 'Party audio on' : 'Party audio off');
    });

    // Sound SFX toggle
    const sfxBtn = this.container.querySelector('#toggle-sfx-btn');
    sfxBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const enabled = audio.toggleSound();
      sfxBtn.innerHTML = enabled ? `<img src='/assets/gui/PNG/iconCircle_beige.png' width='16' height='16'/>` : `<img src='/assets/gui/PNG/iconCross_beige.png' width='16' height='16'/>`;
      this.showToast(enabled ? 'SFX Enabled' : 'SFX Muted');
    });

    // Fullscreen Toggle button
    const fsBtn = this.container.querySelector('#toggle-fullscreen-btn');
    fsBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      audio.playClick();
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });

    // Mini Quest Tracker Click
    const trackerEl = this.container.querySelector('#mini-quest-tracker');
    trackerEl?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.questLogUI?.toggle();
    });

    // Touch Talk Button
    const talkBtn = this.container.querySelector('#touch-talk-btn');
    talkBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.game?.interactWithActiveNpc();
    });
    // Reviving is a hold, so the button reports press and release rather than
    // a tap. Cancel and leave both clear it, or walking away mid-hold would
    // leave the flag stuck on.
    const setHold = (held: boolean) => { if (this.game) this.game.touchReviveHeld = held; };
    talkBtn?.addEventListener('touchstart', () => setHold(true));
    ['touchend', 'touchcancel', 'pointerup', 'pointerleave'].forEach(ev =>
      talkBtn?.addEventListener(ev, () => setHold(false)));
    talkBtn?.addEventListener('pointerdown', () => setHold(true));

    talkBtn?.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.game?.interactWithActiveNpc();
    }, { passive: false });

    // Skill Hotbar Hover Tooltips & Click / Touch Triggers
    const tooltipPopup = this.container.querySelector('#skill-tooltip-popup') as HTMLElement;
    const slots = this.container.querySelectorAll('.hotbar-slot');
    const p = this.engine.player;

    slots.forEach(slot => {
      let lastTriggerTime = 0;
      const idx = Number(slot.getAttribute('data-skill-idx'));
      const skill = p.characterClass.skills[idx];

      const showTooltip = () => {
        if (!tooltipPopup || !skill) return;
        tooltipPopup.innerHTML = `
          <div class="tooltip-skill-name">${skill.name}</div>
          <div class="tooltip-badges-row">
            <span>${GameHUD.glyph('orb')} ${skill.manaCost} MP</span>
            <span>${GameHUD.glyph('clock')} ${skill.cooldown}s CD</span>
            <span>${GameHUD.glyph('sword')} ${Math.round(skill.damageMultiplier * 100)}% DMG</span>
          </div>
          <div class="tooltip-desc">${skill.description}</div>
        `;
        tooltipPopup.style.display = 'flex';
      };

      const hideTooltip = () => {
        if (tooltipPopup) tooltipPopup.style.display = 'none';
      };

      // Only bind the hover tooltip on devices that genuinely hover. A tap on
      // a touchscreen fires a synthetic mouseenter with no matching mouseleave
      // - the finger lifts, nothing moves out - so the card opened on every
      // skill press and stayed there covering the fight.
      const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      if (canHover) {
        slot.addEventListener('mouseenter', showTooltip);
        slot.addEventListener('mouseleave', hideTooltip);
      }

      const triggerSkill = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        hideTooltip();
        const now = Date.now();
        if (now - lastTriggerTime < 180) return; // Debounce synthetic double-tap
        lastTriggerTime = now;
        this.engine.castSkill(idx);
      };

      slot.addEventListener('pointerdown', triggerSkill);
      slot.addEventListener('click', triggerSkill);
    });
  }

  /**
   * Setup Virtual Touch Joystick, Jump, and Dash Gamepad for Mobile Devices
   */
  private setupVirtualTouchGamepad() {
    const joystickZone = this.container.querySelector('#touch-joystick-zone') as HTMLElement;
    const joystickKnob = this.container.querySelector('#joystick-knob') as HTMLElement;
    const arrowLeft = this.container.querySelector('#joy-arrow-left') as HTMLElement;
    const arrowRight = this.container.querySelector('#joy-arrow-right') as HTMLElement;
    const jumpBtn = this.container.querySelector('#touch-jump-btn') as HTMLElement;
    const dashBtn = this.container.querySelector('#touch-dash-btn') as HTMLElement;

    if (!joystickZone || !joystickKnob) return;

    // Looked up per event rather than captured. The surviving window listener
    // outlives the markup it was bound against, so a captured reference would
    // be driving a detached element after the first re-render.
    const live = <T extends HTMLElement>(sel: string) =>
      this.container.querySelector(sel) as T | null;

    const handleJoystickMove = (clientX: number, clientY: number) => {
      const joystickKnob = live<HTMLElement>('#joystick-knob');
      const arrowLeft = live<HTMLElement>('#joy-arrow-left');
      const arrowRight = live<HTMLElement>('#joy-arrow-right');
      if (!joystickKnob) return;
      const dx = clientX - this.joystickCenterX;
      const maxRadius = 45;
      const distance = Math.min(maxRadius, Math.abs(dx));
      const normalizedDir = distance > 8 ? Math.sign(dx) * (distance / maxRadius) : 0;

      joystickKnob.style.transform = `translate(${dx > 0 ? distance : -distance}px, 0px)`;

      if (arrowLeft && arrowRight) {
        if (dx < -12) {
          arrowLeft.classList.add('active');
          arrowRight.classList.remove('active');
        } else if (dx > 12) {
          arrowRight.classList.add('active');
          arrowLeft.classList.remove('active');
        } else {
          arrowLeft.classList.remove('active');
          arrowRight.classList.remove('active');
        }
      }

      if (this.game) {
        this.game.touchMoveDir = Math.abs(normalizedDir) > 0.2 ? Math.sign(normalizedDir) : 0;
      }
    };

    const resetJoystick = () => {
      this.joystickActive = false;
      this.joystickTouchId = null;
      joystickKnob.style.transform = `translate(0px, 0px)`;
      if (arrowLeft) arrowLeft.classList.remove('active');
      if (arrowRight) arrowRight.classList.remove('active');
      if (this.game) {
        this.game.touchMoveDir = 0;
      }
    };

    // Touch Events for Joystick
    joystickZone.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.changedTouches[0];
      this.joystickTouchId = touch.identifier;
      this.joystickActive = true;
      const rect = joystickZone.getBoundingClientRect();
      this.joystickCenterX = rect.left + rect.width / 2;
      this.joystickCenterY = rect.top + rect.height / 2;
      handleJoystickMove(touch.clientX, touch.clientY);
    }, { passive: false });

    if (!this.globalsBound) window.addEventListener('touchmove', (e: TouchEvent) => {
      if (!this.joystickActive) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.joystickTouchId) {
          handleJoystickMove(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
          break;
        }
      }
    }, { passive: false });

    if (!this.globalsBound) window.addEventListener('touchend', (e: TouchEvent) => {
      if (!this.joystickActive) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.joystickTouchId) {
          resetJoystick();
          break;
        }
      }
    }, { passive: false });

    if (!this.globalsBound) window.addEventListener('touchcancel', () => resetJoystick(), { passive: true });

    // Pointer Events for Mouse Simulation on Desktop
    joystickZone.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.pointerType === 'mouse') {
        this.joystickActive = true;
        const rect = joystickZone.getBoundingClientRect();
        this.joystickCenterX = rect.left + rect.width / 2;
        this.joystickCenterY = rect.top + rect.height / 2;
        handleJoystickMove(e.clientX, e.clientY);
      }
    });

    if (!this.globalsBound) window.addEventListener('pointermove', (e: PointerEvent) => {
      if (this.joystickActive && e.pointerType === 'mouse') {
        handleJoystickMove(e.clientX, e.clientY);
      }
    });

    if (!this.globalsBound) window.addEventListener('pointerup', () => {
      if (this.joystickActive) resetJoystick();
    });

    // Jump Touch Button
    if (jumpBtn) {
      const triggerJump = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        this.engine.jumpPlayer();
      };
      jumpBtn.addEventListener('touchstart', triggerJump, { passive: false });
      jumpBtn.addEventListener('pointerdown', triggerJump);
    }

    // Dash Touch Button
    if (dashBtn) {
      const triggerDash = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        this.engine.dashPlayer();
      };
      dashBtn.addEventListener('touchstart', triggerDash, { passive: false });
      dashBtn.addEventListener('pointerdown', triggerDash);
    }
  }

  public setWaveInfo(title: string, remainingEnemies: number) {
    const titleEl = this.container.querySelector('#wave-title-text');
    const mobsEl = this.container.querySelector('#wave-mobs-text');
    if (titleEl) titleEl.textContent = title;
    if (mobsEl) mobsEl.textContent = `Enemies remaining: ${remainingEnemies}`;
  }

  public showToast(message: string) {
    const toast = this.container.querySelector('#hud-toast-banner') as HTMLElement;
    if (!toast) return;
    toast.textContent = message;
    toast.style.display = 'block';
    setTimeout(() => {
      toast.style.display = 'none';
    }, 3800);
  }

  
  private setupInviteListener() {
    network.listenForInvites((inviteData) => {
      // Play sound
      audio.playLevelUp(); // Reusing level up sound as notification

      const overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.inset = '0';
      overlay.style.backgroundColor = 'rgba(0,0,0,0.85)';
      overlay.style.display = 'flex';
      overlay.style.flexDirection = 'column';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';
      overlay.style.zIndex = '100000'; // above everything
      overlay.style.pointerEvents = 'auto'; // enable clicks
      overlay.style.fontFamily = "'Outfit', sans-serif";
      
      const box = document.createElement('div');
      box.style.background = "url('/assets/kenney-rpg-ui/panel_brown.png') repeat";
      box.style.backgroundSize = "100% 100%";
      box.style.padding = '40px';
      box.style.border = '4px solid #4a2c11';
      box.style.borderRadius = '8px';
      box.style.textAlign = 'center';
      box.style.color = '#fff';
      box.style.width = '350px';

      const title = document.createElement('h2');
      title.innerText = 'CO-OP INVITE';
      title.style.margin = '0 0 10px 0';
      title.style.color = '#ffd700';

      const msg = document.createElement('p');
      msg.innerHTML = `<strong>${inviteData.fromName}</strong> has invited you to clear<br/><strong>${inviteData.dungeonId.toUpperCase().replace('_', ' ')}</strong>!`;
      msg.style.marginBottom = '20px';
      msg.style.lineHeight = '1.5';

      const btnWrapper = document.createElement('div');
      btnWrapper.style.display = 'flex';
      btnWrapper.style.gap = '10px';
      btnWrapper.style.justifyContent = 'center';

      const acceptBtn = document.createElement('button');
      acceptBtn.innerText = 'ACCEPT';
      acceptBtn.style.background = "url('/assets/kenney-rpg-ui/buttonRound_blue.png') no-repeat center center";
      acceptBtn.style.backgroundSize = "100% 100%";
      acceptBtn.style.border = 'none';
      acceptBtn.style.padding = '8px 24px';
      acceptBtn.style.color = '#fff';
      acceptBtn.style.cursor = 'pointer';
      acceptBtn.style.fontWeight = 'bold';
      
      const declineBtn = document.createElement('button');
      declineBtn.innerText = 'DECLINE';
      declineBtn.style.background = '#4a2c11';
      declineBtn.style.border = '2px solid #fff';
      declineBtn.style.padding = '8px 24px';
      declineBtn.style.color = '#fff';
      declineBtn.style.cursor = 'pointer';
      declineBtn.style.fontWeight = 'bold';

      declineBtn.onclick = () => {
        document.body.removeChild(overlay);
      };

      acceptBtn.onclick = () => {
        document.body.removeChild(overlay);

        // Join room and wait for dungeon_start
        // Accepting puts you in the party LOBBY. The run begins only when the
        // leader presses START, which arrives as dungeon_start below.
        network.acceptInvite(inviteData.roomId, (roomData) => {
          if (this.game) {
             // network.isHost was set from this same packet by NetworkManager.
             this.game.onSelectLocation(roomData.dungeonId, network.isHost);
          }
        });
        this.game?.showScreen('lobby');
      };

      btnWrapper.appendChild(acceptBtn);
      btnWrapper.appendChild(declineBtn);

      box.appendChild(title);
      box.appendChild(msg);
      box.appendChild(btnWrapper);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
    });
  }

  public update() {
    const p = this.engine.player;

    // HP, MP, EXP bars with delayed hit lag catchup
    const hpBar = this.container.querySelector('#hud-hp-bar') as HTMLElement;
    const hpLag = this.container.querySelector('#hud-hp-lag') as HTMLElement;
    const mpBar = this.container.querySelector('#hud-mp-bar') as HTMLElement;
    const mpLag = this.container.querySelector('#hud-mp-lag') as HTMLElement;
    const expBar = this.container.querySelector('#hud-exp-bar') as HTMLElement;
    const goldText = this.container.querySelector('#hud-gold-text');

    const hpPct = Math.max(0, (p.hp / p.maxHp) * 100);
    const mpPct = Math.max(0, (p.mp / p.maxMp) * 100);
    const expPct = Math.max(0, (p.exp / p.maxExp) * 100);

    if (hpBar) hpBar.style.width = `${hpPct}%`;
    if (hpLag) hpLag.style.width = `${hpPct}%`;
    if (mpBar) mpBar.style.width = `${mpPct}%`;
    if (mpLag) mpLag.style.width = `${mpPct}%`;
    if (expBar) expBar.style.width = `${expPct}%`;
    if (goldText) goldText.textContent = `${p.gold}`;

    // The level number only ever existed in the render() template, and nothing
    // calls render() during a fight - so levelling up mid-dungeon showed the
    // bars reset while the number stayed on the old level until something else
    // rebuilt the HUD. It updates with everything else now.
    const levelText = this.container.querySelector('#hud-level-text');
    if (levelText) levelText.textContent = `Lv. ${p.level}`;

    // The ID is assigned when the account is created, which can happen after
    // the HUD has already been built once.
    this.paintPotionSlot();

    const powerText = this.container.querySelector('#hud-power');
    if (powerText) {
      // innerHTML, not textContent: the value carries a glyph, and assigning
      // markup as text printed the whole <svg ...> tag across the plate.
      const value = `${GameHUD.glyph('spark')} ${this.engine.computePower().toLocaleString()}`;
      if (powerText.innerHTML !== value) powerText.innerHTML = value;
    }

    // Town Return button
    const townBtn = this.container.querySelector('#return-town-btn') as HTMLElement;
    if (townBtn) {
      townBtn.style.display = this.engine.isTownMode ? 'none' : 'block';
    }

    // Touch Talk Button, which doubles as the revive button. In town it talks;
    // in a dungeon standing over a downed teammate it picks them up. The two
    // never apply at once, so one button covers both without extra clutter.
    const talkBtn = this.container.querySelector('#touch-talk-btn') as HTMLElement;
    if (talkBtn) {
      const activeNpc = this.engine.townHub?.getActiveNpc();
      const downedAlly = this.engine.nearestDownedAlly();
      const label = talkBtn.querySelector('span');
      if (downedAlly && !this.engine.isTownMode) {
        talkBtn.style.display = 'flex';
        talkBtn.classList.add('touch-revive-btn');
        if (label) label.textContent = 'REVIVE';
      } else {
        talkBtn.classList.remove('touch-revive-btn');
        if (label) label.textContent = 'TALK';
        talkBtn.style.display = (this.engine.isTownMode && activeNpc) ? 'flex' : 'none';
      }
    }

    this.paintDownedOverlay();
    const idText = this.container.querySelector('#hud-id-text');
    const shortId = localStorage.getItem('playerShortId');
    if (idText && shortId && idText.textContent !== shortId) idText.textContent = shortId;

    this.paintThreat();
    this.paintAllyRail();

    // Mini Quest Tracker update
    const activeQuests = quests.getAllActiveQuests();
    const qNameEl = this.container.querySelector('#tracker-quest-name');
    const qListEl = this.container.querySelector('#tracker-obj-list');

    if (qNameEl && qListEl) {
      if (activeQuests.length > 0) {
        const topQ = activeQuests[0];
        qNameEl.textContent = topQ.quest.title;
        qListEl.innerHTML = topQ.objectives.map(obj => `
          <div style="color: ${obj.isCompleted ? '#4ade80' : '#cbd5e1'};">
            ${GameHUD.glyph(obj.isCompleted ? 'check' : 'box')} ${obj.description} (${obj.currentCount}/${obj.requiredCount})
          </div>
        `).join('');
      } else {
        qNameEl.textContent = 'No Active Quest';
        qListEl.innerHTML = `<div>Visit Elder Justinian in Eldermoor</div>`;
      }
    }

    // Top Boss Health Bar (MapleStory / Dark Souls Style)
    const bossBanner = this.container.querySelector('#epic-boss-banner') as HTMLElement;
    const waveBanner = this.container.querySelector('#dungeon-wave-banner') as HTMLElement;
    const activeBoss = this.engine.enemies.find(e => !e.isDead && e.type === 'boss');

    if (activeBoss && !this.engine.isTownMode) {
      if (bossBanner) {
        bossBanner.style.display = 'flex';
        const nameEl = this.container.querySelector('#boss-name-text');
        const pctEl = this.container.querySelector('#boss-hp-percentage');
        const fillEl = this.container.querySelector('#boss-hp-fill') as HTMLElement;
        const lagEl = this.container.querySelector('#boss-hp-lag') as HTMLElement;
        const iconEl = this.container.querySelector('#boss-portrait-icon');

        const hpPct = Math.max(0, (activeBoss.hp / activeBoss.maxHp) * 100);
        if (nameEl) nameEl.textContent = activeBoss.name.toUpperCase();
        if (pctEl) pctEl.textContent = `${Math.ceil(hpPct)}% (${activeBoss.hp} / ${activeBoss.maxHp})`;
        if (fillEl) fillEl.style.width = `${hpPct}%`;
        if (lagEl) lagEl.style.width = `${hpPct}%`;
        if (iconEl) {
          iconEl.innerHTML = `<img src='/assets/gui/PNG/buttonSquare_brown.png' width='32' height='32' style='image-rendering:pixelated;' />`;
        }
      }
      if (waveBanner) waveBanner.style.display = 'none';
    } else {
      if (bossBanner) bossBanner.style.display = 'none';
      if (waveBanner) waveBanner.style.display = 'flex';
    }

    // Wave Banner in Town vs Dungeon
    const waveTitle = this.container.querySelector('#wave-title-text');
    const waveMobs = this.container.querySelector('#wave-mobs-text');
    if (this.engine.isTownMode && waveTitle && waveMobs) {
      waveTitle.textContent = 'HAVEN OF ELDERMOOR';
      waveMobs.textContent = 'Peaceful Town Sanctuary';
    }

    // Update Skill Cooldowns
    p.characterClass.skills.forEach(skill => {
      const overlay = this.container.querySelector(`#cd-overlay-${skill.id}`) as HTMLElement;
      const cd = p.skillCooldowns[skill.id] || 0;
      if (overlay) {
        if (cd > 0) {
          overlay.style.display = 'flex';
          overlay.textContent = cd.toFixed(1);
        } else {
          overlay.style.display = 'none';
        }
      }
    });

    // Update Dash Cooldown
    const dashOverlay = this.container.querySelector('#dash-cooldown-overlay') as HTMLElement;
    const dashBtn = this.container.querySelector('#touch-dash-btn') as HTMLElement;
    const dashCd = p.dashCooldown || 0;
    if (dashOverlay && dashBtn) {
      if (dashCd > 0) {
        dashOverlay.style.display = 'flex';
        dashOverlay.textContent = dashCd.toFixed(1);
        dashBtn.style.opacity = '0.55';
      } else {
        dashOverlay.style.display = 'none';
        dashBtn.style.opacity = '1';
      }
    }

    // Combo
    const comboEl = this.container.querySelector('#combo-display') as HTMLElement;
    if (comboEl) {
      if (p.comboCount > 1 && p.comboTimer > 0) {
        comboEl.style.display = 'block';
        comboEl.textContent = `${p.comboCount}x COMBO!`;
      } else {
        comboEl.style.display = 'none';
      }
    }

    // Portrait canvas
    const portraitCvs = this.container.querySelector('#hud-portrait-cvs') as HTMLCanvasElement;
    if (portraitCvs) {
      const ctx = portraitCvs.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, portraitCvs.width, portraitCvs.height);
        ctx.save();
        ctx.translate(portraitCvs.width / 2, portraitCvs.height - 4);
        ctx.scale(0.65, 0.65);
        sprites.drawHero(ctx, 0, 0, p.characterClass.id, 'idle', 1, 0);
        ctx.restore();
      }
    }
  }

  private selectItemForInspection(item: ItemData, isEquipped: boolean, slotOrIdx: string | number) {
    this.selectedItem = { item, isEquipped, slotOrIdx };
    this.renderInspectorPane();
  }

  /**
   * The difference this item would make, slot by slot.
   *
   * Only the stats that actually change are listed - a wall of "+0" is noise,
   * and the one line that matters gets lost in it.
   */
  private compareWithEquipped(item: ItemData): string {
    const equipped = (this.engine.player.equipment as any)[item.type] as ItemData | undefined;

    const rows: string[] = [];
    const stats: Array<[string, string, number]> = [
      [GameHUD.glyph('sword'), 'ATK', 1], [GameHUD.glyph('shield'), 'DEF', 1], [GameHUD.glyph('heart'), 'HP', 1],
      [GameHUD.glyph('orb'), 'MP', 1], [GameHUD.glyph('spark'), 'CRIT', 100], [GameHUD.glyph('wind'), 'SPD', 1],
    ];
    const keys = ['atk', 'def', 'hp', 'mp', 'crit', 'speed'];

    let better = 0;
    let worse = 0;

    keys.forEach((key, i) => {
      const [icon, label, scale] = stats[i];
      const mine = ((item.stats as any)?.[key] || 0) * scale;
      const theirs = ((equipped?.stats as any)?.[key] || 0) * scale;
      const delta = Math.round((mine - theirs) * 10) / 10;
      if (delta === 0) return;
      if (delta > 0) better++; else worse++;
      const colour = delta > 0 ? '#4ade80' : '#f87171';
      const arrow = delta > 0 ? '▲' : '▼';
      rows.push(`<span class="cmp-chip" style="color:${colour}">${icon} ${arrow} ${delta > 0 ? '+' : ''}${delta}${label === 'CRIT' ? '%' : ''} ${label}</span>`);
    });

    if (!equipped) {
      return `<div class="cmp-row"><span class="cmp-head cmp-up">EMPTY SLOT — pure gain</span>${rows.join('')}</div>`;
    }
    if (!rows.length) {
      return `<div class="cmp-row"><span class="cmp-head">Identical to your ${equipped.name}</span></div>`;
    }

    const verdict = better && !worse ? ['UPGRADE', 'cmp-up']
      : worse && !better ? ['DOWNGRADE', 'cmp-down']
      : ['SIDEGRADE', 'cmp-side'];

    return `<div class="cmp-row">
      <span class="cmp-head ${verdict[1]}">${verdict[0]} vs ${equipped.name}</span>
      ${rows.join('')}
    </div>`;
  }

  private renderInspectorPane() {
    const pane = this.container.querySelector('#item-inspector-pane');
    if (!pane) return;

    if (!this.selectedItem) {
      pane.innerHTML = `<div style="font-size: 11px; color: #64748b; font-style: italic; text-align: center;">Click any item or equipment slot to inspect details & stats</div>`;
      return;
    }

    const { item, isEquipped, slotOrIdx } = this.selectedItem;
    const rConfig = RARITY_CONFIGS[item.rarity] || RARITY_CONFIGS.common;

    // Stat bonuses breakdown
    const statChips: string[] = [];
    if (item.stats) {
      if (item.stats.atk) statChips.push(`<span class="stat-chip">${GameHUD.glyph('sword')} +${item.stats.atk} ATK</span>`);
      if (item.stats.def) statChips.push(`<span class="stat-chip">${GameHUD.glyph('shield')} +${item.stats.def} DEF</span>`);
      if (item.stats.hp) statChips.push(`<span class="stat-chip">${GameHUD.glyph('heart')} +${item.stats.hp} HP</span>`);
      if (item.stats.mp) statChips.push(`<span class="stat-chip">${GameHUD.glyph('orb')} +${item.stats.mp} MP</span>`);
      if (item.stats.crit) statChips.push(`<span class="stat-chip">${GameHUD.glyph('spark')} +${Math.round(item.stats.crit * 100)}% CRIT</span>`);
      if (item.stats.speed) statChips.push(`<span class="stat-chip">${GameHUD.glyph('wind')} +${item.stats.speed} SPD</span>`);
    }
    // Against what you are already wearing.
    //
    // The core loop is kill, loot, equip, and deciding whether a drop is an
    // upgrade meant opening the bag, reading one item's numbers, opening
    // another and comparing them from memory. The numbers were all there; the
    // subtraction was left to the player.
    const comparison = !isEquipped && item.type !== 'consumable'
      ? this.compareWithEquipped(item)
      : '';

    if (item.consumableEffect) {
      if (item.consumableEffect.type === 'heal_hp') statChips.push(`<span class="stat-chip">${GameHUD.glyph('heart')} Heals +${item.consumableEffect.value} HP</span>`);
      if (item.consumableEffect.type === 'heal_mp') statChips.push(`<span class="stat-chip">${GameHUD.glyph('orb')} Restores +${item.consumableEffect.value} MP</span>`);
      if (item.consumableEffect.type === 'buff_atk') statChips.push(`<span class="stat-chip">${GameHUD.glyph('sword')} +${Math.round((item.consumableEffect.value - 1) * 100)}% ATK (${item.consumableEffect.duration || 10}s)</span>`);
      if (item.consumableEffect.type === 'buff_speed') statChips.push(`<span class="stat-chip">${GameHUD.glyph('wind')} +${Math.round((item.consumableEffect.value - 1) * 100)}% SPD (${item.consumableEffect.duration || 10}s)</span>`);
      if (item.consumableEffect.type === 'revive') statChips.push(`<span class="stat-chip">${GameHUD.glyph('spark')} Revives with ${item.consumableEffect.value} HP</span>`);
    }

    pane.innerHTML = `
      <div class="inspector-header">
        <div class="inspector-icon-box rarity-${item.rarity}">
          ${item.image ? `<img src="${item.image}" width="32" height="32" style="image-rendering:pixelated;" />` : ''}
        </div>
        <div class="inspector-title-col">
          <div class="inspector-item-name" style="color: ${rConfig.color};">${item.name}</div>
          <div class="inspector-rarity-pill">
            <span style="color: ${rConfig.color};">${rConfig.name}</span>
            <span style="color: #64748b;">• ${item.type.toUpperCase()}</span>
          </div>
        </div>
      </div>
      ${statChips.length > 0 ? `<div class="inspector-stats-grid">${statChips.join('')}</div>` : ''}
      ${comparison}
      <div class="inspector-desc">${item.description}</div>
      <div class="inspector-actions">
        ${isEquipped
          ? `<button class="inspector-btn inspector-btn-danger" id="inspector-unequip-btn">UNEQUIP</button>`
          : item.type === 'consumable'
            ? `<button class="inspector-btn" id="inspector-action-btn">USE</button>`
            : `<button class="inspector-btn" id="inspector-action-btn">EQUIP</button>`
        }
        <button class="inspector-btn inspector-btn-danger" id="inspector-close-btn">CLOSE</button>
      </div>
    `;

    // Action listener
    const actBtn = pane.querySelector('#inspector-action-btn');
    actBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.engine.useOrEquipItem(Number(slotOrIdx));
      this.selectedItem = null;
      this.render();
      this.renderInventoryItems();
    });

    const unequipBtn = pane.querySelector('#inspector-unequip-btn');
    unequipBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.engine.unequipItem(String(slotOrIdx) as any);
      this.selectedItem = null;
      this.render();
      this.renderInventoryItems();
    });

    const closeBtn = pane.querySelector('#inspector-close-btn');
    closeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.selectedItem = null;
      this.renderInspectorPane();
    });
  }

  /**
   * Your own bleed-out. The world-space marker tells teammates where you are;
   * this tells you how long you have, because from the floor you cannot see
   * whether anyone is coming.
   */
  /**
   * Put the moment's threat level on the container so CSS can respond. Written
   * only when it changes: touching className every frame would restart the
   * transition on each one and the fade would never actually run.
   */
  /**
   * The party, as a rail under your own plate.
   *
   * Rebuilt only when the shape of the party changes; the bars themselves are
   * written in place every frame. Rebuilding the markup each frame would throw
   * away the width transition on every bar and make a smooth drain look like a
   * stutter.
   */
  private paintAllyRail() {
    const rail = this.container.querySelector('#ally-rail') as HTMLElement;
    if (!rail || !this.engine) return;

    const ids = Object.keys(network.remotePlayers);
    if (!ids.length) {
      if (rail.classList.contains('has-allies')) {
        rail.classList.remove('has-allies');
        rail.innerHTML = '';
        this.allyKey = '';
      }
      return;
    }
    rail.classList.add('has-allies');

    const key = ids.join('|');
    if (key !== this.allyKey) {
      this.allyKey = key;
      rail.innerHTML = ids.map(id => {
        const r = network.remotePlayers[id];
        const cls = CHARACTER_CLASSES.find(c => c.id === r.classId);
        const accent = cls?.themeColor || '#4fade5';
        return `
          <div class="ally" data-ally="${id}" style="--ally:${accent}">
            <span class="ally-name">${r.name || 'Ally'}</span>
            <span class="ally-down-tag" style="display:none">DOWN</span>
            <span class="ally-hp"><span class="ally-hp-fill" style="width:100%"></span></span>
          </div>`;
      }).join('');
    }

    ids.forEach(id => {
      const r = network.remotePlayers[id];
      const row = rail.querySelector(`[data-ally="${id}"]`) as HTMLElement;
      if (!row) return;
      const pct = Math.max(0, Math.min(100, r.hpPct ?? 100));
      const fill = row.querySelector('.ally-hp-fill') as HTMLElement;
      if (fill) {
        fill.style.width = `${r.downed ? 0 : pct}%`;
        fill.className = `ally-hp-fill${pct <= 25 ? ' critical' : pct <= 55 ? ' hurt' : ''}`;
      }
      row.classList.toggle('is-down', !!r.downed);
      const tag = row.querySelector('.ally-down-tag') as HTMLElement;
      if (tag) tag.style.display = r.downed ? 'inline' : 'none';
    });
  }

  private paintThreat() {
    if (!this.engine) return;
    const level = this.engine.threatLevel();
    // Town never dims. The level there is always 0, so the HUD sat stepped back
    // the entire time you were in the one place you actually stand around
    // reading it. The fade exists to clear the view during a fight; in town
    // there is nothing competing with it.
    // Town gets its own class rather than borrowing 'alert'. Nothing is alert
    // about standing in a town, and a future change to the alert styling would
    // have silently reached in here.
    const cls = this.engine.isTownMode ? 'hud-town'
      : level === 2 ? 'hud-boss'
      : level === 1 ? 'hud-alert'
      : 'hud-calm';
    if (this.threatClass === cls) return;
    this.threatClass = cls;
    this.container.classList.remove('hud-calm', 'hud-alert', 'hud-boss', 'hud-town');
    this.container.classList.add(cls);
  }

  /**
   * Shut every panel this HUD owns. Called when a full screen takes over, so
   * the pause menu, the skills panel and the chat wheel cannot be left hanging
   * behind a map or a lobby.
   */
  public closePanels() {
    ['#pause-back', '#skills-back', '#play-back'].forEach((sel) => {
      const el = this.container.querySelector(sel) as HTMLElement | null;
      if (el) el.style.display = 'none';
    });
    this.container.querySelector('#qc-wheel')?.classList.remove('open');
  }

  private paintDownedOverlay() {
    const overlay = this.container.querySelector('#downed-overlay') as HTMLElement;
    if (!overlay || !this.engine) return;
    const p = this.engine.player;
    if (!p.downed) {
      overlay.classList.remove('is-down');
      return;
    }
    overlay.classList.add('is-down');
    const left = Math.max(0, p.downTimer || 0);
    const pct = Math.max(0, Math.min(1, left / SideViewEngine.BLEED_OUT_SECONDS));
    const fill = this.container.querySelector('#downed-fill') as HTMLElement;
    if (fill) fill.style.width = `${pct * 100}%`;
    const sub = this.container.querySelector('#downed-sub') as HTMLElement;
    if (sub) sub.textContent = `${left.toFixed(0)}s - a teammate can still reach you`;
  }

  private paintPotionSlot() {
    const slot = this.container.querySelector('#potion-slot') as HTMLElement;
    const count = this.container.querySelector('#potion-count');
    if (!slot || !count) return;
    const n = this.engine.potionCount;
    count.textContent = String(n);
    slot.classList.toggle('empty', n === 0);
  }

  private renderInventoryItems() {
    const bagGrid = this.container.querySelector('#inv-bag-grid');
    if (!bagGrid) return;
    const p = this.engine.player;

    // Render bag slots
    bagGrid.innerHTML = p.inventory.map((item, idx) => `
      <div class="bag-slot rarity-${item.rarity}" data-inv-idx="${idx}" title="${item.name} (${item.rarity.toUpperCase()})">
        ${item.image ? `<img src="${item.image}" width="28" height="28" style="image-rendering:pixelated;" />` : ''}
      </div>
    `).join('');

    // Bag slot click handlers
    const slots = bagGrid.querySelectorAll('.bag-slot');
    slots.forEach(slot => {
      const onSlotClick = (e: Event) => {
        e.stopPropagation();
        const idx = Number(slot.getAttribute('data-inv-idx'));
        const itm = p.inventory[idx];
        if (itm) {
          audio.playClick();
          this.selectItemForInspection(itm, false, idx);
        }
      };
      slot.addEventListener('click', onSlotClick);
      slot.addEventListener('touchstart', onSlotClick, { passive: true });
    });

    // Equipment Paperdoll slot click handlers
    const paperdollSlots = this.container.querySelectorAll('.equipment-paperdoll .equip-slot');
    paperdollSlots.forEach(eqSlot => {
      const onEquipClick = (e: Event) => {
        e.stopPropagation();
        const slotKey = eqSlot.getAttribute('data-slot') as keyof typeof p.equipment;
        const itm = p.equipment[slotKey];
        if (itm) {
          audio.playClick();
          this.selectItemForInspection(itm, true, slotKey);
        }
      };
      eqSlot.addEventListener('click', onEquipClick);
      eqSlot.addEventListener('touchstart', onEquipClick, { passive: true });
    });

    // Render current inspector pane state
    this.renderInspectorPane();
  }
}
