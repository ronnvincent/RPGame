/**
 * Cinematic Dialogue & Cutscene Engine
 * Provides authentic pixel-art dialogue modal, typewriter text effects, portrait rendering,
 * branching conversation options, story prologue, boss intro banners, and epilogues.
 */

import { audio } from '../engine/AudioManager';
import { quests } from '../quests/QuestManager';
import { QuestDefinition } from '../quests/QuestDefinitions';

export interface DialogueOption {
  label: string;
  icon?: string;
  type: 'accept_quest' | 'turn_in_quest' | 'open_shop' | 'lore' | 'close' | 'custom';
  questId?: string;
  onSelect?: () => void;
}

export interface DialoguePayload {
  speakerName: string;
  speakerTitle?: string;
  portraitIcon: string;
  portraitBg?: string;
  sentences: string[];
  options?: DialogueOption[];
  onComplete?: () => void;
}

export class DialogueSystem {
  private container: HTMLElement;
  private modalEl: HTMLElement | null = null;
  private currentSentenceIndex: number = 0;
  private currentText: string = '';
  private fullText: string = '';
  private charIndex: number = 0;
  private isTyping: boolean = false;
  private typeTimer: any = null;
  private currentPayload: DialoguePayload | null = null;
  public isOpen: boolean = false;

  constructor(parent: HTMLElement) {
    this.container = parent;
    this.injectStyles();
  }

  private injectStyles() {
    const existing = document.getElementById('dialogue-system-styles');
    if (existing) return;

    const style = document.createElement('style');
    style.id = 'dialogue-system-styles';
    style.textContent = `
      .dialogue-modal-backdrop {
        position: absolute;
        inset: 0;
        z-index: 9999;
        pointer-events: auto;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        align-items: center;
        padding-bottom: 24px;
        background: rgba(0, 0, 0, 0.45);
        animation: fadeInBackdrop 0.2s ease-out;
        font-family: 'Cinzel', 'Outfit', 'Inter', sans-serif;
      }

      @keyframes fadeInBackdrop {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      .dialogue-box-frame {
        width: min(880px, 92vw);
        background: url('/assets/kenney-rpg-ui/panel_brown.png') repeat;
        background-size: 100% 100%;
        border: 4px solid #4a2c11;
        border-radius: 8px;
        box-shadow: 0 12px 35px rgba(0, 0, 0, 0.85), inset 0 0 15px rgba(0, 0, 0, 0.6);
        padding: 16px 20px 18px 20px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        color: #f8fafc;
        position: relative;
        image-rendering: pixelated;
      }

      .dialogue-header-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 2px solid rgba(255, 215, 0, 0.3);
        padding-bottom: 6px;
      }

      .dialogue-speaker-name {
        font-size: 18px;
        font-weight: 900;
        color: #ffd700;
        letter-spacing: 1px;
        text-shadow: 2px 2px 4px #000;
      }

      .dialogue-speaker-title {
        font-size: 11px;
        color: #cbd5e1;
        font-weight: 600;
        margin-left: 8px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .dialogue-content-row {
        display: flex;
        gap: 16px;
        align-items: flex-start;
        min-height: 85px;
      }

      .dialogue-portrait {
        width: 64px;
        height: 64px;
        flex-shrink: 0;
        background: url('/assets/kenney-rpg-ui/panelInset_beigeLight.png') no-repeat center center;
        background-size: 100% 100%;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 36px;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5);
      }

      .dialogue-text-body {
        flex: 1;
        font-size: 15px;
        line-height: 1.5;
        color: #f1f5f9;
        font-weight: 600;
        text-shadow: 1px 1px 2px #000;
        min-height: 60px;
        user-select: none;
      }

      .dialogue-actions-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: flex-end;
        align-items: center;
        margin-top: 4px;
      }

      .dialogue-btn {
        background: url('/assets/kenney-rpg-ui/buttonRound_brown.png') no-repeat center center;
        background-size: 100% 100%;
        border: 2px solid #2e1a0b;
        color: #fef08a;
        font-size: 13px;
        font-weight: 800;
        padding: 6px 14px;
        cursor: pointer;
        border-radius: 4px;
        transition: transform 0.1s ease, filter 0.1s ease;
        display: flex;
        align-items: center;
        gap: 6px;
        text-shadow: 1px 1px 2px #000;
      }

      .dialogue-btn:hover {
        transform: translateY(-2px);
        filter: brightness(1.2);
      }

      .dialogue-btn:active {
        transform: translateY(1px);
      }

      .dialogue-btn-quest {
        background: url('/assets/kenney-rpg-ui/buttonRound_blue.png') no-repeat center center !important;
        background-size: 100% 100% !important;
        color: #ffffff !important;
      }

      .dialogue-btn-turnin {
        background: url('/assets/kenney-rpg-ui/buttonRound_blue.png') no-repeat center center !important;
        background-size: 100% 100% !important;
        color: #ffd700 !important;
        animation: pulseTurnIn 1.5s infinite ease-in-out;
      }

      @keyframes pulseTurnIn {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.04); filter: brightness(1.3); }
      }

      /* Prologue Cutscene Overlay */
      .prologue-overlay {
        position: absolute;
        inset: 0;
        background: radial-gradient(circle at center, #181124 0%, #06040a 100%);
        z-index: 100000;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 32px;
        color: #f8fafc;
        animation: fadeInCutscene 0.8s ease-in;
      }

      @keyframes fadeInCutscene {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      .prologue-scroll {
        max-width: 720px;
        background: rgba(18, 12, 28, 0.85);
        border: 2px solid #ffd700;
        border-radius: 12px;
        padding: 32px 40px;
        box-shadow: 0 0 40px rgba(255, 215, 0, 0.25), inset 0 0 20px rgba(0, 0, 0, 0.8);
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 20px;
      }

      .prologue-title {
        font-size: 26px;
        font-weight: 900;
        color: #ffd700;
        letter-spacing: 2px;
        text-shadow: 0 0 15px rgba(255, 215, 0, 0.6);
        margin: 0;
      }

      .prologue-body {
        font-size: 16px;
        line-height: 1.7;
        color: #e2e8f0;
        font-weight: 500;
        min-height: 120px;
      }

      .prologue-btn-row {
        display: flex;
        gap: 16px;
        margin-top: 10px;
      }

      /* Boss Announcement Banner */
      .boss-intro-banner {
        position: absolute;
        top: 20%;
        left: 0;
        right: 0;
        background: linear-gradient(90deg, transparent 0%, rgba(185, 28, 28, 0.9) 25%, rgba(185, 28, 28, 0.9) 75%, transparent 100%);
        padding: 16px 0;
        text-align: center;
        color: #fff;
        z-index: 99999;
        pointer-events: none;
        animation: bossBannerSlide 3.5s forwards ease-in-out;
      }

      @keyframes bossBannerSlide {
        0% { transform: translateY(-40px) scale(0.9); opacity: 0; }
        15% { transform: translateY(0) scale(1.05); opacity: 1; }
        25% { transform: translateY(0) scale(1); opacity: 1; }
        80% { transform: translateY(0) scale(1); opacity: 1; }
        100% { transform: translateY(-30px); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  public showDialogue(payload: DialoguePayload) {
    this.close();
    this.isOpen = true;
    this.currentPayload = payload;
    this.currentSentenceIndex = 0;

    this.modalEl = document.createElement('div');
    this.modalEl.className = 'dialogue-modal-backdrop';

    const box = document.createElement('div');
    box.className = 'dialogue-box-frame';

    // Header
    const header = document.createElement('div');
    header.className = 'dialogue-header-row';
    header.innerHTML = `
      <div>
        <span class="dialogue-speaker-name">${payload.speakerName}</span>
        ${payload.speakerTitle ? `<span class="dialogue-speaker-title">${payload.speakerTitle}</span>` : ''}
      </div>
      <div style="font-size: 11px; color: #94a3b8; font-weight: 600;">[Space / Click to Advance]</div>
    `;

    // Content
    const content = document.createElement('div');
    content.className = 'dialogue-content-row';

    const portrait = document.createElement('div');
    portrait.className = 'dialogue-portrait';
    portrait.innerHTML = payload.portraitIcon || '🧙‍♂️';

    const textBody = document.createElement('div');
    textBody.className = 'dialogue-text-body';
    textBody.id = 'dialogue-active-text';

    content.appendChild(portrait);
    content.appendChild(textBody);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'dialogue-actions-row';
    actions.id = 'dialogue-actions-container';

    box.appendChild(header);
    box.appendChild(content);
    box.appendChild(actions);

    box.addEventListener('click', (e) => {
      // If clicking button, let button handle it
      if ((e.target as HTMLElement).closest('.dialogue-btn')) return;
      this.advanceText();
    });

    this.modalEl.appendChild(box);
    this.container.appendChild(this.modalEl);

    this.renderCurrentSentence();
  }

  private renderCurrentSentence() {
    if (!this.currentPayload) return;
    const textEl = document.getElementById('dialogue-active-text');
    if (!textEl) return;

    this.fullText = this.currentPayload.sentences[this.currentSentenceIndex] || '';
    this.currentText = '';
    this.charIndex = 0;
    this.isTyping = true;
    if (this.typeTimer) clearInterval(this.typeTimer);

    this.updateActionButtons();

    this.typeTimer = setInterval(() => {
      if (this.charIndex < this.fullText.length) {
        this.currentText += this.fullText[this.charIndex];
        textEl.textContent = this.currentText;
        if (this.charIndex % 3 === 0) {
          audio.playDialogueBlip(380);
        }
        this.charIndex++;
      } else {
        this.isTyping = false;
        clearInterval(this.typeTimer);
        this.updateActionButtons();
      }
    }, 22);
  }

  public advanceText() {
    if (!this.currentPayload) return;

    if (this.isTyping) {
      // Skip typing to end of sentence
      this.isTyping = false;
      if (this.typeTimer) clearInterval(this.typeTimer);
      const textEl = document.getElementById('dialogue-active-text');
      if (textEl) textEl.textContent = this.fullText;
      this.updateActionButtons();
      return;
    }

    // Advance to next sentence if available
    if (this.currentSentenceIndex < this.currentPayload.sentences.length - 1) {
      this.currentSentenceIndex++;
      this.renderCurrentSentence();
    } else {
      // At last sentence: if no custom options, close
      if (!this.currentPayload.options || this.currentPayload.options.length === 0) {
        this.close();
        if (this.currentPayload.onComplete) this.currentPayload.onComplete();
      }
    }
  }

  private updateActionButtons() {
    const actionsEl = document.getElementById('dialogue-actions-container');
    if (!actionsEl || !this.currentPayload) return;
    actionsEl.innerHTML = '';

    const isLastSentence = this.currentSentenceIndex >= this.currentPayload.sentences.length - 1;

    if (!isLastSentence) {
      const nextBtn = document.createElement('button');
      nextBtn.className = 'dialogue-btn';
      nextBtn.innerHTML = 'Next ⏩';
      nextBtn.onclick = () => this.advanceText();
      actionsEl.appendChild(nextBtn);
      return;
    }

    // If options present on last sentence
    if (this.currentPayload.options && this.currentPayload.options.length > 0) {
      this.currentPayload.options.forEach((opt) => {
        const btn = document.createElement('button');
        let btnClass = 'dialogue-btn';
        if (opt.type === 'accept_quest') btnClass += ' dialogue-btn-quest';
        if (opt.type === 'turn_in_quest') btnClass += ' dialogue-btn-turnin';
        btn.className = btnClass;
        btn.innerHTML = `${opt.icon || ''} ${opt.label}`;
        btn.onclick = () => {
          if (opt.onSelect) opt.onSelect();
          if (opt.type === 'close') this.close();
        };
        actionsEl.appendChild(btn);
      });
    } else {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'dialogue-btn';
      closeBtn.innerHTML = 'Close ✕';
      closeBtn.onclick = () => {
        this.close();
        if (this.currentPayload?.onComplete) this.currentPayload.onComplete();
      };
      actionsEl.appendChild(closeBtn);
    }
  }

  public close() {
    if (this.typeTimer) clearInterval(this.typeTimer);
    if (this.modalEl && this.modalEl.parentNode) {
      this.modalEl.parentNode.removeChild(this.modalEl);
    }
    this.modalEl = null;
    this.isOpen = false;
    this.currentPayload = null;
  }

  /**
   * Play Cinematic Story Prologue
   */
  public playPrologue(onFinish: () => void) {
    const slides = [
      {
        title: "PROLOGUE: THE SHATTERED RUNES",
        body: "For ten thousand years, the Kingdom of Aethelgard flourished under the protection of the Five Primordial Runes: Verdant, Shadow, Flame, Frost, and Void."
      },
      {
        title: "THE AWAKENING OF NIGHTBORNE",
        body: "When the celestial alignment fractured, the Void Overlord NightBorne awakened from the Nether Rift. His dark sorcery shattered the seals, scattering the runes into dangerous subterranean catacombs."
      },
      {
        title: "THE HAVEN OF ELDERMOOR",
        body: "Monsters have overrun the realms, yet one sanctuary remains: The Haven of Eldermoor. You have been chosen by prophecy to restore the sacred runes and banish the darkness forever!"
      }
    ];

    let currentSlide = 0;
    const overlay = document.createElement('div');
    overlay.className = 'prologue-overlay';

    const scroll = document.createElement('div');
    scroll.className = 'prologue-scroll';

    const titleEl = document.createElement('h2');
    titleEl.className = 'prologue-title';

    const bodyEl = document.createElement('p');
    bodyEl.className = 'prologue-body';

    const btnRow = document.createElement('div');
    btnRow.className = 'prologue-btn-row';

    const nextBtn = document.createElement('button');
    nextBtn.className = 'dialogue-btn dialogue-btn-quest';
    nextBtn.style.padding = '10px 24px';
    nextBtn.style.fontSize = '14px';
    nextBtn.textContent = 'Continue ➔';

    const skipBtn = document.createElement('button');
    skipBtn.className = 'dialogue-btn';
    skipBtn.style.padding = '10px 20px';
    skipBtn.textContent = 'Skip Intro';

    btnRow.appendChild(skipBtn);
    btnRow.appendChild(nextBtn);

    scroll.appendChild(titleEl);
    scroll.appendChild(bodyEl);
    scroll.appendChild(btnRow);
    overlay.appendChild(scroll);
    this.container.appendChild(overlay);

    const updateSlide = () => {
      audio.playPageTurn();
      titleEl.textContent = slides[currentSlide].title;
      bodyEl.textContent = slides[currentSlide].body;
      if (currentSlide === slides.length - 1) {
        nextBtn.textContent = 'Enter Eldermoor ⚔️';
      }
    };

    nextBtn.onclick = () => {
      if (currentSlide < slides.length - 1) {
        currentSlide++;
        updateSlide();
      } else {
        finish();
      }
    };

    skipBtn.onclick = () => finish();

    const finish = () => {
      audio.playQuestAccept();
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      onFinish();
    };

    updateSlide();
  }

  /**
   * Display Boss Announcement Banner
   */
  public showBossBanner(bossName: string, bossTitle: string) {
    const banner = document.createElement('div');
    banner.className = 'boss-intro-banner';
    banner.innerHTML = `
      <div style="font-size: 13px; letter-spacing: 3px; font-weight: 800; color: #fef08a; text-transform: uppercase;">⚠️ WARNING: BOSS APPROACHING ⚠️</div>
      <div style="font-size: 24px; font-weight: 900; letter-spacing: 2px; color: #ffffff; text-shadow: 0 0 15px rgba(255, 50, 50, 0.9); margin-top: 4px;">${bossName}</div>
      <div style="font-size: 13px; color: #fca5a5; font-style: italic; margin-top: 2px;">"${bossTitle}"</div>
    `;
    this.container.appendChild(banner);
    audio.playSlash('heavy', 0.6);

    setTimeout(() => {
      if (banner.parentNode) banner.parentNode.removeChild(banner);
    }, 3600);
  }
}
