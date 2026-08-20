import { DUNGEONS } from '../dungeons/DungeonManager';
import { quests } from '../quests/QuestManager';
import { audio } from '../engine/AudioManager';
import { escapeHtml, escapeHtmlAttribute, installModalFocusTrap, safeLocalAssetPath } from './UiSafety';

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

const STYLE_ID = 'world-map-rpg-style';

export class WorldMapUI {
  private modalEl: HTMLElement | null = null;
  private releaseFocus: (() => void) | null = null;

  public static LOCATIONS: WorldMapLocation[] = [
    { id: 'town_eldermoor', name: 'Haven of Eldermoor', actTitle: 'Safe Haven and Town Hub', recommendedLevel: 1, icon: '/assets/ui_sprites/icons/I_Chest01.png', color: '#5da7e8', description: 'A protected sanctuary with merchants, mentors, and the gateways to every expedition.', bossName: 'No hostile presence', bgImage: '/assets/GothicVania-town-files/GothicVania-town-files/PNG/environment/layers/background.png' },
    { id: 'goblin_catacombs', name: 'Goblin Catacombs', actTitle: 'Act I: The Verdant Seal', recommendedLevel: 1, icon: '/assets/ui_sprites/icons/I_Leaf.png', color: '#62c76b', runeType: 'verdant', description: 'Subterranean tunnels occupied by goblin thieves, shamans, and berserkers.', bossName: 'Chief Warlord Grimjaw', bgImage: '/assets/warped-files/warped-files/Assets/PNG/environment/layers/background.png' },
    { id: 'undead_crypt', name: 'Crypt of the Damned', actTitle: 'Act II: The Shadow Curse', recommendedLevel: 5, icon: '/assets/ui_sprites/icons/I_Bone.png', color: '#b68af2', runeType: 'shadow', description: 'Ancient royal mausoleums defiled by dark necromancy and restless wraiths.', bossName: 'Arch-Lich Malakar', bgImage: '/assets/high-forest/Background/Background.png' },
    { id: 'dragon_lair', name: "Inferno Dragon's Lair", actTitle: 'Act III: The Molten Caldera', recommendedLevel: 9, icon: '/assets/ui_sprites/icons/I_Torch01.png', color: '#f26d61', runeType: 'flame', description: 'Volcanic chambers erupt around fire imps and an ancient waking wyrm.', bossName: 'Ancient Red Dragon Ignis', bgImage: '/assets/swamp/background.png' },
    { id: 'void_nexus', name: 'The Void Nexus', actTitle: 'Act IV: The Void Eclipse', recommendedLevel: 14, icon: '/assets/ui_sprites/icons/I_Sapphire.png', color: '#a579e8', runeType: 'void', description: 'A cosmic rift where NightBorne commands the forces of the total eclipse.', bossName: 'NightBorne Void Overlord', bgImage: '/assets/GothicVania-town-files/GothicVania-town-files/PNG/environment/layers/background.png' },
    { id: 'venomous_swamp', name: 'Venomous Swamp', actTitle: 'Side Expedition: Poison Marsh', recommendedLevel: 3, icon: '/assets/ui_sprites/icons/I_Leaf.png', color: '#45c49a', description: 'A murky marsh of deadwood, spider nests, poison pools, and bog spirits.', bossName: 'Broodmother Queen', bgImage: '/assets/swamp/background.png' },
    { id: 'sunlit_vale', name: 'Sunlit Vale', actTitle: 'Side Expedition: Open Meadows', recommendedLevel: 4, icon: '/assets/ui_sprites/icons/I_Leaf.png', color: '#a6d84e', description: 'Open meadows where bandit warbands drill under a bright sky.', bossName: 'Warband Chief Hadrik', bgImage: '/assets/maps/parallax2d/bg1/layer06_sky.png' },
    { id: 'twilight_peaks', name: 'Twilight Peaks', actTitle: 'Side Expedition: Mountain Dusk', recommendedLevel: 6, icon: '/assets/ui_sprites/icons/I_Rock01.png', color: '#eb708a', description: 'High crags under a blood moon, with dangerous paths between pine ridges.', bossName: 'Blood Moon Behemoth', bgImage: '/assets/high-forest/Background/Background.png' },
    { id: 'emerald_ridge', name: 'Emerald Ridge', actTitle: 'Side Expedition: High Ridges', recommendedLevel: 8, icon: '/assets/ui_sprites/icons/I_Jade.png', color: '#4bd284', description: 'Steep green ridges patrolled by beasts that coordinate their hunt.', bossName: 'Alpha Greymane', bgImage: '/assets/maps/parallax2d/bg3/layer07_Sky.png' },
    { id: 'sunken_abyss', name: 'Sunken Abyss', actTitle: 'Side Expedition: Drowned Temple', recommendedLevel: 10, icon: '/assets/ui_sprites/icons/I_Water.png', color: '#55cae0', description: 'A submerged temple filled with coral, ruined statues, and abyssal sirens.', bossName: 'Leviathan of the Deep', bgImage: '/assets/warped-files/warped-files/Assets/PNG/environment/layers/background.png' },
    { id: 'gallet_depths', name: 'Gallet Depths', actTitle: 'Side Expedition: Lava Forge', recommendedLevel: 12, icon: '/assets/ui_sprites/icons/I_Eye.png', color: '#ee9857', description: 'A lava forge carved with stone channels, waterfalls, and failing machinery.', bossName: 'Gallet Forge Overlord', bgImage: '/assets/high-forest/Background/Background.png' },
    { id: 'castle_approach', name: 'Castle Approach', actTitle: 'Side Expedition: The Long Climb', recommendedLevel: 13, icon: '/assets/ui_sprites/icons/I_Key01.png', color: '#b6c1ce', description: 'A guarded ascent to a keep whose gates have remained sealed for an age.', bossName: 'Castellan Mordred', bgImage: '/assets/maps/parallax2d/bg4/layer07_Sky.png' },
    { id: 'endless_arena', name: 'Endless Celestial Arena', actTitle: 'Post-Game Mastery Trial', recommendedLevel: 16, icon: '/assets/ui_sprites/icons/Ac_Medal01.png', color: '#e7bd55', description: 'An infinite trial of empowered dimensional waves and escalating rewards.', bossName: 'Continuous scaling waves', bgImage: '/assets/GothicVania-town-files/GothicVania-town-files/PNG/environment/layers/background.png' },
  ];

  constructor(
    private container: HTMLElement,
    private onSelectLocation: (locationId: string, isHost?: boolean) => void,
  ) {
    this.injectStyles();
  }

  public open(maxDungeonCleared: number, playerLevel: number): void {
    this.close();
    audio.playPageTurn();

    const restored = quests.unlockedRunes.size;
    const modal = document.createElement('div');
    modal.className = 'rpg-screen rpg-modal world-map-screen';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'world-map-title');
    modal.innerHTML = `<div class="rpg-screen__backdrop" aria-hidden="true"></div>
      <section class="rpg-panel rpg-dialog rpg-dialog--wide world-map-dialog" tabindex="-1">
        <header class="rpg-dialog__header">
          <div>
            <p class="rpg-kicker">Gateways of Aethelgard</p>
            <h2 class="rpg-title" id="world-map-title">World Map</h2>
          </div>
          <div class="world-map-progress" aria-label="${restored} of 4 primordial runes restored">
            <span class="rpg-label">Runes Restored</span>
            <strong>${restored}/4</strong>
          </div>
        </header>
        <div class="rpg-divider" aria-hidden="true"></div>
        <div class="world-map-runes" aria-label="Primordial rune status"></div>
        <div class="rpg-dialog__body world-map-grid" id="world-map-grid"></div>
        <footer class="rpg-dialog__footer">
          <p class="rpg-help">The map shows progression. Start combat runs from the Adventure menu.</p>
          <button class="rpg-button" id="close-map-btn" type="button">Close Map</button>
        </footer>
      </section>`;

    const runeDefs = [
      { id: 'verdant', name: 'Verdant', icon: '/assets/ui_sprites/icons/I_Jade.png' },
      { id: 'shadow', name: 'Shadow', icon: '/assets/ui_sprites/icons/I_Amethist.png' },
      { id: 'flame', name: 'Flame', icon: '/assets/ui_sprites/icons/I_Ruby.png' },
      { id: 'void', name: 'Void', icon: '/assets/ui_sprites/icons/I_Sapphire.png' },
    ];
    const runeBar = modal.querySelector('.world-map-runes') as HTMLElement;
    runeBar.innerHTML = runeDefs.map(rune => {
      const unlocked = quests.unlockedRunes.has(rune.id);
      return `<div class="world-map-rune ${unlocked ? 'is-restored' : ''}">
        <img src="${escapeHtmlAttribute(safeLocalAssetPath(rune.icon))}" width="24" height="24" alt="">
        <span>${escapeHtml(rune.name)}</span><small>${unlocked ? 'Restored' : 'Locked'}</small>
      </div>`;
    }).join('');

    // Copy before sorting: source order remains the story-unlock contract.
    const ordered = [...WorldMapUI.LOCATIONS].sort((a, b) => {
      if (a.id === 'town_eldermoor') return -1;
      if (b.id === 'town_eldermoor') return 1;
      const levelOf = (location: WorldMapLocation) => DUNGEONS.find(d => d.id === location.id)?.minLevel ?? location.recommendedLevel;
      return levelOf(a) - levelOf(b);
    });

    const grid = modal.querySelector('#world-map-grid') as HTMLElement;
    ordered.forEach(location => {
      const isTown = location.id === 'town_eldermoor';
      const dungeonIdx = DUNGEONS.findIndex(d => d.id === location.id);
      const dungeon = dungeonIdx >= 0 ? DUNGEONS[dungeonIdx] : undefined;
      const requiredLevel = dungeon?.minLevel ?? location.recommendedLevel;
      const sideContent = Boolean(dungeon?.sideContent);
      const cleared = sideContent || (dungeonIdx !== -1 && dungeonIdx <= maxDungeonCleared);
      const levelMet = playerLevel >= requiredLevel;
      const isUnlocked = isTown || (cleared && levelMet);
      const lockReason = !cleared ? 'Clear the previous story dungeon' : `Reach level ${requiredLevel}`;

      const card = document.createElement('article');
      card.className = `rpg-card world-map-card ${isUnlocked ? 'is-open' : 'is-locked'}`;
      card.style.setProperty('--zone-accent', location.color);
      card.innerHTML = `
        <div class="world-map-card__art" style="background-image:linear-gradient(to top,rgba(7,8,11,.96),rgba(7,8,11,.2)),url('${escapeHtmlAttribute(safeLocalAssetPath(location.bgImage))}')" aria-hidden="true"></div>
        <div class="world-map-card__head">
          <img src="${escapeHtmlAttribute(safeLocalAssetPath(location.icon))}" width="30" height="30" alt="">
          <div><p class="rpg-kicker">${escapeHtml(location.actTitle)}</p><h3 class="rpg-heading">${escapeHtml(location.name)}</h3></div>
          <span class="rpg-badge">${isTown ? 'Safe' : `Level ${requiredLevel}+`}</span>
        </div>
        <p class="world-map-card__description">${escapeHtml(location.description)}</p>
        <div class="world-map-card__boss"><span>Encounter</span><strong>${escapeHtml(location.bossName)}</strong></div>
        <div class="world-map-card__footer">
          <span class="wm-state ${isUnlocked ? 'is-open' : ''}">${isUnlocked ? 'Unlocked' : escapeHtml(lockReason)}</span>
          ${isTown && isUnlocked ? '<button class="rpg-button rpg-button--primary travel-btn" type="button">Travel to Town</button>' : ''}
        </div>`;
      if (isUnlocked && isTown) {
        card.querySelector('.travel-btn')?.addEventListener('click', () => {
          audio.playTeleport();
          this.close();
          this.onSelectLocation(location.id);
        });
      }
      grid.appendChild(card);
    });

    modal.querySelector('#close-map-btn')?.addEventListener('click', () => this.close());
    modal.addEventListener('pointerdown', event => { if (event.target === modal) this.close(); });
    this.container.appendChild(modal);
    this.modalEl = modal;
    this.releaseFocus = installModalFocusTrap(modal, {
      onEscape: () => this.close(),
      initialFocus: modal.querySelector<HTMLButtonElement>('#close-map-btn'),
    });
  }

  public close(): void {
    this.releaseFocus?.();
    this.releaseFocus = null;
    this.modalEl?.remove();
    this.modalEl = null;
  }

  private injectStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .world-map-dialog { height:min(92dvh,880px); }
      .world-map-progress { display:grid; text-align:right; }
      .world-map-progress strong { color:var(--rpg-gold-bright); font:900 1.35rem/1 'Cinzel',serif; }
      .world-map-runes { display:grid; grid-template-columns:repeat(4,1fr); gap:7px; margin:4px 0 10px; }
      .world-map-rune { display:grid; grid-template-columns:28px 1fr; align-items:center; padding:6px 8px; color:var(--rpg-muted); background:rgba(0,0,0,.32); border:1px solid rgba(255,255,255,.08); filter:grayscale(1); opacity:.58; }
      .world-map-rune img { grid-row:1/3; image-rendering:pixelated; } .world-map-rune span { font-weight:900; } .world-map-rune small { font-size:.68rem; }
      .world-map-rune.is-restored { color:#92e6a7; border-color:rgba(92,210,122,.4); filter:none; opacity:1; }
      .world-map-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(285px,1fr)); gap:10px; padding:2px 5px 8px 2px; }
      .world-map-card { position:relative; display:flex; flex-direction:column; gap:8px; min-height:250px; padding:10px; overflow:hidden; border-width:10px; border-image-width:10px; }
      .world-map-card__art { position:absolute; inset:0; z-index:-1; background-position:center; background-size:cover; opacity:.42; }
      .world-map-card.is-open { box-shadow:inset 0 3px var(--zone-accent),0 8px 18px rgba(0,0,0,.45); }
      .world-map-card.is-locked { filter:grayscale(.78); opacity:.68; }
      .world-map-card__head { display:grid; grid-template-columns:34px 1fr auto; gap:8px; align-items:start; }
      .world-map-card__head img { image-rendering:pixelated; } .world-map-card__head p { margin:0 0 2px; color:var(--zone-accent); }
      .world-map-card__description { margin:0; color:#d7cdb7; font-size:.86rem; line-height:1.45; }
      .world-map-card__boss { display:grid; gap:2px; margin-top:auto; } .world-map-card__boss span { color:var(--rpg-muted); font-size:.68rem; font-weight:900; letter-spacing:.1em; text-transform:uppercase; } .world-map-card__boss strong { color:#f0c0ad; }
      .world-map-card__footer { display:flex; align-items:center; justify-content:space-between; gap:8px; padding-top:7px; border-top:1px solid rgba(255,255,255,.1); }
      .wm-state { color:#d8a19d; font-size:.72rem; font-weight:900; text-transform:uppercase; } .wm-state.is-open { color:#8de7a6; }
      @media(max-width:700px){ .world-map-runes{grid-template-columns:1fr 1fr}.world-map-dialog{height:96dvh}.world-map-card{min-height:225px}.rpg-dialog__footer .rpg-help{display:none} }
      @media(max-height:520px) and (orientation:landscape){.world-map-runes{display:none}.world-map-grid{grid-template-columns:repeat(auto-fill,minmax(250px,1fr))}.world-map-card{min-height:210px}}
    `;
    document.head.appendChild(style);
  }
}
