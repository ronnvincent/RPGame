import { quests } from '../quests/QuestManager';
import { audio } from '../engine/AudioManager';
import { clampPercent, escapeHtml, installModalFocusTrap } from './UiSafety';

type QuestTab = 'main' | 'side' | 'completed' | 'lore';
const STYLE_ID = 'quest-log-rpg-style';

const LORE_ENTRIES = [
  { title: 'The Five Primordial Runes', tag: 'World', content: 'Ancient artifacts created at the dawn of Aethelgard. Verdant sustains nature, Shadow balances the spirit realm, Flame carries energy, Frost safeguards memory, and Void holds the cosmic horizon.' },
  { title: 'NightBorne Void Overlord', tag: 'Boss', content: 'A cosmic entity sealed during the First Calamity. NightBorne shapes eclipses, shadow doubles, and dimensional rifts to consume light.' },
  { title: 'Chief Warlord Grimjaw', tag: 'Boss', content: 'Leader of the subterranean goblin hordes. The stolen Verdant Rune drives his final, desperate rage.' },
  { title: 'Arch-Lich Malakar', tag: 'Boss', content: 'A fallen archmage who traded his mortal soul for unlife and now raises soldiers from the Crypt of the Damned.' },
  { title: 'Ancient Red Dragon Ignis', tag: 'Boss', content: 'An elder dragon sleeping beneath the caldera. His awakening turns stone corridors into rivers of fire.' },
] as const;

export class QuestLogUI {
  private modalEl: HTMLElement | null = null;
  private releaseFocus: (() => void) | null = null;
  private currentTab: QuestTab = 'main';

  constructor(private container: HTMLElement) {
    this.injectStyles();
  }

  public toggle(): void {
    if (this.modalEl) this.close();
    else this.open();
  }

  public open(): void {
    this.close();
    audio.playPageTurn();
    const modal = document.createElement('div');
    modal.className = 'rpg-screen rpg-modal quest-log-screen';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'quest-log-title');
    modal.innerHTML = `<div class="rpg-screen__backdrop" aria-hidden="true"></div>
      <section class="rpg-panel rpg-dialog quest-log-dialog" tabindex="-1">
        <header class="rpg-dialog__header">
          <div><p class="rpg-kicker">Journal and Field Notes</p><h2 class="rpg-title" id="quest-log-title">Quest Log</h2></div>
          <span class="rpg-help"><kbd class="rpg-key">J</kbd> or <kbd class="rpg-key">Esc</kbd> closes</span>
        </header>
        <div class="rpg-tabs" role="tablist" aria-label="Quest categories"></div>
        <div class="rpg-dialog__body quest-log-content" id="quest-log-content" role="tabpanel" tabindex="0"></div>
        <footer class="rpg-dialog__footer"><button class="rpg-button" id="close-quest-log-btn" type="button">Close Journal</button></footer>
      </section>`;
    this.container.appendChild(modal);
    this.modalEl = modal;

    const tabs: Array<{ id: QuestTab; label: string }> = [
      { id: 'main', label: 'Main Story' }, { id: 'side', label: 'Side and Bounties' },
      { id: 'completed', label: 'Completed' }, { id: 'lore', label: 'Lore and Bestiary' },
    ];
    const tabList = modal.querySelector('.rpg-tabs') as HTMLElement;
    tabs.forEach((tab, index) => {
      const button = document.createElement('button');
      button.className = 'rpg-tab';
      button.type = 'button';
      button.id = `quest-tab-${tab.id}`;
      button.dataset.tab = tab.id;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', 'quest-log-content');
      button.setAttribute('aria-selected', String(this.currentTab === tab.id));
      button.tabIndex = this.currentTab === tab.id ? 0 : -1;
      button.textContent = tab.label;
      button.addEventListener('click', () => this.setTab(tab.id));
      button.addEventListener('keydown', event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const next = (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
        this.setTab(tabs[next].id);
        tabList.querySelector<HTMLButtonElement>(`[data-tab="${tabs[next].id}"]`)?.focus();
      });
      tabList.appendChild(button);
    });

    modal.querySelector('#close-quest-log-btn')?.addEventListener('click', () => this.close());
    modal.addEventListener('pointerdown', event => { if (event.target === modal) this.close(); });
    this.renderTabContent();
    this.releaseFocus = installModalFocusTrap(modal, {
      onEscape: () => this.close(),
      initialFocus: modal.querySelector<HTMLButtonElement>(`[data-tab="${this.currentTab}"]`),
    });
  }

  private setTab(tab: QuestTab): void {
    if (!this.modalEl) return;
    this.currentTab = tab;
    audio.playPageTurn();
    this.modalEl.querySelectorAll<HTMLButtonElement>('[role="tab"]').forEach(button => {
      const active = button.dataset.tab === tab;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    const content = this.modalEl.querySelector('#quest-log-content');
    content?.setAttribute('aria-labelledby', `quest-tab-${tab}`);
    this.renderTabContent();
  }

  private renderTabContent(): void {
    const content = this.modalEl?.querySelector('#quest-log-content') as HTMLElement | null;
    if (!content) return;
    content.replaceChildren();

    if (this.currentTab === 'completed') {
      const completed = quests.getAllCompletedQuests();
      if (!completed.length) return this.renderEmpty(content, 'No completed quests yet.', 'Your victories will be recorded here.');
      completed.forEach(quest => content.appendChild(this.completedCard(quest)));
      return;
    }
    if (this.currentTab === 'lore') {
      LORE_ENTRIES.forEach(entry => {
        const article = document.createElement('article');
        article.className = 'rpg-card quest-lore-card';
        article.innerHTML = `<header><span class="rpg-badge">${escapeHtml(entry.tag)}</span><h3 class="rpg-heading">${escapeHtml(entry.title)}</h3></header><p>${escapeHtml(entry.content)}</p>`;
        content.appendChild(article);
      });
      return;
    }

    const list = quests.getAllActiveQuests().filter(({ quest }) =>
      this.currentTab === 'main' ? quest.category === 'main' : quest.category !== 'main');
    if (!list.length) {
      const label = this.currentTab === 'main' ? 'main-story' : 'side';
      return this.renderEmpty(content, `No active ${label} quests.`, 'Talk to the people of Eldermoor for new work.');
    }

    list.forEach(({ quest, objectives, state }) => {
      const complete = objectives.filter(objective => objective.isCompleted).length;
      const progress = objectives.length ? clampPercent((complete / objectives.length) * 100) : 0;
      const article = document.createElement('article');
      article.className = 'rpg-card quest-card';
      article.innerHTML = `
        <header class="quest-card__header">
          <div><p class="rpg-kicker">Act ${quest.act || 'Town'} · Level ${quest.recommendedLevel}+</p><h3 class="rpg-heading">${escapeHtml(quest.title)}</h3></div>
          <span class="rpg-badge ${state === 'ready_to_turn_in' ? 'rpg-badge--success' : ''}">${state === 'ready_to_turn_in' ? 'Ready to turn in' : 'In progress'}</span>
        </header>
        <p class="quest-card__copy">${escapeHtml(quest.description)}</p>
        <div class="quest-card__meta"><span><b>Giver:</b> ${escapeHtml(quest.giverName)}</span><span><b>Location:</b> Haven of Eldermoor</span></div>
        <div class="rpg-progress" style="--rpg-progress-value:${progress}%" role="progressbar" aria-label="Quest objectives" aria-valuemin="0" aria-valuemax="${objectives.length}" aria-valuenow="${complete}"></div>
        <ul class="quest-objectives">${objectives.map(objective => `<li class="${objective.isCompleted ? 'is-complete' : ''}"><span aria-hidden="true">${objective.isCompleted ? '[x]' : '[ ]'}</span><span>${escapeHtml(objective.description)}</span><strong>${objective.currentCount}/${objective.requiredCount}</strong></li>`).join('')}</ul>
        <footer class="quest-rewards"><span class="rpg-label">Rewards</span><strong>${quest.rewards.exp} EXP · ${quest.rewards.gold} Gold${quest.rewards.runeUnlocked ? ` · ${escapeHtml(quest.rewards.runeUnlocked)} rune` : ''}</strong></footer>`;
      content.appendChild(article);
    });
  }

  private completedCard(quest: ReturnType<typeof quests.getAllCompletedQuests>[number]): HTMLElement {
    const card = document.createElement('article');
    card.className = 'rpg-card quest-complete-card';
    card.innerHTML = `<div><span class="rpg-badge rpg-badge--success">Completed</span><h3 class="rpg-heading">${escapeHtml(quest.title)}</h3><p>${escapeHtml(quest.description)}</p></div><strong>${quest.rewards.exp} EXP · ${quest.rewards.gold} Gold</strong>`;
    return card;
  }

  private renderEmpty(container: HTMLElement, title: string, detail: string): void {
    const empty = document.createElement('div');
    empty.className = 'rpg-empty';
    const heading = document.createElement('div');
    const strong = document.createElement('strong');
    const copy = document.createElement('p');
    strong.textContent = title;
    copy.textContent = detail;
    heading.append(strong, copy);
    empty.appendChild(heading);
    container.appendChild(empty);
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
      .quest-log-dialog{height:min(88dvh,820px)}.quest-log-content{display:grid;gap:9px;padding:8px 4px 8px 2px}
      .quest-card,.quest-lore-card,.quest-complete-card{padding:11px 13px;border-width:10px;border-image-width:10px}
      .quest-card__header{display:flex;justify-content:space-between;gap:10px}.quest-card__header p{margin:0 0 3px}.quest-card__copy,.quest-lore-card p,.quest-complete-card p{margin:7px 0;color:#d6cbb5;line-height:1.45}
      .quest-card__meta{display:flex;gap:16px;flex-wrap:wrap;color:var(--rpg-muted);font-size:.76rem}.quest-objectives{display:grid;gap:5px;margin:8px 0;padding:0;list-style:none}
      .quest-objectives li{display:grid;grid-template-columns:26px 1fr auto;gap:5px;color:#e8dfcb;font-size:.84rem}.quest-objectives li.is-complete{color:#84dda0;text-decoration:line-through;text-decoration-thickness:1px}
      .quest-rewards{display:flex;justify-content:space-between;gap:8px;padding-top:7px;border-top:1px solid rgba(231,189,85,.2);color:var(--rpg-gold-bright);font-size:.8rem}
      .quest-lore-card header{display:flex;align-items:center;gap:9px}.quest-complete-card{display:flex;align-items:center;justify-content:space-between;gap:12px}.quest-complete-card h3{margin-top:5px}.quest-complete-card>strong{color:var(--rpg-gold-bright);white-space:nowrap}
      @media(max-width:620px){.quest-log-dialog{height:96dvh}.quest-log-screen .rpg-dialog__header .rpg-help{display:none}.quest-card__header,.quest-complete-card{align-items:flex-start;flex-direction:column}.quest-rewards{flex-direction:column}.quest-objectives li{grid-template-columns:24px 1fr}.quest-objectives li strong{grid-column:2}}
    `;
    document.head.appendChild(style);
  }
}
