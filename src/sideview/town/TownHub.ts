/**
 * Town Hub: Haven of Eldermoor
 * Manages interactive NPCs, shops, proximity prompts, buildings, and portal gateways.
 */

import type { SideViewEngine } from '../engine/SideViewEngine';
import { DialogueSystem, DialogueOption } from '../dialogue/DialogueSystem';
import { quests } from '../quests/QuestManager';
import { audio } from '../engine/AudioManager';
import { ITEM_DATABASE, ItemData } from '../items/ItemDatabase';

export interface TownNPC {
  id: string;
  name: string;
  title: string;
  icon: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  lore: string[];
}

export class TownHub {
  public npcs: TownNPC[] = [
    {
      id: 'elder_justinian',
      name: 'Elder Justinian',
      title: 'Sage of the Sacred Runes',
      icon: '🧙‍♂️',
      x: 480,
      y: 0,
      width: 48,
      height: 64,
      color: '#eab308',
      lore: [
        "Elder Justinian: Long ago, the Five Primordial Runes were carved from the heart of the first falling star.",
        "Elder Justinian: When united, they generate an impenetrable barrier of cosmic peace. Restore them, and darkness shall fall."
      ]
    },
    {
      id: 'captain_valerie',
      name: 'Captain Valerie',
      title: 'Eldermoor Vanguard Commander',
      icon: '🛡️',
      x: 980,
      y: 0,
      width: 50,
      height: 64,
      color: '#3b82f6',
      lore: [
        "Captain Valerie: I train the finest garrison in the realm! Remember to use your Dodge Dash (Shift/C) to evade heavy boss slams.",
        "Captain Valerie: Chaining skills builds up your combo meter, multiplying your total damage output!"
      ]
    },
    {
      id: 'blacksmith_keith',
      name: 'Blacksmith Keith',
      title: 'Master of the Molten Anvil',
      icon: '⚒️',
      x: 1480,
      y: 0,
      width: 52,
      height: 64,
      color: '#f97316',
      lore: [
        "Blacksmith Keith: Nothing beats pure dwarven steel tempered in dragon fire! Bring me gold, and I can reinforce any blade or armor plate!"
      ]
    },
    {
      id: 'alchemist_morwenna',
      name: 'Alchemist Morwenna',
      title: 'Herbalist & Concoctionist',
      icon: '🧪',
      x: 1980,
      y: 0,
      width: 48,
      height: 64,
      color: '#10b981',
      lore: [
        "Alchemist Morwenna: My potions are distilled from starlight and rare root extracts. Always keep an Elixir or Resurrection Feather on your hotbar!"
      ]
    },
    {
      id: 'portal_donald',
      name: 'Portal Master Donald',
      title: 'Keeper of Dimensional Gateways',
      icon: '🌀',
      x: 2520,
      y: 0,
      width: 54,
      height: 72,
      color: '#a855f7',
      lore: [
        "Portal Master Donald: The Archway can fold space and time, whisking you straight to the Catacombs, the Crypt, the Inferno Caldera, or the Void Nexus."
      ]
    }
  ];

  private activeNpcInRange: TownNPC | null = null;

  constructor() {}

  public update(playerX: number, playerY: number): TownNPC | null {
    this.activeNpcInRange = null;
    for (const npc of this.npcs) {
      const dist = Math.abs(playerX - npc.x);
      if (dist < 85) {
        this.activeNpcInRange = npc;
        break;
      }
    }
    return this.activeNpcInRange;
  }

  public getActiveNpc(): TownNPC | null {
    return this.activeNpcInRange;
  }

  public interactWithNpc(
    npc: TownNPC,
    engine: SideViewEngine,
    dialogue: DialogueSystem,
    onOpenWorldMap: () => void
  ) {
    audio.playDialogueBlip(500);

    const readyQuests = quests.getReadyToTurnInQuestsForNpc(npc.id);
    const availableQuests = quests.getAvailableQuestsForNpc(npc.id);
    const activeQuests = quests.getActiveQuestsForNpc(npc.id);

    const options: DialogueOption[] = [];
    let sentences: string[] = [];

    // 1. Ready to Turn In Quests
    if (readyQuests.length > 0) {
      const q = readyQuests[0];
      sentences = q.dialogue.turnIn;
      options.push({
        label: `Turn In: ${q.title}`,
        icon: '✨',
        type: 'turn_in_quest',
        onSelect: () => {
          quests.turnInQuest(q.id, engine);
          dialogue.showDialogue({
            speakerName: npc.name,
            speakerTitle: npc.title,
            portraitIcon: npc.icon,
            sentences: q.dialogue.completed,
            options: [{ label: 'Farewell', type: 'close' }]
          });
        }
      });
    }
    // 2. Available Quests
    else if (availableQuests.length > 0) {
      const q = availableQuests[0];
      sentences = q.dialogue.intro;
      options.push({
        label: `Accept Quest: ${q.title}`,
        icon: '📜',
        type: 'accept_quest',
        onSelect: () => {
          quests.startQuest(q.id);
          dialogue.close();
        }
      });
    }
    // 3. Active in Progress Quests
    else if (activeQuests.length > 0) {
      const q = activeQuests[0];
      sentences = q.dialogue.inProgress;
    }
    // 4. Default Greeting
    else {
      sentences = [
        `${npc.name}: Greetings, traveler. How fares your journey across Aethelgard?`
      ];
    }

    // Specific NPC Action Options
    if (npc.id === 'blacksmith_keith') {
      options.push({
        label: 'Blacksmith Forge (Upgrade Gear)',
        icon: '⚒️',
        type: 'open_shop',
        onSelect: () => {
          dialogue.close();
          this.openBlacksmithModal(engine);
        }
      });
    }

    if (npc.id === 'alchemist_morwenna') {
      options.push({
        label: 'Browse Potion Shop',
        icon: '🧪',
        type: 'open_shop',
        onSelect: () => {
          dialogue.close();
          this.openAlchemistShopModal(engine);
        }
      });
    }

    if (npc.id === 'portal_donald') {
      options.push({
        label: 'Open World Map / Dungeons',
        icon: '🌀',
        type: 'custom',
        onSelect: () => {
          dialogue.close();
          onOpenWorldMap();
        }
      });
    }

    // Lore Option
    options.push({
      label: 'Ask about Lore & Advice',
      icon: '💬',
      type: 'lore',
      onSelect: () => {
        dialogue.showDialogue({
          speakerName: npc.name,
          speakerTitle: npc.title,
          portraitIcon: npc.icon,
          sentences: npc.lore,
          options: [{ label: 'Thank you', type: 'close' }]
        });
      }
    });

    options.push({
      label: 'Farewell',
      icon: '🚪',
      type: 'close'
    });

    dialogue.showDialogue({
      speakerName: npc.name,
      speakerTitle: npc.title,
      portraitIcon: npc.icon,
      sentences,
      options
    });
  }

  /**
   * Blacksmith Forge Upgrade Modal
   */
  public openBlacksmithModal(engine: SideViewEngine) {
    audio.playPageTurn();
    const overlay = document.createElement('div');
    overlay.className = 'dialogue-modal-backdrop';

    const modal = document.createElement('div');
    modal.className = 'dialogue-box-frame';
    modal.style.maxWidth = '640px';

    const renderContent = () => {
      modal.innerHTML = `
        <div class="dialogue-header-row">
          <div style="font-size: 18px; font-weight: 900; color: #ffd700;">⚒️ BLACKSMITH FORGE & REFORGING</div>
          <div style="font-size: 13px; color: #fef08a; font-weight: 800;">💰 Gold: ${engine.player.gold}G</div>
        </div>
        <div style="font-size: 13px; color: #cbd5e1; margin: 4px 0 10px 0;">
          Keith can reforge your equipped weapons and armor plates to boost raw Attack & Defense stats!
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <div style="background: rgba(0,0,0,0.5); padding: 10px 14px; border-radius: 6px; display: flex; align-items: center; justify-content: space-between;">
            <div>
              <div style="font-weight: 800; color: #f87171;">⚔️ Reforge Blade (+6 Base ATK)</div>
              <div style="font-size: 11px; color: #94a3b8;">Current ATK: ${engine.player.totalAtk}</div>
            </div>
            <button id="forge-atk-btn" class="dialogue-btn" style="padding: 6px 16px;">Upgrade (150G)</button>
          </div>

          <div style="background: rgba(0,0,0,0.5); padding: 10px 14px; border-radius: 6px; display: flex; align-items: center; justify-content: space-between;">
            <div>
              <div style="font-weight: 800; color: #60a5fa;">🛡️ Reinforce Plate Armor (+4 Base DEF)</div>
              <div style="font-size: 11px; color: #94a3b8;">Current DEF: ${engine.player.totalDef}</div>
            </div>
            <button id="forge-def-btn" class="dialogue-btn" style="padding: 6px 16px;">Upgrade (150G)</button>
          </div>

          <div style="background: rgba(0,0,0,0.5); padding: 10px 14px; border-radius: 6px; display: flex; align-items: center; justify-content: space-between;">
            <div>
              <div style="font-weight: 800; color: #4ade80;">❤️ Vitality Blessing (+50 Max HP)</div>
              <div style="font-size: 11px; color: #94a3b8;">Current HP: ${engine.player.hp}/${engine.player.maxHp}</div>
            </div>
            <button id="forge-hp-btn" class="dialogue-btn" style="padding: 6px 16px;">Upgrade (200G)</button>
          </div>
        </div>
        <div class="dialogue-actions-row" style="margin-top: 14px;">
          <button id="close-forge-btn" class="dialogue-btn">Done ✕</button>
        </div>
      `;

      modal.querySelector('#forge-atk-btn')?.addEventListener('click', () => {
        if (engine.player.gold >= 150) {
          engine.player.gold -= 150;
          engine.player.baseAtk += 6;
          engine.recalculateStats();
          audio.playSlash('heavy');
          audio.playCoin();
          engine.particles.addImpactBurst(engine.player.x, engine.player.y, 16, '#f87171', 'spark');
          renderContent();
        } else {
          audio.playTone(200, 0.15);
        }
      });

      modal.querySelector('#forge-def-btn')?.addEventListener('click', () => {
        if (engine.player.gold >= 150) {
          engine.player.gold -= 150;
          engine.player.baseDef += 4;
          engine.recalculateStats();
          audio.playTone(600, 0.2);
          audio.playCoin();
          engine.particles.addHolyPillar(engine.player.x, engine.player.y);
          renderContent();
        } else {
          audio.playTone(200, 0.15);
        }
      });

      modal.querySelector('#forge-hp-btn')?.addEventListener('click', () => {
        if (engine.player.gold >= 200) {
          engine.player.gold -= 200;
          engine.player.maxHp += 50;
          engine.player.hp = Math.min(engine.player.maxHp, engine.player.hp + 50);
          engine.recalculateStats();
          audio.playHeal();
          audio.playCoin();
          engine.particles.addHolyPillar(engine.player.x, engine.player.y);
          renderContent();
        } else {
          audio.playTone(200, 0.15);
        }
      });

      modal.querySelector('#close-forge-btn')?.addEventListener('click', () => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      });
    };

    renderContent();
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  /**
   * Alchemist Morwenna Potion Shop Modal
   */
  public openAlchemistShopModal(engine: SideViewEngine) {
    audio.playPageTurn();
    const overlay = document.createElement('div');
    overlay.className = 'dialogue-modal-backdrop';

    const modal = document.createElement('div');
    modal.className = 'dialogue-box-frame';
    modal.style.maxWidth = '680px';

    const shopItems: ItemData[] = [
      ITEM_DATABASE.find(i => i.id === 'pot_hp_small') || ITEM_DATABASE[8],
      ITEM_DATABASE.find(i => i.id === 'pot_hp_large') || ITEM_DATABASE[8],
      ITEM_DATABASE.find(i => i.id === 'pot_mp_large') || ITEM_DATABASE[9],
      ITEM_DATABASE.find(i => i.id === 'pot_elixir') || ITEM_DATABASE[12],
      ITEM_DATABASE.find(i => i.id === 'pot_atk_flask') || ITEM_DATABASE[13],
      ITEM_DATABASE.find(i => i.id === 'pot_revive_feather') || ITEM_DATABASE[14]
    ].filter(Boolean) as ItemData[];

    const renderContent = () => {
      modal.innerHTML = `
        <div class="dialogue-header-row">
          <div style="font-size: 18px; font-weight: 900; color: #ffd700;">🧪 ALCHEMIST MORWENNA'S APOTHECARY</div>
          <div style="font-size: 13px; color: #fef08a; font-weight: 800;">💰 Gold: ${engine.player.gold}G</div>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 8px; margin: 10px 0;">
          ${shopItems.map((item, idx) => `
            <div style="background: rgba(0,0,0,0.5); padding: 8px 12px; border-radius: 6px; display: flex; align-items: center; justify-content: space-between; border: 1px solid #334155;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <img src="${item.image}" style="width: 28px; height: 28px; image-rendering: pixelated;" />
                <div>
                  <div style="font-size: 12px; font-weight: 800; color: #f8fafc;">${item.name}</div>
                  <div style="font-size: 10px; color: #94a3b8;">${item.description}</div>
                </div>
              </div>
              <button class="buy-pot-btn dialogue-btn" data-idx="${idx}" style="padding: 4px 10px; font-size: 11px;">
                ${item.price}G
              </button>
            </div>
          `).join('')}
        </div>
        <div class="dialogue-actions-row">
          <button id="close-shop-btn" class="dialogue-btn">Done ✕</button>
        </div>
      `;

      modal.querySelectorAll('.buy-pot-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number((btn as HTMLElement).dataset.idx);
          const item = shopItems[idx];
          if (item && engine.player.gold >= item.price) {
            engine.player.gold -= item.price;
            engine.addItemToInventory({ ...item });
            audio.playCoin();
            audio.playHeal();
            renderContent();
          } else {
            audio.playTone(200, 0.15);
          }
        });
      });

      modal.querySelector('#close-shop-btn')?.addEventListener('click', () => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      });
    };

    renderContent();
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }
}
