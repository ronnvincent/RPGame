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
import { ItemData } from '../items/ItemDatabase';
import { audio } from '../engine/AudioManager';
import { sprites } from '../engine/SpriteManager';
import { SkillDefinition } from '../classes/ClassDefinitions';
import { SideViewGame } from '../SideViewGame';
import { quests } from '../quests/QuestManager';
import { QuestLogUI } from './QuestLogUI';
import { WorldMapUI } from './WorldMapUI';

export class GameHUD {
  private container: HTMLElement;
  private engine: SideViewEngine;
  private game?: SideViewGame;
  private inventoryOpen: boolean = false;
  public questLogUI: QuestLogUI | null = null;
  public worldMapUI: WorldMapUI | null = null;

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
      .player-status-panel {
        position: absolute;
        top: max(8px, env(safe-area-inset-top));
        left: max(8px, env(safe-area-inset-left));
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

      .sprite-bar-fill {
        height: 100%;
        transition: width 0.15s ease;
      }

      .sprite-bar-hp {
        background: url('/assets/kenney-rpg-ui/barRed_horizontalMid.png') repeat-x;
        background-size: auto 100%;
      }

      .sprite-bar-exp {
        background: url('/assets/kenney-rpg-ui/barYellow_horizontalMid.png') repeat-x;
        background-size: auto 100%;
        height: 8px;
      }

      /* Top Center: Wave Banner with Sprite Panel */
      .dungeon-wave-banner {
        position: absolute;
        top: 10px;
        left: 50%;
        transform: translateX(-50%);
        background: url('/assets/kenney-rpg-ui/panel_brown.png') repeat;
        background-size: 100% 100%;
        padding: 6px 24px;
        text-align: center;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.85);
        pointer-events: none;
        z-index: 10;
      }

      .wave-title {
        font-size: 11px;
        font-weight: 900;
        color: #ffd700;
        letter-spacing: 1px;
        text-transform: uppercase;
        text-shadow: 1px 1px 2px #000;
        white-space: nowrap;
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
      .hud-top-right {
        position: absolute;
        top: max(8px, env(safe-area-inset-top));
        right: max(8px, env(safe-area-inset-right));
        display: flex;
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
        top: 48px;
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

      .joystick-knob::before {
        content: '❖';
        color: #ffd700;
        font-size: 15px;
        text-shadow: 0 0 4px #000;
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
        .dungeon-wave-banner {
          top: 52px; /* Safely tucked under the player health bar */
          left: 6px;
          transform: none;
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
          gap: 2px;
          transform: scale(0.85);
          transform-origin: top right;
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
          width: 80px;
          height: 80px;
          bottom: calc(20px + env(safe-area-inset-bottom));
          right: calc(20px + env(safe-area-inset-right));
          z-index: 10;
        }
        .hotbar-slot[data-skill-idx="0"] .slot-icon-img {
          width: 44px;
          height: 44px;
        }

        /* Perfect Arc layout for active skills 1-5 */
        .hotbar-slot[data-skill-idx="1"] { bottom: calc(38px + env(safe-area-inset-bottom)); right: calc(128px + env(safe-area-inset-right)); }
        .hotbar-slot[data-skill-idx="2"] { bottom: calc(72px + env(safe-area-inset-bottom)); right: calc(121px + env(safe-area-inset-right)); }
        .hotbar-slot[data-skill-idx="3"] { bottom: calc(101px + env(safe-area-inset-bottom)); right: calc(101px + env(safe-area-inset-right)); }
        .hotbar-slot[data-skill-idx="4"] { bottom: calc(121px + env(safe-area-inset-bottom)); right: calc(72px + env(safe-area-inset-right)); }
        .hotbar-slot[data-skill-idx="5"] { bottom: calc(128px + env(safe-area-inset-bottom)); right: calc(38px + env(safe-area-inset-right)); width: 36px; height: 36px; }

        .mobile-joystick-area {
          bottom: max(20px, env(safe-area-inset-bottom));
          left: max(20px, env(safe-area-inset-left));
          width: 120px;
          height: 120px;
        }
        .joystick-base {
          width: 105px;
          height: 105px;
        }
        .joystick-knob {
          width: 44px;
          height: 44px;
        }

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

        .jump-touch-btn {
          width: 52px;
          height: 52px;
          bottom: calc(106px + env(safe-area-inset-bottom));
          right: calc(159px + env(safe-area-inset-right));
          font-size: 9px;
        }
        .dash-touch-btn {
          width: 46px;
          height: 46px;
          bottom: calc(37px + env(safe-area-inset-bottom));
          right: calc(177px + env(safe-area-inset-right));
          font-size: 8.5px;
        }
        .touch-talk-btn {
          width: 46px;
          height: 46px;
          bottom: calc(172px + env(safe-area-inset-bottom));
          right: calc(100px + env(safe-area-inset-right));
          font-size: 8.5px;
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
        grid-template-columns: 1fr 1.3fr;
        gap: 10px;
      }

      @media (max-width: 520px) {
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
        height: 44px;
        background: url('/assets/kenney-rpg-ui/buttonSquare_beige.png') no-repeat center center;
        background-size: 100% 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        position: relative;
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
        max-height: 200px;
        overflow-y: auto;
      }

      .bag-slot {
        width: 44px;
        height: 44px;
        background: url('/assets/kenney-rpg-ui/buttonSquare_beige.png') no-repeat center center;
        background-size: 100% 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        position: relative;
        padding: 2px;
      }

      .bag-slot:active {
        background-image: url('/assets/kenney-rpg-ui/buttonSquare_beige_pressed.png');
        transform: scale(0.96);
      }
    `;
    document.head.appendChild(style);
  }

  public render() {
    const p = this.engine.player;

    this.container.innerHTML = `
      <!-- Top Left: Player Status with Authentic Sprite Frame -->
      <div class="player-status-panel">
        <div class="player-portrait-box">
          <canvas class="player-portrait-canvas" id="hud-portrait-cvs" width="48" height="48"></canvas>
        </div>
        <div class="player-bars">
          <div class="player-name-row">
            <span style="color: ${p.characterClass.accentColor}">${p.characterClass.name}</span>
            <span style="color: #ffd700">Lv. ${p.level}</span>
          </div>
          <!-- HP Bar Sprite Frame -->
          <div class="sprite-bar-frame" title="Health (HP)">
            <div class="sprite-bar-fill sprite-bar-hp" id="hud-hp-bar" style="width: 100%"></div>
          </div>
          <!-- EXP Bar Sprite Frame -->
          <div class="sprite-bar-frame" style="height: 8px;" title="Experience (EXP)">
            <div class="sprite-bar-fill sprite-bar-exp" id="hud-exp-bar" style="width: 0%"></div>
          </div>
        </div>
      </div>

      <!-- Top Center: Wave Status -->
      <div class="dungeon-wave-banner" id="dungeon-wave-banner">
        <div class="wave-title" id="wave-title-text">DUNGEON BATTLE</div>
        <div class="wave-mobs-left" id="wave-mobs-text">Enemies remaining: 0</div>
      </div>

      <!-- Top Center: Epic Boss Health Bar (MapleStory / Dark Souls Style) -->
      <div class="epic-boss-banner" id="epic-boss-banner" style="display: none;">
        <div class="boss-portrait-icon" id="boss-portrait-icon">👹</div>
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

      <!-- Top Right: Gold, Audio Toggles & Navigation Buttons -->
      <div class="hud-top-right">
        <div class="gold-badge">🪙 <span id="hud-gold-text">${p.gold}</span></div>
        <button class="inv-btn inv-btn-fs" id="toggle-music-btn" title="Toggle Music">🎵</button>
        <button class="inv-btn inv-btn-fs" id="toggle-sfx-btn" title="Toggle Sound SFX">🔊</button>
        <button class="inv-btn inv-btn-quest" id="toggle-quests-btn">QUESTS [ J ]</button>
        <button class="inv-btn inv-btn-quest" id="toggle-map-btn">MAP [ M ]</button>
        <button class="inv-btn inv-btn-town" id="return-town-btn" style="display: ${this.engine.isTownMode ? 'none' : 'block'};">TOWN [ T ]</button>
        <button class="inv-btn" id="toggle-inv-btn">BAG [ I ]</button>
        <button class="inv-btn inv-btn-fs" id="toggle-fullscreen-btn" title="Toggle Fullscreen">⛶</button>
      </div>

      <!-- Mini Quest Tracker -->
      <div class="mini-quest-tracker" id="mini-quest-tracker">
        <div class="tracker-title">
          <span>📜 ACTIVE QUEST</span>
          <span style="font-size: 8.5px; color: #94a3b8;">[CLICK / J]</span>
        </div>
        <div class="tracker-quest-name" id="tracker-quest-name">Act I: The Stolen Keystone</div>
        <div class="tracker-obj-list" id="tracker-obj-list">
          <div>Talk to Elder Justinian in Eldermoor</div>
        </div>
      </div>

      <!-- Bottom Center: 6-Skill Cooldown Hotbar with Kyrise Icons & Sprite Slots -->
      <div class="skills-hotbar" id="skills-hotbar">
        ${p.characterClass.skills.map((s, idx) => `
          <div class="hotbar-slot" data-skill-idx="${idx}" title="${s.name} (${s.description})">
            <span class="slot-key-badge">${s.key}</span>
            <img src="${this.getSkillIcon(s, p.characterClass.id)}" width="24" height="24" class="slot-icon-img" />
            <span class="slot-skill-name">${s.name}</span>
            <div class="slot-cooldown-overlay" id="cd-overlay-${s.id}">0</div>
          </div>
        `).join('')}
      </div>

      <!-- MULTI-DEVICE VIRTUAL TOUCH CONTROLS (Joystick, Jump, Dash with Real Sprites) -->
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
        <div class="mobile-action-hub">
          <button class="touch-action-btn touch-talk-btn" id="touch-talk-btn">
            <span style="font-size: 16px;">💬</span>
            <span>TALK</span>
          </button>
          <button class="touch-action-btn jump-touch-btn" id="touch-jump-btn">
            <span style="font-size: 18px;">▲</span>
            <span>JUMP</span>
          </button>
          <button class="touch-action-btn dash-touch-btn" id="touch-dash-btn">
            <span style="font-size: 15px;">⚡</span>
            <span>DASH</span>
            <div class="dash-cooldown-overlay" id="dash-cooldown-overlay">0</div>
          </button>
        </div>
      </div>

      <!-- Inventory Modal -->
      <div class="inventory-modal" id="inventory-modal">
        <div class="inv-header">
          <h2 class="inv-title">HERO INVENTORY & EQUIPMENT</h2>
          <button class="inv-close-btn" id="close-inv-btn">✕</button>
        </div>
        <div class="inv-grid-container">
          <!-- Left: Equipment Paperdoll Slots -->
          <div class="equipment-paperdoll">
            <div class="equip-slot ${p.equipment.helmet ? 'filled' : ''}" data-slot="helmet">
              <span class="equip-slot-label">Helm</span>
              ${p.equipment.helmet ? `<img src="${p.equipment.helmet.image}" width="28" height="28" style="image-rendering:pixelated;" />` : ''}
            </div>
            <div class="equip-slot ${p.equipment.wings ? 'filled' : ''}" data-slot="wings">
              <span class="equip-slot-label">Wings</span>
              ${p.equipment.wings ? `<img src="${p.equipment.wings.image}" width="28" height="28" style="image-rendering:pixelated;" />` : ''}
            </div>
            <div class="equip-slot ${p.equipment.amulet ? 'filled' : ''}" data-slot="amulet">
              <span class="equip-slot-label">Amulet</span>
              ${p.equipment.amulet ? `<img src="${p.equipment.amulet.image}" width="28" height="28" style="image-rendering:pixelated;" />` : ''}
            </div>
            <div class="equip-slot ${p.equipment.weapon ? 'filled' : ''}" data-slot="weapon">
              <span class="equip-slot-label">Weapon</span>
              ${p.equipment.weapon ? `<img src="${p.equipment.weapon.image}" width="28" height="28" style="image-rendering:pixelated;" />` : ''}
            </div>
            <div class="equip-slot ${p.equipment.armor ? 'filled' : ''}" data-slot="armor">
              <span class="equip-slot-label">Armor</span>
              ${p.equipment.armor ? `<img src="${p.equipment.armor.image}" width="28" height="28" style="image-rendering:pixelated;" />` : ''}
            </div>
            <div class="equip-slot ${p.equipment.shield ? 'filled' : ''}" data-slot="shield">
              <span class="equip-slot-label">Shield</span>
              ${p.equipment.shield ? `<img src="${p.equipment.shield.image}" width="28" height="28" style="image-rendering:pixelated;" />` : ''}
            </div>
            <div class="equip-slot ${p.equipment.ring ? 'filled' : ''}" data-slot="ring">
              <span class="equip-slot-label">Ring</span>
              ${p.equipment.ring ? `<img src="${p.equipment.ring.image}" width="28" height="28" style="image-rendering:pixelated;" />` : ''}
            </div>
            <div class="equip-slot ${p.equipment.boots ? 'filled' : ''}" data-slot="boots">
              <span class="equip-slot-label">Boots</span>
              ${p.equipment.boots ? `<img src="${p.equipment.boots.image}" width="28" height="28" style="image-rendering:pixelated;" />` : ''}
            </div>
          </div>

          <!-- Right: Bag Items -->
          <div class="inventory-bag" id="inv-bag-grid">
            <!-- Rendered dynamically -->
          </div>
        </div>
      </div>
    `;

    this.attachEvents();
    this.setupVirtualTouchGamepad();
  }

  private attachEvents() {
    // Inventory toggle
    const toggleBtn = this.container.querySelector('#toggle-inv-btn');
    const closeBtn = this.container.querySelector('#close-inv-btn');
    const invModal = this.container.querySelector('#inventory-modal') as HTMLElement;

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
      this.worldMapUI?.open();
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
      musicBtn.textContent = enabled ? '🎵' : '🔇';
      this.showToast(enabled ? '🎵 Music Enabled' : '🔇 Music Muted');
    });

    // Sound SFX toggle
    const sfxBtn = this.container.querySelector('#toggle-sfx-btn');
    sfxBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const enabled = audio.toggleSound();
      sfxBtn.textContent = enabled ? '🔊' : '🔈';
      this.showToast(enabled ? '🔊 SFX Enabled' : '🔈 SFX Muted');
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
    talkBtn?.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.game?.interactWithActiveNpc();
    }, { passive: false });

    // Skill Hotbar Click & Touch triggers skill with instant feedback
    const slots = this.container.querySelectorAll('.hotbar-slot');
    slots.forEach(slot => {
      const triggerSkill = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        const idx = Number(slot.getAttribute('data-skill-idx'));
        this.engine.castSkill(idx);
      };

      slot.addEventListener('click', triggerSkill);
      slot.addEventListener('pointerdown', triggerSkill);
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

    const handleJoystickMove = (clientX: number, clientY: number) => {
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

    window.addEventListener('touchmove', (e: TouchEvent) => {
      if (!this.joystickActive) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.joystickTouchId) {
          handleJoystickMove(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
          break;
        }
      }
    }, { passive: false });

    window.addEventListener('touchend', (e: TouchEvent) => {
      if (!this.joystickActive) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.joystickTouchId) {
          resetJoystick();
          break;
        }
      }
    }, { passive: false });

    window.addEventListener('touchcancel', () => resetJoystick(), { passive: true });

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

    window.addEventListener('pointermove', (e: PointerEvent) => {
      if (this.joystickActive && e.pointerType === 'mouse') {
        handleJoystickMove(e.clientX, e.clientY);
      }
    });

    window.addEventListener('pointerup', () => {
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

  public update() {
    const p = this.engine.player;

    // HP, MP, EXP bars
    const hpBar = this.container.querySelector('#hud-hp-bar') as HTMLElement;
    const expBar = this.container.querySelector('#hud-exp-bar') as HTMLElement;
    const goldText = this.container.querySelector('#hud-gold-text');

    if (hpBar) hpBar.style.width = `${Math.max(0, (p.hp / p.maxHp) * 100)}%`;
    if (expBar) expBar.style.width = `${Math.max(0, (p.exp / p.maxExp) * 100)}%`;
    if (goldText) goldText.textContent = `${p.gold}`;

    // Town Return button
    const townBtn = this.container.querySelector('#return-town-btn') as HTMLElement;
    if (townBtn) {
      townBtn.style.display = this.engine.isTownMode ? 'none' : 'block';
    }

    // Touch Talk Button
    const talkBtn = this.container.querySelector('#touch-talk-btn') as HTMLElement;
    if (talkBtn) {
      const activeNpc = this.engine.townHub?.getActiveNpc();
      talkBtn.style.display = (this.engine.isTownMode && activeNpc) ? 'flex' : 'none';
    }

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
            ${obj.isCompleted ? '☑️' : '◻️'} ${obj.description} (${obj.currentCount}/${obj.requiredCount})
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
          iconEl.textContent = activeBoss.name.includes('Dragon') ? '🐉' : activeBoss.name.includes('Lich') ? '💀' : activeBoss.name.includes('NightBorne') ? '🌌' : '👹';
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

  private renderInventoryItems() {
    const bagGrid = this.container.querySelector('#inv-bag-grid');
    if (!bagGrid) return;
    const p = this.engine.player;

    bagGrid.innerHTML = p.inventory.map((item, idx) => `
      <div class="bag-slot rarity-${item.rarity}" data-inv-idx="${idx}" title="${item.name} (${item.rarity.toUpperCase()})&#10;${item.description}">
        ${item.image ? `<img src="${item.image}" width="28" height="28" style="image-rendering:pixelated;" />` : ''}
      </div>
    `).join('');

    // Click/Touch to equip or use
    const slots = bagGrid.querySelectorAll('.bag-slot');
    slots.forEach(slot => {
      const useItem = (e: Event) => {
        e.stopPropagation();
        const idx = Number(slot.getAttribute('data-inv-idx'));
        this.engine.useOrEquipItem(idx);
        this.render();
        this.renderInventoryItems();
      };
      slot.addEventListener('click', useItem);
      slot.addEventListener('touchstart', useItem, { passive: true });
    });
  }
}
