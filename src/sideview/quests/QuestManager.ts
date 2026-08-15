/**
 * Quest State & Progression Manager
 * Handles quest tracking, objective verification, rewards distribution, and NPC status indicators.
 */

import { QUEST_DEFINITIONS, QuestDefinition, QuestObjective, QuestState } from './QuestDefinitions';
import type { SideViewEngine } from '../engine/SideViewEngine';
import { audio } from '../engine/AudioManager';

export interface QuestProgressEvent {
  type: 'quest_started' | 'objective_updated' | 'quest_ready' | 'quest_completed';
  quest: QuestDefinition;
  objective?: QuestObjective;
  message: string;
}

export class QuestManager {
  private questStates: Map<string, QuestState> = new Map();
  private questObjectives: Map<string, QuestObjective[]> = new Map();
  public unlockedDungeons: Set<string> = new Set(['goblin_catacombs']);
  public unlockedRunes: Set<string> = new Set();
  private listeners: ((event: QuestProgressEvent) => void)[] = [];

  constructor() {
    this.init();
  }

  private init() {
    // Clone objectives so mutated counts are isolated
    QUEST_DEFINITIONS.forEach((quest) => {
      this.questStates.set(quest.id, 'not_started');
      const clonedObjs = quest.objectives.map(o => ({ ...o, currentCount: 0, isCompleted: false }));
      this.questObjectives.set(quest.id, clonedObjs);
    });

    // Automatically make first main quest available
  }

  public subscribe(fn: (event: QuestProgressEvent) => void) {
    this.listeners.push(fn);
  }

  private notify(event: QuestProgressEvent) {
    this.listeners.forEach(fn => fn(event));
  }

  public getQuest(questId: string): QuestDefinition | undefined {
    return QUEST_DEFINITIONS.find(q => q.id === questId);
  }

  public getQuestState(questId: string): QuestState {
    return this.questStates.get(questId) || 'not_started';
  }

  public getQuestObjectives(questId: string): QuestObjective[] {
    return this.questObjectives.get(questId) || [];
  }

  public isQuestAvailable(quest: QuestDefinition): boolean {
    const state = this.getQuestState(quest.id);
    if (state !== 'not_started') return false;

    if (quest.prerequisiteQuestId) {
      const prereqState = this.getQuestState(quest.prerequisiteQuestId);
      if (prereqState !== 'completed') return false;
    }
    return true;
  }

  public getAvailableQuestsForNpc(npcId: string): QuestDefinition[] {
    return QUEST_DEFINITIONS.filter(q => q.giverNpcId === npcId && this.isQuestAvailable(q));
  }

  public getActiveQuestsForNpc(npcId: string): QuestDefinition[] {
    return QUEST_DEFINITIONS.filter(q => q.giverNpcId === npcId && this.getQuestState(q.id) === 'in_progress');
  }

  public getReadyToTurnInQuestsForNpc(npcId: string): QuestDefinition[] {
    return QUEST_DEFINITIONS.filter(q => q.giverNpcId === npcId && this.getQuestState(q.id) === 'ready_to_turn_in');
  }

  public getAllActiveQuests(): { quest: QuestDefinition; objectives: QuestObjective[]; state: QuestState }[] {
    const list: { quest: QuestDefinition; objectives: QuestObjective[]; state: QuestState }[] = [];
    QUEST_DEFINITIONS.forEach((quest) => {
      const state = this.getQuestState(quest.id);
      if (state === 'in_progress' || state === 'ready_to_turn_in') {
        list.push({
          quest,
          objectives: this.getQuestObjectives(quest.id),
          state
        });
      }
    });
    return list;
  }

  public getAllCompletedQuests(): QuestDefinition[] {
    return QUEST_DEFINITIONS.filter(q => this.getQuestState(q.id) === 'completed');
  }

  public getNpcIndicator(npcId: string): 'turn_in' | 'main_available' | 'side_available' | null {
    const ready = this.getReadyToTurnInQuestsForNpc(npcId);
    if (ready.length > 0) return 'turn_in';

    const available = this.getAvailableQuestsForNpc(npcId);
    if (available.some(q => q.category === 'main')) return 'main_available';
    if (available.length > 0) return 'side_available';

    return null;
  }

  public startQuest(questId: string): boolean {
    const quest = this.getQuest(questId);
    if (!quest || !this.isQuestAvailable(quest)) return false;

    this.questStates.set(questId, 'in_progress');
    audio.playQuestAccept();

    this.notify({
      type: 'quest_started',
      quest,
      message: `📜 Quest Accepted: ${quest.title}`
    });
    return true;
  }

  public turnInQuest(questId: string, engine?: SideViewEngine): boolean {
    const quest = this.getQuest(questId);
    if (!quest) return false;
    const state = this.getQuestState(questId);
    if (state !== 'ready_to_turn_in') return false;

    this.questStates.set(questId, 'completed');
    audio.playQuestComplete();

    // Distribute Rewards
    if (engine) {
      engine.addExp(quest.rewards.exp);
      engine.player.gold += quest.rewards.gold;
      engine.particles.addFloatingText(engine.player.x, engine.player.y - 70, `+${quest.rewards.exp} EXP`, '#ffd700', true, 24);
      engine.particles.addFloatingText(engine.player.x, engine.player.y - 100, `+${quest.rewards.gold} Gold`, '#ffecb3', true, 22);

      if (quest.rewards.items && quest.rewards.items.length > 0) {
        quest.rewards.items.forEach(item => {
          if (item) engine.addItemToInventory(item);
        });
      }
    }

    if (quest.rewards.unlockDungeonId) {
      this.unlockedDungeons.add(quest.rewards.unlockDungeonId);
    }
    if (quest.rewards.runeUnlocked) {
      this.unlockedRunes.add(quest.rewards.runeUnlocked);
    }

    this.notify({
      type: 'quest_completed',
      quest,
      message: `🏆 Quest Complete: ${quest.title} (+${quest.rewards.exp} EXP, +${quest.rewards.gold}G)`
    });
    return true;
  }

  public onEnemyKilled(enemyName: string, isBoss: boolean = false) {
    let stateChanged = false;

    QUEST_DEFINITIONS.forEach((quest) => {
      if (this.getQuestState(quest.id) !== 'in_progress') return;

      const objectives = this.getQuestObjectives(quest.id);
      let questCompleted = true;

      objectives.forEach((obj) => {
        if (!obj.isCompleted) {
          const matchTarget = (obj.type === 'kill_enemy' || obj.type === 'kill_boss') &&
            (obj.target.toLowerCase() === enemyName.toLowerCase() ||
             enemyName.toLowerCase().includes(obj.target.toLowerCase()) ||
             (obj.target.toLowerCase() === 'orc berserker' && (enemyName.includes('Berserker') || enemyName.includes('Death Knight'))));

          if (matchTarget) {
            obj.currentCount = Math.min(obj.requiredCount, obj.currentCount + 1);
            if (obj.currentCount >= obj.requiredCount) {
              obj.isCompleted = true;
            }

            this.notify({
              type: 'objective_updated',
              quest,
              objective: obj,
              message: `⚔️ ${obj.description} (${obj.currentCount}/${obj.requiredCount})`
            });
            stateChanged = true;
          }
        }

        if (!obj.isCompleted) {
          questCompleted = false;
        }
      });

      if (questCompleted) {
        this.questStates.set(quest.id, 'ready_to_turn_in');
        audio.playTone(880, 0.2);
        this.notify({
          type: 'quest_ready',
          quest,
          message: `✨ Quest Ready to Turn In: ${quest.title} (Return to ${quest.giverName})`
        });
      }
    });
  }

  public onComboReached(comboCount: number) {
    QUEST_DEFINITIONS.forEach((quest) => {
      if (this.getQuestState(quest.id) !== 'in_progress') return;

      const objectives = this.getQuestObjectives(quest.id);
      let questCompleted = true;

      objectives.forEach((obj) => {
        if (!obj.isCompleted && obj.type === 'reach_combo') {
          const targetCombo = Number(obj.target) || 40;
          if (comboCount >= targetCombo) {
            obj.currentCount = targetCombo;
            obj.isCompleted = true;
            this.notify({
              type: 'objective_updated',
              quest,
              objective: obj,
              message: `⚡ ${obj.description} Complete!`
            });
          }
        }
        if (!obj.isCompleted) questCompleted = false;
      });

      if (questCompleted) {
        this.questStates.set(quest.id, 'ready_to_turn_in');
        this.notify({
          type: 'quest_ready',
          quest,
          message: `✨ Quest Ready to Turn In: ${quest.title} (Return to ${quest.giverName})`
        });
      }
    });
  }

  public isDungeonUnlocked(dungeonId: string): boolean {
    if (dungeonId === 'goblin_catacombs') return true;
    return this.unlockedDungeons.has(dungeonId);
  }
}

export const quests = new QuestManager();
