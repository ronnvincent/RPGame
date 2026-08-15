/**
 * Full Quest Log & Lore Codex Modal
 * Features:
 * 1. Category Tabs: Main Story, Side Bounties, Completed Log, Lore & Bestiary
 * 2. Detailed Objective Tracking Checklists
 * 3. Item & EXP Reward Previews
 * 4. Responsive Keyboard Shortcuts ([J] / [Escape])
 */

import { quests } from '../quests/QuestManager';
import { QUEST_DEFINITIONS, QuestDefinition } from '../quests/QuestDefinitions';
import { audio } from '../engine/AudioManager';

export class QuestLogUI {
  private container: HTMLElement;
  private modalEl: HTMLElement | null = null;
  private currentTab: 'main' | 'side' | 'completed' | 'lore' = 'main';

  constructor(parent: HTMLElement) {
    this.container = parent;
  }

  public toggle() {
    if (this.modalEl) {
      this.close();
    } else {
      this.open();
    }
  }

  public open() {
    this.close();
    audio.playPageTurn();

    this.modalEl = document.createElement('div');
    this.modalEl.className = 'dialogue-modal-backdrop';
    this.modalEl.style.justifyContent = 'center';
    this.modalEl.style.padding = 'max(8px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left))';

    const frame = document.createElement('div');
    frame.className = 'dialogue-box-frame quest-log-modal';
    frame.style.maxWidth = '880px';
    frame.style.width = '94vw';
    frame.style.height = '85dvh';
    frame.style.maxHeight = '85dvh';
    frame.style.display = 'flex';
    frame.style.flexDirection = 'column';
    frame.style.touchAction = 'pan-y';

    // Header
    const header = document.createElement('div');
    header.className = 'dialogue-header-row';
    header.innerHTML = `
      <div style="font-size: 18px; font-weight: 900; color: #ffd700; display: flex; align-items: center; gap: 8px;">
        <span>📜 QUEST LOG & LORE ARCHIVE</span>
      </div>
      <div style="font-size: 11px; color: #94a3b8;">[J / Esc to Close]</div>
    `;

    // Tabs Row
    const tabsRow = document.createElement('div');
    tabsRow.style.cssText = 'display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 10px 0; border-bottom: 2px solid rgba(255,255,255,0.1); padding-bottom: 6px;';
    
    const tabs: { id: 'main' | 'side' | 'completed' | 'lore'; label: string; icon: string }[] = [
      { id: 'main', label: 'Main Story', icon: '⚔️' },
      { id: 'side', label: 'Side & Bounties', icon: '🎯' },
      { id: 'completed', label: 'Completed', icon: '🏆' },
      { id: 'lore', label: 'Lore & Bestiary', icon: '📖' }
    ];

    tabs.forEach((tab) => {
      const tabBtn = document.createElement('button');
      tabBtn.className = `dialogue-btn ${this.currentTab === tab.id ? 'dialogue-btn-quest' : ''}`;
      tabBtn.innerHTML = `${tab.icon} ${tab.label}`;
      tabBtn.onclick = () => {
        audio.playPageTurn();
        this.currentTab = tab.id;
        this.renderTabContent(contentArea);
        tabsRow.querySelectorAll('.dialogue-btn').forEach((b, i) => {
          b.className = `dialogue-btn ${tabs[i].id === this.currentTab ? 'dialogue-btn-quest' : ''}`;
        });
      };
      tabsRow.appendChild(tabBtn);
    });

    // Content Area
    const contentArea = document.createElement('div');
    contentArea.style.cssText = 'flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; padding-right: 6px;';

    this.renderTabContent(contentArea);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'dialogue-actions-row';
    footer.innerHTML = `<button id="close-quest-log-btn" class="dialogue-btn">Close ✕</button>`;
    footer.querySelector('#close-quest-log-btn')?.addEventListener('click', () => this.close());

    frame.appendChild(header);
    frame.appendChild(tabsRow);
    frame.appendChild(contentArea);
    frame.appendChild(footer);
    this.modalEl.appendChild(frame);
    this.container.appendChild(this.modalEl);
  }

  private renderTabContent(container: HTMLElement) {
    container.innerHTML = '';

    if (this.currentTab === 'main' || this.currentTab === 'side') {
      const activeList = quests.getAllActiveQuests().filter(q => 
        this.currentTab === 'main' ? q.quest.category === 'main' : q.quest.category !== 'main'
      );

      if (activeList.length === 0) {
        container.innerHTML = `
          <div style="text-align: center; color: #94a3b8; font-size: 14px; padding: 40px;">
            No active ${this.currentTab === 'main' ? 'Main Story' : 'Side'} quests currently.
            <div style="font-size: 12px; color: #64748b; margin-top: 6px;">Talk to NPCs in the Haven of Eldermoor to accept new assignments!</div>
          </div>
        `;
        return;
      }

      activeList.forEach(({ quest, objectives, state }) => {
        const card = document.createElement('div');
        card.style.cssText = `
          background: rgba(18, 12, 28, 0.85);
          border: 2px solid ${state === 'ready_to_turn_in' ? '#ffd700' : '#475569'};
          border-radius: 8px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        `;

        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="font-size: 16px; font-weight: 900; color: #ffd700;">${quest.title}</div>
            <span style="font-size: 11px; padding: 3px 8px; border-radius: 4px; font-weight: 800; background: ${state === 'ready_to_turn_in' ? '#22c55e' : '#3b82f6'}; color: #fff;">
              ${state === 'ready_to_turn_in' ? 'READY TO TURN IN' : 'IN PROGRESS'}
            </span>
          </div>

          <div style="font-size: 12px; color: #cbd5e1; line-height: 1.4;">${quest.description}</div>
          <div style="font-size: 11px; color: #94a3b8;"><strong>Quest Giver:</strong> ${quest.giverName} (Haven of Eldermoor)</div>

          <div style="margin-top: 4px; background: rgba(0,0,0,0.5); padding: 8px 12px; border-radius: 6px;">
            <div style="font-size: 12px; font-weight: 800; color: #fef08a; margin-bottom: 6px;">Objectives:</div>
            <div style="display: flex; flex-direction: column; gap: 4px;">
              ${objectives.map(obj => `
                <div style="display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: ${obj.isCompleted ? '#4ade80' : '#e2e8f0'};">
                  <span>${obj.isCompleted ? '☑️' : '◻️'} ${obj.description}</span>
                  <span style="font-weight: 700;">${obj.currentCount}/${obj.requiredCount}</span>
                </div>
              `).join('')}
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 6px; font-size: 11px; color: #fef08a;">
            <div>Rewards: +${quest.rewards.exp} EXP, +${quest.rewards.gold} Gold ${quest.rewards.runeUnlocked ? `• 🌟 ${quest.rewards.runeUnlocked.toUpperCase()} RUNE` : ''}</div>
          </div>
        `;

        container.appendChild(card);
      });
    } else if (this.currentTab === 'completed') {
      const completed = quests.getAllCompletedQuests();
      if (completed.length === 0) {
        container.innerHTML = `<div style="text-align: center; color: #94a3b8; padding: 40px;">No completed quests yet. Embark on your journey!</div>`;
        return;
      }

      completed.forEach(q => {
        const card = document.createElement('div');
        card.style.cssText = 'background: rgba(10, 20, 10, 0.7); border: 1px solid #166534; border-radius: 6px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center;';
        card.innerHTML = `
          <div>
            <div style="font-size: 14px; font-weight: 800; color: #4ade80;">✓ ${q.title}</div>
            <div style="font-size: 11px; color: #86efac;">${q.description}</div>
          </div>
          <span style="font-size: 11px; color: #fef08a; font-weight: 700;">+${q.rewards.exp} EXP / +${q.rewards.gold}G</span>
        `;
        container.appendChild(card);
      });
    } else if (this.currentTab === 'lore') {
      const loreEntries = [
        {
          title: "The Five Primordial Runes",
          icon: "🌟",
          content: "Ancient cosmic artifacts created at the dawn of Aethelgard. Verdant maintains nature, Shadow balances the spirit realm, Flame grants warmth and energy, Frost safeguards memory, and Void holds the cosmic horizon."
        },
        {
          title: "NightBorne Void Overlord",
          icon: "👑",
          content: "A supreme cosmic entity sealed during the First Calamity. NightBorne wields total eclipse sorcery, creating shadow clones and dimensional rifts to consume all light."
        },
        {
          title: "Chief Warlord Grimjaw",
          icon: "👺",
          content: "Leader of the subterranean goblin hordes. Corrupted by the stolen Verdant Rune, Grimjaw enters an unstoppable rage when near defeat."
        },
        {
          title: "Arch-Lich Malakar",
          icon: "☠️",
          content: "A fallen archmage who traded his mortal soul for eternal unlife. Chanting in the Crypt of the Damned, he raises legions of undead warriors."
        },
        {
          title: "Ancient Red Dragon Ignis",
          icon: "🐉",
          content: "A colossal elder dragon sleeping deep within the volcanic caldera. Awakened by dark disturbances, his flames melt solid diamond."
        }
      ];

      loreEntries.forEach(entry => {
        const card = document.createElement('div');
        card.style.cssText = 'background: rgba(20, 15, 30, 0.85); border: 1px solid #6b21a8; border-radius: 8px; padding: 12px 14px;';
        card.innerHTML = `
          <div style="font-size: 15px; font-weight: 900; color: #c084fc; display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            <span>${entry.icon}</span>
            <span>${entry.title}</span>
          </div>
          <div style="font-size: 12px; color: #cbd5e1; line-height: 1.5;">${entry.content}</div>
        `;
        container.appendChild(card);
      });
    }
  }

  public close() {
    if (this.modalEl && this.modalEl.parentNode) {
      this.modalEl.parentNode.removeChild(this.modalEl);
    }
    this.modalEl = null;
  }
}
