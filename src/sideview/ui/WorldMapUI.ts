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
  private onSelectLocation: (locationId: string) => void;

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

  constructor(parent: HTMLElement, onSelectLocation: (locationId: string) => void) {
    this.container = parent;
    this.onSelectLocation = onSelectLocation;
  }

  public open(maxDungeonCleared: number = 0) {
    this.close();
    audio.playPageTurn();

    this.modalEl = document.createElement('div');
    this.modalEl.className = 'dialogue-modal-backdrop';
    this.modalEl.style.justifyContent = 'center';
    this.modalEl.style.padding = 'max(8px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left))';

    const frame = document.createElement('div');
    frame.className = 'dialogue-box-frame world-map-modal';
    frame.style.maxWidth = '900px';
    frame.style.width = '94vw';
    frame.style.maxHeight = '90dvh';
    frame.style.overflowY = 'auto';
    frame.style.touchAction = 'pan-y';
    frame.style.padding = '16px 24px';
    frame.style.background = 'linear-gradient(135deg, rgba(20, 15, 30, 0.95), rgba(10, 8, 15, 0.98))';
    frame.style.border = '2px solid rgba(255, 215, 0, 0.4)';
    frame.style.boxShadow = '0 10px 40px rgba(0,0,0,0.8), inset 0 0 20px rgba(255, 215, 0, 0.1)';

    // Header
    const header = document.createElement('div');
    header.className = 'dialogue-header-row';
    header.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
    header.style.paddingBottom = '12px';
    header.style.marginBottom = '16px';
    header.innerHTML = `
      <div style="font-size: 22px; font-weight: 900; color: #ffd700; display: flex; align-items: center; gap: 10px; text-shadow: 0 2px 4px rgba(0,0,0,0.5);">
        <span>🗺️ WORLD MAP & GATEWAYS</span>
      </div>
      <div style="font-size: 14px; color: #cbd5e1; font-weight: 700; background: rgba(255,255,255,0.1); padding: 4px 12px; border-radius: 12px;">
        Runes Restored: <span style="color: #4ade80;">${Array.from(quests.unlockedRunes).length}/4</span>
      </div>
    `;

    // Rune Status Bar
    const runeBar = document.createElement('div');
    runeBar.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; background: rgba(0,0,0,0.6); padding: 10px 16px; border-radius: 8px; align-items: center; justify-content: space-around; border: 1px solid rgba(255,255,255,0.05);';
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
            ${r.icon.startsWith('/') ? `<img src="${r.icon}" style="width:24px; height:24px; vertical-align:middle; image-rendering:pixelated;" />` : r.icon}
          </span>
          <span style="font-size: 12px; font-weight: 800; color: ${r.color}; letter-spacing: 0.5px;">${r.name} ${isRestored ? '✓' : '(Locked)'}</span>
        </div>
      `;
    }).join('');

    // Locations Grid
    const grid = document.createElement('div');
    grid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; margin-bottom: 20px;';

    WorldMapUI.LOCATIONS.forEach((loc) => {
      const isTown = loc.id === 'town_eldermoor';
      const dungeonIdx = DUNGEONS.findIndex(d => d.id === loc.id);
      const isUnlocked = isTown || (dungeonIdx !== -1 && dungeonIdx <= maxDungeonCleared);

      const card = document.createElement('div');
      card.style.cssText = `
        background: ${isUnlocked ? 'linear-gradient(145deg, rgba(30, 25, 45, 0.85), rgba(20, 15, 25, 0.95))' : 'linear-gradient(145deg, rgba(20, 20, 25, 0.9), rgba(10, 10, 15, 0.95))'}, url('${loc.bgImage}') center/cover;
        border: 2px solid ${isUnlocked ? loc.color : 'rgba(255,255,255,0.1)'};
        border-radius: 12px;
        padding: 16px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 12px;
        opacity: ${isUnlocked ? '1' : '0.6'};
        box-shadow: ${isUnlocked ? `0 4px 15px ${loc.color}20` : 'none'};
        transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.2s ease, border-color 0.2s ease;
        position: relative;
        overflow: hidden;
      `;

      if (isUnlocked) {
        card.onmouseenter = () => {
          card.style.transform = 'translateY(-4px) scale(1.02)';
          card.style.boxShadow = `0 8px 25px ${loc.color}40`;
          card.style.borderColor = '#fff';
        };
        card.onmouseleave = () => {
          card.style.transform = 'none';
          card.style.boxShadow = `0 4px 15px ${loc.color}20`;
          card.style.borderColor = loc.color;
        };
      }

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; z-index: 1;">
          <div>
            <div style="font-size: 11px; font-weight: 900; color: ${loc.color}; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; text-shadow: 0 1px 2px rgba(0,0,0,0.8);">${loc.actTitle}</div>
            <div style="font-size: 18px; font-weight: 900; color: #fff; display: flex; align-items: center; gap: 8px; text-shadow: 0 2px 4px rgba(0,0,0,0.8);">
              <span style="font-size: 22px; filter: drop-shadow(0 0 5px ${loc.color});">
              ${loc.icon.startsWith('/') ? `<img src="${loc.icon}" style="width:32px; height:32px; image-rendering:pixelated;" />` : loc.icon}
            </span>
              <span style="line-height: 1.1;">${loc.name}</span>
            </div>
          </div>
          <div style="font-size: 12px; background: ${isTown ? 'rgba(59, 130, 246, 0.3)' : 'rgba(0,0,0,0.7)'}; padding: 4px 10px; border-radius: 6px; color: ${isTown ? '#93c5fd' : '#fef08a'}; font-weight: 800; border: 1px solid ${isTown ? '#3b82f6' : 'rgba(254, 240, 138, 0.3)'};">
            ${isTown ? 'SAFE' : `Lv. ${loc.recommendedLevel}+`}
          </div>
        </div>

        <div style="font-size: 13px; color: #cbd5e1; line-height: 1.5; z-index: 1; flex-grow: 1;">
          ${loc.description}
        </div>

        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 8px; z-index: 1;">
          <div style="font-size: 11px; color: #94a3b8; max-width: 60%; line-height: 1.3;">
            <strong style="color: #fca5a5; display: block; margin-bottom: 2px;">BOSS:</strong> 
            <span style="color: #fff; font-weight: 600;">${loc.bossName}</span>
          </div>
          ${isTown ? `
            <button class="travel-btn dialogue-btn ${isUnlocked ? 'dialogue-btn-quest' : ''}" style="padding: 8px 16px; font-size: 13px; font-weight: 800; white-space: nowrap; border-radius: 6px; transition: 0.2s;" ${!isUnlocked ? 'disabled' : ''}>
              ${!isUnlocked ? '🔒 LOCKED' : 'VISIT ➔'}
            </button>
          ` : `
            <div style="display: flex; gap: 8px;">
              <button class="travel-btn dialogue-btn ${isUnlocked ? 'dialogue-btn-quest' : ''}" style="padding: 8px 12px; font-size: 11px; font-weight: 800; white-space: nowrap; border-radius: 6px; transition: 0.2s;" ${!isUnlocked ? 'disabled' : ''}>
                ${!isUnlocked ? '🔒 LOCKED' : 'SOLO'}
              </button>
              <button class="coop-btn dialogue-btn" style="padding: 8px 12px; font-size: 11px; font-weight: 800; white-space: nowrap; border-radius: 6px; background-image: url('/assets/kenney-rpg-ui/buttonRound_beige.png'); color: #5a3c11; transition: 0.2s;" ${!isUnlocked ? 'disabled' : ''}>
                ${!isUnlocked ? '🔒' : 'CO-OP 🌐'}
              </button>
            </div>
          `}
        </div>
      `;

      if (isUnlocked) {
        card.querySelector('.travel-btn')?.addEventListener('click', () => {
          audio.playTeleport();
          this.close();
          this.onSelectLocation(loc.id); // Solo mode
        });
        card.querySelector('.coop-btn')?.addEventListener('click', () => {
          audio.playTeleport();
          this.showMatchmakingOverlay(loc.id);
        });
      }

      grid.appendChild(card);
    });

    // Footer Actions
    const footer = document.createElement('div');
    footer.className = 'dialogue-actions-row';
    footer.style.borderTop = '1px solid rgba(255,255,255,0.1)';
    footer.style.paddingTop = '16px';
    footer.innerHTML = `
      <button id="close-map-btn" class="dialogue-btn" style="padding: 10px 24px; font-size: 14px; font-weight: bold; background: rgba(255,255,255,0.1); color: #fff;">Close ✕</button>
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
  
  private showMatchmakingOverlay(locationId: string) {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.9)';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '999999';
    overlay.style.color = '#fff';
    overlay.style.fontFamily = "'Outfit', sans-serif";
    
    const box = document.createElement('div');
    box.style.background = "url('/assets/kenney-rpg-ui/panel_brown.png') repeat";
    box.style.backgroundSize = "100% 100%";
    box.style.padding = '40px';
    box.style.border = '4px solid #4a2c11';
    box.style.borderRadius = '8px';
    box.style.textAlign = 'center';
    box.style.color = '#fef08a';
    box.style.width = '350px';

    const title = document.createElement('h2');
    title.innerText = 'CO-OP LOBBY';
    title.style.margin = '0 0 10px 0';
    title.style.textShadow = '2px 2px 4px #000';

    const myIdText = document.createElement('p');
    const myShortId = localStorage.getItem('playerShortId') || 'UNKNOWN';
    myIdText.innerHTML = `Your ID: <strong style="color:#fff; font-size:24px; letter-spacing:2px; background: rgba(0,0,0,0.5); padding: 4px 12px; border-radius: 4px;">${myShortId}</strong>`;
    myIdText.style.marginBottom = '20px';

    const statusText = document.createElement('p');
    statusText.innerText = 'Creating lobby...';
    statusText.style.color = '#a3a3a3';
    statusText.style.marginBottom = '20px';

    // Invite Section
    const inviteWrapper = document.createElement('div');
    inviteWrapper.style.display = 'flex';
    inviteWrapper.style.gap = '8px';
    inviteWrapper.style.marginBottom = '20px';

    const inviteInput = document.createElement('input');
    inviteInput.type = 'text';
    inviteInput.placeholder = 'Enter Player ID to Invite';
    inviteInput.style.flex = '1';
    inviteInput.style.padding = '8px';
    inviteInput.style.fontSize = '14px';
    inviteInput.style.border = '2px solid #2e1a0b';
    inviteInput.style.borderRadius = '4px';
    inviteInput.style.background = '#000';
    inviteInput.style.color = '#fff';
    inviteInput.style.outline = 'none';

    const inviteBtn = document.createElement('button');
    inviteBtn.innerText = 'INVITE';
    inviteBtn.style.background = "url('/assets/kenney-rpg-ui/buttonRound_blue.png') no-repeat center center";
    inviteBtn.style.backgroundSize = "100% 100%";
    inviteBtn.style.border = 'none';
    inviteBtn.style.padding = '8px 16px';
    inviteBtn.style.color = '#fff';
    inviteBtn.style.cursor = 'pointer';
    inviteBtn.style.fontWeight = 'bold';
    
    inviteBtn.onclick = () => {
      const target = inviteInput.value.trim().toUpperCase();
      if (target.length !== 6) {
        alert('Player ID must be 6 characters.');
        return;
      }
      inviteBtn.innerText = '...';
      inviteBtn.disabled = true;
      network.invitePlayer(target, (msg, success) => {
        alert(msg);
        inviteBtn.innerText = 'INVITE';
        inviteBtn.disabled = false;
        inviteInput.value = '';
      });
    };

    inviteWrapper.appendChild(inviteInput);
    inviteWrapper.appendChild(inviteBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.innerText = 'Cancel';
    cancelBtn.style.padding = '8px 24px';
    cancelBtn.style.background = '#4a2c11';
    cancelBtn.style.border = '2px solid #fff';
    cancelBtn.style.color = '#fff';
    cancelBtn.style.cursor = 'pointer';
    cancelBtn.style.width = '100%';
    cancelBtn.onclick = () => {
      document.body.removeChild(overlay);
      if (network.socket) network.socket.disconnect();
      network.socket = null;
    };

    box.appendChild(title);
    box.appendChild(myIdText);
    box.appendChild(statusText);
    box.appendChild(inviteWrapper);
    box.appendChild(cancelBtn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    network.createLobby(locationId, (lobbyData) => {
      statusText.innerHTML = `Lobby created! <br/> Players: ${lobbyData.players.length}/2`;
    }, (roomData) => {
      // Start match!
      document.body.removeChild(overlay);
      this.close();
      this.onSelectLocation(locationId);
    });
  }

  public close() {
    if (this.modalEl && this.modalEl.parentNode) {
      this.modalEl.parentNode.removeChild(this.modalEl);
    }
    this.modalEl = null;
  }
}
