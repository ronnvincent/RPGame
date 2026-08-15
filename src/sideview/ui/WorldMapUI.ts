/**
 * World Map & Stage Selector UI
 * Interactive map modal with zone previews, difficulty ratings, rune restoration status, and travel gateways.
 */

import { DUNGEONS, DungeonDefinition } from '../dungeons/DungeonManager';
import { quests } from '../quests/QuestManager';
import { audio } from '../engine/AudioManager';

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
}

export class WorldMapUI {
  private container: HTMLElement;
  private modalEl: HTMLElement | null = null;
  private onSelectLocation: (locationId: string) => void;

  public static LOCATIONS: WorldMapLocation[] = [
    {
      id: 'town_eldermoor',
      name: 'Haven of Eldermoor',
      actTitle: 'Safe Haven & Town Hub',
      recommendedLevel: 1,
      icon: '🏰',
      color: '#3b82f6',
      description: 'The peaceful town sanctuary. Meet Elder Justinian, Captain Valerie, Blacksmith Keith, and Alchemist Morwenna.',
      bossName: 'None (Safe Zone)'
    },
    {
      id: 'goblin_catacombs',
      name: 'Goblin Catacombs',
      actTitle: 'Act I: The Verdant Seal',
      recommendedLevel: 1,
      icon: '🌿',
      color: '#22c55e',
      runeType: 'verdant',
      description: 'Subterranean tunnels infested with goblin thieves, shamans, and berserkers.',
      bossName: 'Chief Warlord Grimjaw'
    },
    {
      id: 'undead_crypt',
      name: 'Crypt of the Damned',
      actTitle: 'Act II: The Shadow Curse',
      recommendedLevel: 5,
      icon: '💀',
      color: '#a855f7',
      runeType: 'shadow',
      description: 'Ancient royal mausoleums defiled by dark necromancy and wraiths.',
      bossName: 'Arch-Lich Malakar'
    },
    {
      id: 'dragon_lair',
      name: "Inferno Dragon's Lair",
      actTitle: 'Act III: The Molten Caldera',
      recommendedLevel: 9,
      icon: '🔥',
      color: '#ef4444',
      runeType: 'flame',
      description: 'Volcanic magma chambers erupting with fire imps and the ancient wyrm.',
      bossName: 'Ancient Red Dragon Ignis'
    },
    {
      id: 'void_nexus',
      name: 'The Void Nexus',
      actTitle: 'Act IV: The Void Eclipse',
      recommendedLevel: 14,
      icon: '🌌',
      color: '#8b5cf6',
      runeType: 'void',
      description: 'Cosmic astral rift where NightBorne commands the forces of total eclipse.',
      bossName: 'NightBorne Void Overlord'
    },
    {
      id: 'venomous_swamp',
      name: 'Venomous Swamp',
      actTitle: 'Bonus Zone: Gothicvania Swamp',
      recommendedLevel: 3,
      icon: '🌿',
      color: '#10b981',
      description: 'Murky poison marsh draped in moss, ancient deadwood, spider nests, and bog ghosts.',
      bossName: 'Broodmother Queen'
    },
    {
      id: 'twilight_peaks',
      name: 'Twilight Peaks',
      actTitle: 'Bonus Zone: Mountain Dusk',
      recommendedLevel: 6,
      icon: '🏔️',
      color: '#f43f5e',
      description: 'High alpine crags bathed in the crimson radiance of the blood moon and pine ridges.',
      bossName: 'Blood Moon Behemoth'
    },
    {
      id: 'sunken_abyss',
      name: 'Sunken Abyss',
      actTitle: 'Bonus Zone: Underwater Fantasy',
      recommendedLevel: 10,
      icon: '🌊',
      color: '#06b6d4',
      description: 'Submerged ancient temple ruins, coral reefs, sunken statues, and abyssal sirens.',
      bossName: 'Leviathan of the Deep'
    },
    {
      id: 'gallet_depths',
      name: 'Gallet Depths',
      actTitle: 'Bonus Zone: Caves of Gallet',
      recommendedLevel: 12,
      icon: '🕳️',
      color: '#f97316',
      description: 'Subterranean lava forge carved with stone channels, torches, and cascading waterfalls.',
      bossName: 'Gallet Forge Overlord'
    },
    {
      id: 'endless_arena',
      name: 'Endless Celestial Arena',
      actTitle: 'Post-Game Mastery Trial',
      recommendedLevel: 16,
      icon: '⭐',
      color: '#eab308',
      description: 'Infinite scaling trial against empowered dimensional waves for legendary records.',
      bossName: 'Continuous Scaling Waves'
    }
  ];

  constructor(parent: HTMLElement, onSelectLocation: (locationId: string) => void) {
    this.container = parent;
    this.onSelectLocation = onSelectLocation;
  }

  public open() {
    this.close();
    audio.playPageTurn();

    this.modalEl = document.createElement('div');
    this.modalEl.className = 'dialogue-modal-backdrop';
    this.modalEl.style.justifyContent = 'center';
    this.modalEl.style.padding = 'max(8px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left))';

    const frame = document.createElement('div');
    frame.className = 'dialogue-box-frame world-map-modal';
    frame.style.maxWidth = '850px';
    frame.style.width = '94vw';
    frame.style.maxHeight = '88dvh';
    frame.style.overflowY = 'auto';
    frame.style.touchAction = 'pan-y';
    frame.style.padding = '12px 16px';

    // Header
    const header = document.createElement('div');
    header.className = 'dialogue-header-row';
    header.innerHTML = `
      <div style="font-size: 18px; font-weight: 900; color: #ffd700; display: flex; align-items: center; gap: 8px;">
        <span>🗺️ WORLD MAP & GATEWAYS</span>
      </div>
      <div style="font-size: 12px; color: #cbd5e1; font-weight: 700;">
        Runes Restored: ${Array.from(quests.unlockedRunes).length}/4
      </div>
    `;

    // Rune Status Bar
    const runeBar = document.createElement('div');
    runeBar.style.cssText = 'display: flex; gap: 6px; flex-wrap: wrap; margin: 6px 0 12px 0; background: rgba(0,0,0,0.5); padding: 6px 12px; border-radius: 6px; align-items: center; justify-content: space-around;';
    const runeDefs = [
      { id: 'verdant', name: 'Verdant Rune', icon: '🟢', color: '#4ade80' },
      { id: 'shadow', name: 'Shadow Rune', icon: '🟣', color: '#c084fc' },
      { id: 'flame', name: 'Flame Rune', icon: '🔴', color: '#f87171' },
      { id: 'void', name: 'Void Rune', icon: '🌌', color: '#a855f7' }
    ];
    runeBar.innerHTML = runeDefs.map(r => {
      const isRestored = quests.unlockedRunes.has(r.id);
      return `
        <div style="display: flex; align-items: center; gap: 4px; opacity: ${isRestored ? '1' : '0.35'};">
          <span style="font-size: 15px;">${r.icon}</span>
          <span style="font-size: 10.5px; font-weight: 800; color: ${r.color};">${r.name} ${isRestored ? '✓' : '(Locked)'}</span>
        </div>
      `;
    }).join('');

    // Locations Grid
    const grid = document.createElement('div');
    grid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 8px; margin-bottom: 12px;';

    WorldMapUI.LOCATIONS.forEach((loc) => {
      const isTown = loc.id === 'town_eldermoor';
      const isUnlocked = isTown || quests.isDungeonUnlocked(loc.id);

      const card = document.createElement('div');
      card.style.cssText = `
        background: ${isUnlocked ? 'rgba(24, 18, 38, 0.9)' : 'rgba(15, 15, 20, 0.7)'};
        border: 2px solid ${isUnlocked ? loc.color : '#475569'};
        border-radius: 8px;
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 6px;
        opacity: ${isUnlocked ? '1' : '0.55'};
        transition: transform 0.15s ease, box-shadow 0.15s ease;
      `;

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <div style="font-size: 11px; font-weight: 800; color: ${loc.color}; text-transform: uppercase;">${loc.actTitle}</div>
            <div style="font-size: 16px; font-weight: 900; color: #fff; margin-top: 2px; display: flex; align-items: center; gap: 6px;">
              <span>${loc.icon}</span>
              <span>${loc.name}</span>
            </div>
          </div>
          <div style="font-size: 11px; background: rgba(0,0,0,0.6); padding: 3px 8px; border-radius: 4px; color: #fef08a; font-weight: 700;">
            ${isTown ? 'SAFE' : `Lv. ${loc.recommendedLevel}+`}
          </div>
        </div>

        <div style="font-size: 12px; color: #cbd5e1; line-height: 1.4;">
          ${loc.description}
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 6px;">
          <div style="font-size: 11px; color: #94a3b8;">
            <strong style="color: #fca5a5;">Boss:</strong> ${loc.bossName}
          </div>
          <button class="travel-btn dialogue-btn ${isUnlocked ? 'dialogue-btn-quest' : ''}" style="padding: 5px 14px; font-size: 12px;" ${!isUnlocked ? 'disabled' : ''}>
            ${!isUnlocked ? '🔒 Locked' : isTown ? 'Visit Town ➔' : 'Enter Dungeon ⚔️'}
          </button>
        </div>
      `;

      if (isUnlocked) {
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

  public close() {
    if (this.modalEl && this.modalEl.parentNode) {
      this.modalEl.parentNode.removeChild(this.modalEl);
    }
    this.modalEl = null;
  }
}
