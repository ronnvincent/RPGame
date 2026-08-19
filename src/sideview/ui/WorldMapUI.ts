/**
 * World Map & Stage Selector UI
 * Interactive map modal with zone previews, difficulty ratings, rune restoration status, and travel gateways.
 */

import { DUNGEONS, DungeonDefinition } from '../dungeons/DungeonManager';
import { quests } from '../quests/QuestManager';
import { audio } from '../engine/AudioManager';
import { network } from '../network/NetworkManager';

export interface WorldMapLocation {
  id: string;
  name: string;
  actTitle: string;
  recommendedLevel: number;
  icon: string;
  color: string;
  runeType?: 'verdant' | 'shadow' | 'flame' | 'void';
  description: string;
  bossName: string;
  bgImage: string;
}

export class WorldMapUI {
  private container: HTMLElement;
  private modalEl: HTMLElement | null = null;
  private onSelectLocation: (locationId: string, isHost?: boolean) => void;
  /** Opens the party lobby once a co-op lobby has been created. */

  public static LOCATIONS: WorldMapLocation[] = [
    {
      id: 'town_eldermoor',
      name: 'Haven of Eldermoor',
      actTitle: 'Safe Haven & Town Hub',
      recommendedLevel: 1,
      icon: '/assets/ui_sprites/icons/I_Chest01.png',
      color: '#3b82f6',
      description: 'The peaceful town sanctuary. Meet Elder Justinian, Captain Valerie, Blacksmith Keith, and Alchemist Morwenna.',
      bossName: 'None (Safe Zone)',
      bgImage: '/assets/GothicVania-town-files/GothicVania-town-files/PNG/environment/layers/background.png'
    },
    {
      id: 'goblin_catacombs',
      name: 'Goblin Catacombs',
      actTitle: 'Act I: The Verdant Seal',
      recommendedLevel: 1,
      icon: '/assets/ui_sprites/icons/I_Leaf.png',
      color: '#22c55e',
      runeType: 'verdant',
      description: 'Subterranean tunnels infested with goblin thieves, shamans, and berserkers.',
      bossName: 'Chief Warlord Grimjaw',
      bgImage: '/assets/warped-files/warped-files/Assets/PNG/environment/layers/background.png'
    },
    {
      id: 'undead_crypt',
      name: 'Crypt of the Damned',
      actTitle: 'Act II: The Shadow Curse',
      recommendedLevel: 5,
      icon: '/assets/ui_sprites/icons/I_Bone.png',
      color: '#a855f7',
      runeType: 'shadow',
      description: 'Ancient royal mausoleums defiled by dark necromancy and wraiths.',
      bossName: 'Arch-Lich Malakar',
      bgImage: '/assets/high-forest/Background/Background.png'
    },
    {
      id: 'dragon_lair',
      name: "Inferno Dragon's Lair",
      actTitle: 'Act III: The Molten Caldera',
      recommendedLevel: 9,
      icon: '/assets/ui_sprites/icons/I_Torch01.png',
      color: '#ef4444',
      runeType: 'flame',
      description: 'Volcanic magma chambers erupting with fire imps and the ancient wyrm.',
      bossName: 'Ancient Red Dragon Ignis',
      bgImage: '/assets/swamp/background.png'
    },
    {
      id: 'void_nexus',
      name: 'The Void Nexus',
      actTitle: 'Act IV: The Void Eclipse',
      recommendedLevel: 14,
      icon: '/assets/ui_sprites/icons/I_Sapphire.png',
      color: '#8b5cf6',
      runeType: 'void',
      description: 'Cosmic astral rift where NightBorne commands the forces of total eclipse.',
      bossName: 'NightBorne Void Overlord',
      bgImage: '/assets/GothicVania-town-files/GothicVania-town-files/PNG/environment/layers/background.png'
    },
    {
      id: 'venomous_swamp',
      name: 'Venomous Swamp',
      actTitle: 'Bonus Zone: Gothicvania Swamp',
      recommendedLevel: 3,
      icon: '/assets/ui_sprites/icons/I_Leaf.png',
      color: '#10b981',
      description: 'Murky poison marsh draped in moss, ancient deadwood, spider nests, and bog ghosts.',
      bossName: 'Broodmother Queen',
      bgImage: '/assets/swamp/background.png'
    },
    {
      id: 'twilight_peaks',
      name: 'Twilight Peaks',
      actTitle: 'Bonus Zone: Mountain Dusk',
      recommendedLevel: 6,
      icon: '/assets/ui_sprites/icons/I_Rock01.png',
      color: '#f43f5e',
      description: 'High alpine crags bathed in the crimson radiance of the blood moon and pine ridges.',
      bossName: 'Blood Moon Behemoth',
      bgImage: '/assets/high-forest/Background/Background.png'
    },
    {
      id: 'sunken_abyss',
      name: 'Sunken Abyss',
      actTitle: 'Bonus Zone: Underwater Fantasy',
      recommendedLevel: 10,
      icon: '/assets/ui_sprites/icons/I_Water.png',
      color: '#06b6d4',
      description: 'Submerged ancient temple ruins, coral reefs, sunken statues, and abyssal sirens.',
      bossName: 'Leviathan of the Deep',
      bgImage: '/assets/warped-files/warped-files/Assets/PNG/environment/layers/background.png'
    },
    {
      id: 'gallet_depths',
      name: 'Gallet Depths',
      actTitle: 'Bonus Zone: Caves of Gallet',
      recommendedLevel: 12,
      icon: '/assets/ui_sprites/icons/I_Eye.png',
      color: '#f97316',
      description: 'Subterranean lava forge carved with stone channels, torches, and cascading waterfalls.',
      bossName: 'Gallet Forge Overlord',
      bgImage: '/assets/high-forest/Background/Background.png'
    },
    {
      id: 'endless_arena',
      name: 'Endless Celestial Arena',
      actTitle: 'Post-Game Mastery Trial',
      recommendedLevel: 16,
      icon: '/assets/ui_sprites/icons/Ac_Medal01.png',
      color: '#eab308',
      description: 'Infinite scaling trial against empowered dimensional waves for legendary records.',
      bossName: 'Continuous Scaling Waves',
      bgImage: '/assets/GothicVania-town-files/GothicVania-town-files/PNG/environment/layers/background.png'
    }
  ];

  constructor(parent: HTMLElement, onSelectLocation: (locationId: string, isHost?: boolean) => void) {
    this.container = parent;
    this.onSelectLocation = onSelectLocation;
  }

  // No defaults. These both had one, so the HUD's MAP button calling
  // open(maxDungeonCleared) compiled fine and silently gated every dungeon
  // against level 1 - a level 11 character was told to "REACH Lv. 5".
  // Required parameters turn that into a compile error instead.
  public open(maxDungeonCleared: number, playerLevel: number) {
    this.close();
    audio.playPageTurn();

    this.modalEl = document.createElement('div');
    this.modalEl.className = 'dialogue-modal-backdrop';
    this.modalEl.style.justifyContent = 'center';
    this.modalEl.style.padding = 'max(8px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left))';

    const frame = document.createElement('div');
    frame.className = 'dialogue-box-frame world-map-modal';
    frame.style.maxWidth = '920px';
    frame.style.width = '94vw';
    frame.style.maxHeight = '90dvh';
    frame.style.overflowY = 'auto';
    frame.style.touchAction = 'pan-y';
    frame.style.padding = '16px 20px';

    // Header
    const header = document.createElement('div');
    header.className = 'dialogue-header-row';
    header.style.borderBottom = '2px solid rgba(255,215,0,0.25)';
    header.style.paddingBottom = '10px';
    header.style.marginBottom = '14px';
    header.innerHTML = `
      <div style="font-size: 20px; font-weight: 900; color: #ffd700; display: flex; align-items: center; gap: 8px; text-shadow: 0 2px 4px rgba(0,0,0,0.8);">
        <span>🗺️ WORLD MAP & GATEWAYS</span>
      </div>
      <div style="font-size: 13px; color: #fef08a; font-weight: 900; background: rgba(0,0,0,0.5); padding: 4px 12px; border-radius: 4px; border: 1px solid #ffd700;">
        Runes Restored: <span style="color: #4ade80;">${Array.from(quests.unlockedRunes).length}/4</span>
      </div>
    `;

    // Rune Status Bar
    const runeBar = document.createElement('div');
    runeBar.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; background: url(\'/assets/kenney-rpg-ui/panelInset_brown.png\') repeat; background-size: 100% 100%; padding: 8px 14px; border-radius: 4px; align-items: center; justify-content: space-around;';
    const runeDefs = [
      { id: 'verdant', name: 'Verdant Rune', icon: '/assets/ui_sprites/icons/I_Jade.png', color: '#4ade80' },
      { id: 'shadow', name: 'Shadow Rune', icon: '/assets/ui_sprites/icons/I_Amethist.png', color: '#c084fc' },
      { id: 'flame', name: 'Flame Rune', icon: '/assets/ui_sprites/icons/I_Ruby.png', color: '#f87171' },
      { id: 'void', name: 'Void Rune', icon: '/assets/ui_sprites/icons/I_Sapphire.png', color: '#a855f7' }
    ];
    runeBar.innerHTML = runeDefs.map(r => {
      const isRestored = quests.unlockedRunes.has(r.id);
      return `
        <div style="display: flex; align-items: center; gap: 6px; opacity: ${isRestored ? '1' : '0.4'}; filter: ${isRestored ? 'none' : 'grayscale(1)'}; transition: 0.3s;">
          <span style="font-size: 18px; filter: drop-shadow(0 0 4px ${r.color});">
            ${r.icon.startsWith('/') ? `<img src="${r.icon}" style="width:22px; height:22px; vertical-align:middle; image-rendering:pixelated;" />` : r.icon}
          </span>
          <span style="font-size: 11.5px; font-weight: 800; color: ${r.color}; letter-spacing: 0.5px; font-family: 'Cinzel', serif;">${r.name} ${isRestored ? '✓' : '(Locked)'}</span>
        </div>
      `;
    }).join('');

    // Locations Grid
    const grid = document.createElement('div');
    grid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; margin-bottom: 16px;';

    WorldMapUI.LOCATIONS.forEach((loc) => {
      const isTown = loc.id === 'town_eldermoor';
      const dungeonIdx = DUNGEONS.findIndex(d => d.id === loc.id);
      // Two separate requirements, and the map only ever checked one. Clearing
      // a dungeon unlocked the next card regardless of level, so the level
      // shown on it was decoration - you could walk straight into a dungeon
      // eight levels above you.
      const dungeon = dungeonIdx !== -1 ? DUNGEONS[dungeonIdx] : undefined;
      const requiredLevel = dungeon?.minLevel ?? loc.recommendedLevel;
      // Story order applies to the four acts only. The bonus zones and the
      // arena are side content: they open on level alone, because ranking them
      // by array position put the level 3 swamp behind the level 14 void and
      // left a high level character looking at locked low level maps.
      const sideContent = Boolean(dungeon?.sideContent);
      const cleared = sideContent || (dungeonIdx !== -1 && dungeonIdx <= maxDungeonCleared);
      const levelMet = playerLevel >= requiredLevel;
      const isUnlocked = isTown || (cleared && levelMet);
      const lockReason = isTown || isUnlocked ? ''
        : !cleared ? 'CLEAR THE PREVIOUS DUNGEON'
        : `REACH Lv. ${requiredLevel}`;

      const card = document.createElement('div');
      card.style.cssText = `
        background: url('/assets/kenney-rpg-ui/panelInset_brown.png') repeat;
        background-size: 100% 100%;
        border: 2px solid ${isUnlocked ? loc.color : 'rgba(255,255,255,0.15)'};
        border-radius: 4px;
        padding: 14px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 10px;
        opacity: ${isUnlocked ? '1' : '0.6'};
        box-shadow: ${isUnlocked ? `0 4px 15px ${loc.color}25` : 'none'};
        transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.2s ease, border-color 0.2s ease;
        position: relative;
        overflow: hidden;
      `;

      if (isUnlocked) {
        card.onmouseenter = () => {
          card.style.transform = 'translateY(-3px) scale(1.01)';
          card.style.boxShadow = `0 6px 20px ${loc.color}50`;
          card.style.borderColor = '#ffd700';
        };
        card.onmouseleave = () => {
          card.style.transform = 'none';
          card.style.boxShadow = `0 4px 15px ${loc.color}25`;
          card.style.borderColor = loc.color;
        };
      }

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; z-index: 1;">
          <div>
            <div style="font-size: 10.5px; font-weight: 900; color: ${loc.color}; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 2px; text-shadow: 0 1px 2px rgba(0,0,0,0.8); font-family: 'Cinzel', serif;">${loc.actTitle}</div>
            <div style="font-size: 16px; font-weight: 900; color: #fef08a; display: flex; align-items: center; gap: 8px; text-shadow: 0 2px 4px rgba(0,0,0,0.8); font-family: 'Cinzel', serif;">
              <span style="font-size: 20px; filter: drop-shadow(0 0 5px ${loc.color});">
              ${loc.icon.startsWith('/') ? `<img src="${loc.icon}" style="width:28px; height:28px; image-rendering:pixelated;" />` : loc.icon}
            </span>
              <span style="line-height: 1.1;">${loc.name}</span>
            </div>
          </div>
          <div style="font-size: 11px; background: rgba(0,0,0,0.6); padding: 3px 8px; border-radius: 4px; color: ${isTown ? '#93c5fd' : '#fef08a'}; font-weight: 800; border: 1px solid ${isTown ? '#3b82f6' : 'rgba(254, 240, 138, 0.3)'};">
            ${isTown ? 'SAFE' : `Lv. ${requiredLevel}+`}
          </div>
        </div>

        <div style="font-size: 12px; color: #cbd5e1; line-height: 1.4; z-index: 1; flex-grow: 1;">
          ${loc.description}
        </div>

        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 6px; z-index: 1;">
          <div style="font-size: 10.5px; color: #94a3b8; max-width: 60%; line-height: 1.3;">
            <strong style="color: #fca5a5; display: block; margin-bottom: 1px;">BOSS:</strong> 
            <span style="color: #fff; font-weight: 600;">${loc.bossName}</span>
          </div>
          ${isTown ? `
            <button class="travel-btn dialogue-btn ${isUnlocked ? 'dialogue-btn-quest' : ''}" style="padding: 6px 14px; font-size: 12px; font-weight: 800; white-space: nowrap;" ${!isUnlocked ? 'disabled' : ''}>
              ${!isUnlocked ? '🔒 ' + lockReason : 'VISIT ➔'}
            </button>
          ` : `
            <!-- The map is a place to read about where you are going, not the
                 place you launch from. Two buttons on every card meant the same
                 decision was made in a dozen places; a run starts from one
                 screen now, reached from the menu. -->
            <div class="wm-state ${isUnlocked ? 'is-open' : ''}">
              ${isUnlocked ? 'UNLOCKED' : lockReason}
            </div>
          `}
        </div>
      `;

      // The town is still travelled to from here; it is not a run.
      if (isUnlocked && isTown) {
        card.querySelector('.travel-btn')?.addEventListener('click', () => {
          audio.playTeleport();
          this.close();
          this.onSelectLocation(loc.id);
        });
      }

      grid.appendChild(card);
    });

    // Footer Actions
    const footer = document.createElement('div');
    footer.className = 'dialogue-actions-row';
    footer.style.borderTop = '2px solid rgba(255,215,0,0.2)';
    footer.style.paddingTop = '12px';
    footer.innerHTML = `
      <button id="close-map-btn" class="dialogue-btn">Close ✕</button>
    `;

    footer.querySelector('#close-map-btn')?.addEventListener('click', () => {
      this.close();
    });

    frame.appendChild(header);
    frame.appendChild(runeBar);
    frame.appendChild(grid);
    frame.appendChild(footer);
    this.modalEl.appendChild(frame);
    this.container.appendChild(this.modalEl);
  }
  
  /**
   * Opens the co-op party lobby. The old inline overlay auto-started the run on
   * the first accepted invite and had a Cancel button that nulled the socket,
   * leaving it with no listeners. Both are gone - CoopLobbyUI owns this now.
   */


  public close() {
    if (this.modalEl && this.modalEl.parentNode) {
      this.modalEl.parentNode.removeChild(this.modalEl);
    }
    this.modalEl = null;
  }
}
