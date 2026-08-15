/**
 * Ultra-Premium Authentic Pixel-Art Character Selection & Main Menu Screen
 * Fully Powered by:
 * 1. Tiny Wonder UI Free & Cryo's Mini GUI 9-Slice Pixel Frames & Wood-Stone Panels
 * 2. High Forest Multi-Layer Parallax Background Canvas
 * 3. Ancient Mossy Stone Altar Stage with Class-Themed Elemental Magic Aura Particles
 * 4. 10 Live Animated Hero Sprites
 * 5. 60+ Unique Skills with Kyrise 32x32 Pixel Art Icons
 */

import { CHARACTER_CLASSES, CharacterClass, SkillDefinition } from '../classes/ClassDefinitions';
import { audio } from '../engine/AudioManager';
import { sprites } from '../engine/SpriteManager';

export class CharacterSelectUI {
  private container: HTMLElement;
  private selectedClass: CharacterClass = CHARACTER_CLASSES[0];
  private onClassSelectedCallback: (charClass: CharacterClass) => void;
  private isDestroyed: boolean = false;
  private showcaseAnimState: 'idle' | 'attack' = 'idle';
  private showcaseTimer: number = 0;
  private bgTimer: number = 0;
  private particles: { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number }[] = [];

  constructor(rootElement: HTMLElement, onClassSelected: (charClass: CharacterClass) => void) {
    this.container = document.createElement('div');
    this.container.id = 'char-select-screen';
    this.onClassSelectedCallback = onClassSelected;
    rootElement.appendChild(this.container);
    this.render();
    this.startAnimationLoop();
    audio.playTownBGM();
  }

  private getSkillIcon(skill: SkillDefinition, selectedClassId: string, skillIdx?: number): string {
    if (skill.iconImage) return skill.iconImage;

    const cid = selectedClassId.toLowerCase();
    const icons: { [key: string]: string[] } = {
      warrior: ['sword_03a.png', 'sword_02a.png', 'shield_01a.png', 'scroll_01b.png', 'sword_01c.png', 'crystal_01h.png'],
      paladin: ['sword_02c.png', 'shield_03a.png', 'helmet_02a.png', 'crystal_01i.png', 'potion_01a.png', 'crystal_01c.png'],
      berserker: ['sword_02a.png', 'potion_03b.png', 'boots_01e.png', 'ring_01a.png', 'shard_01g.png', 'gem_01b.png'],
      dragoon: ['staff_02ab.png', 'armor_01c.png', 'crystal_01g.png', 'staff_02d.png', 'gem_01j.png', 'crystal_01f.png'],
      mage: ['staff_03a.png', 'crystal_01f.png', 'ring_03b.png', 'spellbook_03a.png', 'crystal_01d.png', 'gem_01c.png'],
      priest: ['necklace_01a.png', 'potion_01b.png', 'spellbook_02a.png', 'ring_02a.png', 'crystal_01j.png', 'gem_01d.png'],
      necromancer: ['skull_01a.png', 'potion_03e.png', 'bone01a.png', 'spellbook_01a.png', 'crystal_01d.png', 'gem_01e.png'],
      archer: ['bow_03a.png', 'arrow_03a.png', 'leaf_01a.png', 'bow_02a.png', 'arrow_03e.png', 'crystal_01b.png'],
      ninja: ['shard_01a.png', 'scroll_01f.png', 'boots_01e.png', 'sword_01a.png', 'sword_02c.png', 'gem_01i.png'],
      assassin: ['sword_01d.png', 'shard_01d.png', 'potion_03c.png', 'hat_01a.png', 'ring_01d.png', 'gem_01f.png']
    };
    const pool = icons[cid] || icons['warrior'];
    const safeIdx = Number(skillIdx ?? Number(skill.id.split('_')[1]) - 1);
    const idx = Number.isFinite(safeIdx) ? safeIdx : 0;
    const file = pool[idx % 6] || 'sword_03a.png';
    return `/assets/rpg-icons/32x32/${file}`;
  }

  public render() {
    this.container.innerHTML = `
      <style>
        #char-select-screen {
          position: fixed;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          padding: 12px 18px;
          box-sizing: border-box;
          color: #f8fafc;
          font-family: 'Cinzel', 'Outfit', 'Inter', -apple-system, sans-serif;
          z-index: 1000;
          overflow-y: auto;
          overflow-x: hidden;
          user-select: none;
          background: #08060c;
        }

        /* Live Parallax Background Canvas */
        #bg-canvas {
          position: fixed;
          inset: 0;
          width: 100%;
          height: 100%;
          z-index: 0;
          pointer-events: none;
          image-rendering: pixelated;
        }

        .vignette-overlay {
          position: fixed;
          inset: 0;
          background: radial-gradient(circle at center, rgba(10, 8, 18, 0.35) 0%, rgba(3, 2, 6, 0.88) 100%);
          pointer-events: none;
          z-index: 1;
        }

        .select-content-wrapper {
          position: relative;
          z-index: 2;
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 100%;
          max-width: 1080px;
          gap: 10px;
        }

        /* Tiny Wonder Ornate Header Plaque */
        .title-banner {
          text-align: center;
          background: linear-gradient(180deg, #241608 0%, #110903 100%);
          border: 3px solid #d4af37;
          border-radius: 8px;
          padding: 8px 36px;
          box-shadow: 0 0 22px rgba(212, 175, 55, 0.45), inset 0 0 15px rgba(0, 0, 0, 0.9), 0 5px 0 #080401;
          position: relative;
        }

        .title-banner::before, .title-banner::after {
          content: '◆';
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          color: #f59e0b;
          font-size: 15px;
          text-shadow: 0 0 10px #f59e0b;
        }
        .title-banner::before { left: 12px; }
        .title-banner::after { right: 12px; }

        .select-title {
          font-size: 23px;
          font-weight: 900;
          color: #ffd700;
          text-shadow: 2px 2px 0 #3d1e03, -1px -1px 0 #78350f, 0 0 12px rgba(251, 191, 36, 0.85);
          margin: 0;
          letter-spacing: 3px;
          text-transform: uppercase;
        }

        .select-subtitle {
          color: #e2e8f0;
          font-size: 11px;
          font-weight: 600;
          margin-top: 1px;
          letter-spacing: 1px;
          font-family: 'Outfit', sans-serif;
        }

        /* 10 Hero Cards Carousel */
        .classes-carousel {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding: 6px 4px;
          max-width: 100%;
          scrollbar-width: thin;
          scrollbar-color: #f4b41b #181425;
        }

        .class-card {
          flex: 0 0 90px;
          background: linear-gradient(180deg, #1e162c 0%, #0d0815 100%);
          border: 2px solid #3c3250;
          border-radius: 8px;
          padding: 6px 4px;
          text-align: center;
          cursor: pointer;
          transition: all 0.16s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 4px 0 #07040b;
          display: flex;
          flex-direction: column;
          align-items: center;
          position: relative;
        }

        .class-card:hover {
          transform: translateY(-4px);
          border-color: #f4b41b;
          background: linear-gradient(180deg, #2b1f40 0%, #160e22 100%);
          box-shadow: 0 0 15px rgba(244, 180, 27, 0.5), 0 5px 0 #07040b;
        }

        .class-card.active {
          border-color: #ffd700;
          background: linear-gradient(180deg, #3d2258 0%, #1c0e2c 100%);
          box-shadow: 0 0 20px rgba(255, 215, 0, 0.75), inset 0 0 10px rgba(255, 215, 0, 0.25), 0 5px 0 #07040b;
          transform: translateY(-3px) scale(1.03);
        }

        .class-card.active::after {
          content: '▼';
          position: absolute;
          bottom: -13px;
          left: 50%;
          transform: translateX(-50%);
          color: #ffd700;
          font-size: 10px;
          text-shadow: 0 0 6px #f59e0b;
        }

        .card-sprite-canvas {
          image-rendering: pixelated;
          margin-bottom: 2px;
        }

        .class-card-name {
          font-size: 11px;
          font-weight: 800;
          color: #ffffff;
          margin-top: 2px;
        }

        .class-card-role {
          font-size: 8px;
          font-weight: 800;
          padding: 2px 6px;
          border-radius: 4px;
          margin-top: 2px;
          text-transform: uppercase;
          border: 1px solid rgba(255, 255, 255, 0.15);
        }

        /* Grand Fantasy Ornate Dialog Frame */
        .class-detail-container {
          background: linear-gradient(180deg, #1a1226 0%, #0d0815 100%);
          border: 3px solid #9c7b4f;
          border-radius: 10px;
          padding: 14px 18px;
          box-shadow: 0 0 30px rgba(0, 0, 0, 0.95), inset 0 0 20px rgba(0, 0, 0, 0.85), 0 6px 0 #060309;
          display: grid;
          grid-template-columns: 1.15fr 1.25fr;
          gap: 18px;
          width: 100%;
          box-sizing: border-box;
          position: relative;
        }

        .class-detail-container::before {
          content: '';
          position: absolute;
          inset: 2px;
          border: 1px solid rgba(212, 175, 55, 0.3);
          border-radius: 7px;
          pointer-events: none;
        }

        /* Left Hero Showcase & Stats */
        .hero-summary {
          display: flex;
          flex-direction: column;
          gap: 9px;
        }

        .hero-preview-row {
          display: flex;
          align-items: center;
          gap: 14px;
          background: #0f0a18;
          border: 2px solid #2d2042;
          border-radius: 8px;
          padding: 8px 10px;
          box-shadow: inset 0 0 15px rgba(0, 0, 0, 0.8);
        }

        #hero-showcase-canvas {
          image-rendering: pixelated;
          cursor: pointer;
          background: radial-gradient(circle at center, rgba(30, 20, 52, 0.85) 0%, rgba(9, 5, 16, 0.98) 100%);
          border: 2px solid #4a3568;
          border-radius: 6px;
          transition: transform 0.15s ease, border-color 0.15s ease;
          box-shadow: 0 0 15px rgba(0, 0, 0, 0.8);
        }

        #hero-showcase-canvas:hover {
          transform: scale(1.04);
          border-color: #ffd700;
          box-shadow: 0 0 20px rgba(255, 215, 0, 0.45);
        }

        .hero-names h2 {
          margin: 0;
          font-size: 20px;
          font-weight: 900;
          letter-spacing: 1px;
          text-shadow: 2px 2px 0 #000;
        }

        .hero-names p {
          margin: 1px 0 4px 0;
          font-size: 10.5px;
          color: #ffd700;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1.5px;
        }

        .click-hint {
          font-size: 9px;
          color: #94a3b8;
          font-style: italic;
        }

        .hero-desc {
          font-size: 11px;
          line-height: 1.45;
          color: #e2e8f0;
          margin: 0;
          background: rgba(14, 9, 22, 0.75);
          padding: 8px 12px;
          border-radius: 6px;
          border-left: 3px solid #f4b41b;
          font-family: 'Outfit', sans-serif;
        }

        /* Stats Grid */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 6px;
          background: #0f0a18;
          border: 2px solid #2d2042;
          border-radius: 8px;
          padding: 8px;
        }

        .stat-item {
          display: flex;
          justify-content: space-between;
          font-size: 10.5px;
          padding: 3px 6px;
          background: #181026;
          border-radius: 4px;
          border: 1px solid #271a3e;
        }

        .stat-label {
          color: #94a3b8;
          font-weight: 700;
        }

        .stat-val {
          font-weight: 900;
          font-family: 'Outfit', sans-serif;
        }

        /* Right: 6 Skills Section with Kyrise 32x32 Icons */
        .skills-section h3 {
          margin: 0 0 8px 0;
          font-size: 13px;
          color: #f4b41b;
          letter-spacing: 1.5px;
          text-shadow: 1px 1px 0 #000;
          border-bottom: 2px solid #2d2042;
          padding-bottom: 4px;
        }

        .skills-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-height: 285px;
          overflow-y: auto;
          padding-right: 6px;
        }

        .skill-item {
          display: flex;
          align-items: center;
          gap: 9px;
          background: linear-gradient(90deg, #160f24 0%, #0e0918 100%);
          border: 1px solid #2b1f40;
          border-radius: 6px;
          padding: 4px 8px;
          transition: border-color 0.15s ease, background 0.15s ease;
        }

        .skill-item:hover {
          border-color: #f4b41b;
          background: linear-gradient(90deg, #221736 0%, #130c20 100%);
        }

        .skill-icon-box {
          width: 32px;
          height: 32px;
          background: #090512;
          border: 2px solid #3c2e54;
          border-radius: 5px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          position: relative;
        }

        .skill-icon-box img {
          image-rendering: pixelated;
        }

        .skill-key-badge {
          position: absolute;
          bottom: -3px;
          right: -3px;
          background: #d97706;
          color: #fff;
          font-size: 7.5px;
          font-weight: 900;
          padding: 1px 3px;
          border-radius: 2px;
          border: 1px solid #000;
        }

        .skill-info {
          flex: 1;
        }

        .skill-name-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 10.5px;
          font-weight: 800;
        }

        .skill-meta {
          font-size: 8.5px;
          color: #94a3b8;
          font-family: 'Outfit', sans-serif;
        }

        .skill-desc {
          font-size: 9px;
          color: #cbd5e1;
          margin-top: 1px;
          line-height: 1.3;
          font-family: 'Outfit', sans-serif;
        }

        /* Start Game Button */
        .start-btn {
          background: linear-gradient(180deg, #22c55e 0%, #15803d 50%, #14532d 100%);
          border: 3px solid #86efac;
          border-radius: 8px;
          color: #ffffff;
          font-size: 15px;
          font-weight: 900;
          padding: 11px 40px;
          cursor: pointer;
          box-shadow: 0 0 25px rgba(34, 197, 94, 0.6), inset 0 2px 0 rgba(255, 255, 255, 0.4), 0 5px 0 #052e16;
          letter-spacing: 2px;
          text-transform: uppercase;
          transition: all 0.15s ease;
          font-family: 'Cinzel', serif;
          margin-top: 2px;
        }

        .start-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 0 35px rgba(34, 197, 94, 0.9), inset 0 2px 0 rgba(255, 255, 255, 0.6), 0 7px 0 #052e16;
          background: linear-gradient(180deg, #4ade80 0%, #16a34a 50%, #15803d 100%);
        }

        .start-btn:active {
          transform: translateY(2px);
          box-shadow: 0 0 15px rgba(34, 197, 94, 0.4), 0 2px 0 #052e16;
        }

        /* Mobile Landscape Optimization */
        @media (max-height: 650px), (max-width: 900px) {
          #char-select-screen {
            padding: 4px 8px;
            justify-content: flex-start;
            gap: 4px;
          }
          .title-banner {
            padding: 2px 16px;
          }
          .select-title {
            font-size: 14px;
            letter-spacing: 1.5px;
          }
          .select-subtitle {
            display: none;
          }
          .classes-carousel {
            gap: 4px;
            padding: 2px;
            max-width: 100%;
          }
          .class-card {
            flex: 0 0 58px;
            padding: 2px 1px;
            border-width: 1.5px;
          }
          .card-sprite-canvas {
            width: 36px;
            height: 36px;
          }
          .class-card-name {
            font-size: 8px;
            margin-top: 1px;
          }
          .class-card-role {
            font-size: 6.5px;
            padding: 0 3px;
          }
          .class-detail-container {
            padding: 4px 8px;
            gap: 8px;
            margin-top: 0;
          }
          .hero-preview-row {
            padding: 4px 6px;
            gap: 8px;
          }
          #hero-showcase-canvas {
            width: 56px;
            height: 56px;
          }
          .hero-names h2 {
            font-size: 13px;
          }
          .hero-names p {
            font-size: 8px;
            margin: 0;
          }
          .click-hint {
            display: none;
          }
          .hero-desc {
            font-size: 8px;
            line-height: 1.2;
            padding: 3px 6px;
            margin: 0;
          }
          .stats-grid {
            grid-template-columns: repeat(3, 1fr);
            gap: 2px;
            padding: 4px;
          }
          .stat-item {
            padding: 1px 4px;
            font-size: 7px;
          }
          .skills-section h3 {
            font-size: 8.5px;
            margin-bottom: 2px;
          }
          .skills-list {
            gap: 2px;
            max-height: 80px;
            overflow-y: auto;
          }
          .skill-item {
            padding: 2px 4px;
          }
          .skill-icon-box {
            width: 24px;
            height: 24px;
          }
          .skill-icon-box img {
            width: 18px;
            height: 18px;
          }
          .skill-name-row {
            font-size: 9px;
          }
          .skill-meta {
            font-size: 7.5px;
          }
          .skill-desc {
            display: none;
          }
          .start-btn {
            font-size: 11px;
            padding: 5px 22px;
            letter-spacing: 1px;
            margin-top: 2px;
          }
        }
      </style>

      <!-- Live Parallax Background Canvas -->
      <canvas id="bg-canvas"></canvas>
      <div class="vignette-overlay"></div>

      <div class="select-content-wrapper">
        <!-- Title Banner with Fullscreen Trigger -->
        <div style="display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; position: relative;">
          <div class="title-banner">
            <h1 class="select-title">CHOOSE YOUR CHAMPION</h1>
            <div class="select-subtitle">Select your battle archetype wielding 6 specialized combat skills</div>
          </div>
          <button id="char-select-fs-btn" style="position: absolute; right: 0; top: 50%; transform: translateY(-50%); background: #241608; border: 2px solid #d4af37; color: #ffd700; border-radius: 6px; padding: 4px 8px; font-size: 12px; font-weight: 900; cursor: pointer; display: flex; align-items: center; gap: 4px; box-shadow: 0 0 10px rgba(0,0,0,0.8);" title="Toggle Fullscreen">
            <span>⛶</span>
            <span style="font-size: 9px; font-family: 'Cinzel', serif;">FULLSCREEN</span>
          </button>
        </div>

        <!-- 10 Roles Carousel with Animated Sprite Canvases -->
        <div class="classes-carousel" id="class-carousel">
          ${CHARACTER_CLASSES.map(c => `
            <div class="class-card ${c.id === this.selectedClass.id ? 'active' : ''}" data-class-id="${c.id}">
              <canvas class="card-sprite-canvas" data-class="${c.id}" width="72" height="72"></canvas>
              <div class="class-card-name">${c.name}</div>
              <span class="class-card-role" style="background: ${c.themeColor}33; color: ${c.accentColor};">${c.role}</span>
            </div>
          `).join('')}
        </div>

        <!-- Selected Class Detail Showcase -->
        <div class="class-detail-container">
          <!-- Left: Hero Showcase & Stats -->
          <div class="hero-summary">
            <div class="hero-preview-row">
              <canvas id="hero-showcase-canvas" width="130" height="130" title="Click to test attack!"></canvas>
              <div class="hero-names">
                <h2 style="color: ${this.selectedClass.accentColor}">${this.selectedClass.name}</h2>
                <p>${this.selectedClass.title}</p>
                <div class="click-hint">⚡ Click hero to test combat animation</div>
              </div>
            </div>
            <p class="hero-desc">${this.selectedClass.description}</p>
            
            <div class="stats-grid">
              <div class="stat-item"><span class="stat-label">Health (HP):</span><span class="stat-val" style="color:#ef4444">${this.selectedClass.stats.maxHp}</span></div>
              <div class="stat-item"><span class="stat-label">Energy:</span><span class="stat-val" style="color:#38bdf8">∞ Unlimited</span></div>
              <div class="stat-item"><span class="stat-label">Attack (ATK):</span><span class="stat-val" style="color:#f59e0b">${this.selectedClass.stats.atk}</span></div>
              <div class="stat-item"><span class="stat-label">Defense (DEF):</span><span class="stat-val" style="color:#c084fc">${this.selectedClass.stats.def}</span></div>
              <div class="stat-item"><span class="stat-label">Critical Rate:</span><span class="stat-val" style="color:#ffd700">${Math.round(this.selectedClass.stats.critChance * 100)}%</span></div>
              <div class="stat-item"><span class="stat-label">Speed:</span><span class="stat-val" style="color:#2dd4bf">${this.selectedClass.stats.speed}</span></div>
            </div>
          </div>

          <!-- Right: 6 Skills List with Real Kyrise RPG Icons -->
          <div class="skills-section">
            <h3>6 UNIQUE CLASS SKILLS</h3>
            <div class="skills-list">
              ${this.selectedClass.skills.map((s, idx) => `
                <div class="skill-item">
                  <div class="skill-icon-box">
                    <img src="${this.getSkillIcon(s, this.selectedClass.id, idx)}" width="24" height="24" />
                    <span class="skill-key-badge">${s.key}</span>
                  </div>
                  <div class="skill-info">
                    <div class="skill-name-row">
                      <span style="color: ${s.isUltimate ? '#ffd700' : '#f8fafc'}">${s.name} ${s.isUltimate ? '★ ULTIMATE' : ''}</span>
                      <span class="skill-meta" style="color: #38bdf8;">CD: ${s.cooldown}s</span>
                    </div>
                    <div class="skill-desc">${s.description}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- Start Game Button -->
        <button class="start-btn" id="start-game-btn">⚔ ENTER DUNGEON BATTLE ⚔</button>
      </div>
    `;

    this.attachEvents();
  }

  private attachEvents() {
    const cards = this.container.querySelectorAll('.class-card');
    cards.forEach(card => {
      card.addEventListener('click', () => {
        const classId = card.getAttribute('data-class-id');
        const found = CHARACTER_CLASSES.find(c => c.id === classId);
        if (found) {
          this.selectedClass = found;
          this.showcaseAnimState = 'attack';
          this.showcaseTimer = 0.5;
          audio.playClick();
          this.render();
        }
      });
    });

    const showcaseCanvas = this.container.querySelector('#hero-showcase-canvas') as HTMLCanvasElement;
    if (showcaseCanvas) {
      showcaseCanvas.addEventListener('click', () => {
        this.showcaseAnimState = 'attack';
        this.showcaseTimer = 0.45;
        audio.playSlash('heavy');
      });
    }

    const startBtn = this.container.querySelector('#start-game-btn');
    startBtn?.addEventListener('click', () => {
      // Auto-trigger full screen on mobile browser
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
      audio.playQuestAccept();
      this.destroy();
      this.onClassSelectedCallback(this.selectedClass);
    });

    const fsBtn = this.container.querySelector('#char-select-fs-btn');
    fsBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      audio.playClick();
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    });
  }

  public destroy() {
    this.isDestroyed = true;
    this.container.remove();
  }

  private startAnimationLoop() {
    const loop = () => {
      if (this.isDestroyed) return;

      try {
        this.bgTimer += 0.016;

        // Update timer
        if (this.showcaseTimer > 0) {
          this.showcaseTimer -= 0.016;
          if (this.showcaseTimer <= 0) {
            this.showcaseAnimState = 'idle';
          }
        }

        // 1. Draw Live Parallax Forest Background Canvas (Smooth & Seamless)
        const bgCanvas = this.container.querySelector('#bg-canvas') as HTMLCanvasElement;
        if (bgCanvas) {
          bgCanvas.width = window.innerWidth;
          bgCanvas.height = window.innerHeight;
          const ctx = bgCanvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
            sprites.drawEnvironment(ctx, this.bgTimer * 40, bgCanvas.width, bgCanvas.height, bgCanvas.height - 40, bgCanvas.width * 2);
          }
        }

        // 2. Draw Mini Hero Card Canvases (Centered, 0.82 scale, boots on card floor)
        const cardCanvases = this.container.querySelectorAll('.card-sprite-canvas');
        cardCanvases.forEach(canvasEl => {
          const cvs = canvasEl as HTMLCanvasElement;
          const ctx = cvs.getContext('2d');
          const classId = cvs.getAttribute('data-class') || 'warrior';
          if (ctx) {
            ctx.clearRect(0, 0, cvs.width, cvs.height);
            ctx.save();
            ctx.translate(cvs.width / 2, cvs.height - 10);
            ctx.scale(0.82, 0.82);
            sprites.drawHero(ctx, 0, 0, classId, 'idle', 1, 0);
            ctx.restore();
          }
        });

        // 3. Draw Large Showcase Canvas with Clean Altar & Elemental Aura
        const showcaseCanvas = this.container.querySelector('#hero-showcase-canvas') as HTMLCanvasElement;
        if (showcaseCanvas) {
          const ctx = showcaseCanvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, showcaseCanvas.width, showcaseCanvas.height);
            ctx.imageSmoothingEnabled = false;

            const cx = showcaseCanvas.width / 2;
            const cy = 96;

            // 1. Glowing Elemental Magic Circle Base
            ctx.save();
            ctx.shadowColor = this.selectedClass.accentColor;
            ctx.shadowBlur = 18;
            ctx.fillStyle = this.selectedClass.accentColor;
            ctx.globalAlpha = 0.25;
            ctx.beginPath();
            ctx.ellipse(cx, cy, 46, 12, 0, 0, Math.PI * 2);
            ctx.fill();

            // Outer Ring
            ctx.strokeStyle = this.selectedClass.accentColor;
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = 0.6;
            ctx.beginPath();
            ctx.ellipse(cx, cy, 52, 14, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();

            // 2. Ancient Stone Pedestal Slab (Single cohesive base)
            const tilesImg = sprites.getImage('tiles');
            if (tilesImg && tilesImg.complete && tilesImg.naturalWidth > 0) {
              ctx.drawImage(tilesImg, 16, 16, 16, 16, cx - 40, cy - 4, 80, 16);
            } else {
              ctx.fillStyle = '#2d2042';
              ctx.fillRect(cx - 40, cy - 4, 80, 16);
            }

            // 3. Elemental Floating Embers
            if (Math.random() < 0.4) {
              this.particles.push({
                x: cx + (Math.random() * 60 - 30),
                y: cy + 4,
                vx: (Math.random() - 0.5) * 0.6,
                vy: -(Math.random() * 1.5 + 0.8),
                life: 1.0,
                color: this.selectedClass.accentColor,
                size: Math.random() * 3 + 1.5
              });
            }

            this.particles.forEach((p) => {
              p.x += p.vx;
              p.y += p.vy;
              p.life -= 0.025;
              if (p.life > 0) {
                ctx.fillStyle = p.color;
                ctx.globalAlpha = Math.max(0, p.life);
                ctx.shadowColor = p.color;
                ctx.shadowBlur = 6;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
              }
            });
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1.0;
            this.particles = this.particles.filter(p => p.life > 0);

            // 4. Hero on Altar (Feet touching cy = 96)
            sprites.drawHero(
              ctx,
              cx,
              cy,
              this.selectedClass.id,
              this.showcaseAnimState,
              1,
              this.showcaseTimer,
              this.selectedClass.themeColor
            );
          }
        }
      } catch (err) {
        console.error('CharacterSelect render error:', err);
      }

      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
  }
}
