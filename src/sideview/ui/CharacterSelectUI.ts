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
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700;900&family=Outfit:wght@400;600;800&family=Teko:wght@400;600&display=swap');
        
        #char-select-screen {
          position: fixed;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 2vh 4vw;
          box-sizing: border-box;
          color: #f8fafc;
          font-family: 'Outfit', sans-serif;
          z-index: 1000;
          background: #000;
        }

        #bg-canvas {
          position: fixed;
          inset: 0;
          width: 100%;
          height: 100%;
          z-index: 0;
          pointer-events: none;
          image-rendering: pixelated;
          filter: blur(8px) brightness(0.6) hue-rotate(30deg);
          transform: scale(1.1);
        }

        .select-content-wrapper {
          position: relative;
          z-index: 2;
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 100%;
          height: 100%;
          max-width: 1200px;
          gap: 1.5vh;
        }

        .title-banner {
          text-align: center;
          background: rgba(10, 5, 15, 0.7);
          backdrop-filter: blur(12px);
          border-top: 2px solid rgba(212, 175, 55, 0.8);
          border-bottom: 2px solid rgba(212, 175, 55, 0.8);
          padding: 8px 40px;
          box-shadow: 0 0 40px rgba(212, 175, 55, 0.2), inset 0 0 20px rgba(0, 0, 0, 0.8);
          position: relative;
          overflow: hidden;
          width: 100%;
          max-width: 800px;
          flex-shrink: 0;
        }

        .select-title {
          font-family: 'Cinzel', serif;
          font-size: clamp(20px, 4vw, 32px);
          font-weight: 900;
          color: #ffeba1;
          text-shadow: 0 0 15px rgba(255, 215, 0, 0.6), 2px 2px 0px #4a3000;
          margin: 0;
          letter-spacing: 4px;
        }

        .classes-carousel {
          display: flex;
          gap: 12px;
          padding: 10px 15px;
          max-width: 100%;
          overflow-x: auto;
          scrollbar-width: none;
          flex-shrink: 0;
        }

        .classes-carousel::-webkit-scrollbar { display: none; }

        .class-card {
          flex: 0 0 90px;
          background: rgba(20, 15, 30, 0.6);
          backdrop-filter: blur(6px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 8px 4px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 8px 15px rgba(0, 0, 0, 0.5);
          position: relative;
        }

        .class-card:hover {
          transform: translateY(-5px);
          border-color: rgba(212, 175, 55, 0.6);
          background: rgba(40, 25, 60, 0.8);
        }

        .class-card.active {
          border-color: #ffd700;
          background: linear-gradient(180deg, rgba(70, 40, 100, 0.9) 0%, rgba(20, 10, 30, 0.9) 100%);
          box-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
          transform: translateY(-3px) scale(1.05);
        }

        .card-sprite-canvas {
          image-rendering: pixelated;
          width: 56px;
          height: 56px;
        }

        .class-card-name {
          font-family: 'Teko', sans-serif;
          font-size: 16px;
          letter-spacing: 1px;
          color: #fff;
          margin-top: 2px;
        }

        .class-card-role {
          font-size: 8px;
          font-weight: 800;
          padding: 2px 4px;
          border-radius: 4px;
          margin-top: 2px;
          text-transform: uppercase;
          border: 1px solid rgba(255, 255, 255, 0.15);
        }

        .class-detail-container {
          background: rgba(10, 5, 15, 0.85);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(212, 175, 55, 0.3);
          border-radius: 12px;
          padding: 15px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.8);
          display: grid;
          grid-template-columns: 1fr 1.2fr;
          gap: 20px;
          width: 100%;
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }

        .left-col {
          display: flex;
          flex-direction: column;
          gap: 12px;
          overflow-y: auto;
          scrollbar-width: none;
        }

        .char-presentation {
          border-image: url('/assets/gui/PNG/panel_brown.png') 30 stretch;
          border-style: solid;
          border-width: 10px;
          padding: 8px;
          display: flex;
          align-items: center;
          gap: 15px;
          box-shadow: 0 8px 15px rgba(0, 0, 0, 0.5);
        }

        .char-display-box {
          position: relative;
          width: 60px;
          height: 60px;
          background: rgba(0, 0, 0, 0.6);
          border: 2px solid rgba(212, 175, 55, 0.6);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        #hero-showcase-canvas { width: 96px; height: 96px; }

        .char-info-text h2 {
          font-family: 'Cinzel', serif;
          margin: 0;
          font-size: clamp(20px, 3vw, 24px);
          color: #ffd700;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
        }

        .char-info-text .char-title {
          font-family: 'Outfit', sans-serif;
          color: #ffeba1;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .lore-box {
          font-style: italic;
          color: #cbd5e1;
          font-size: 12px;
          line-height: 1.4;
          border-left: 2px solid #d4af37;
          padding-left: 10px;
          background: linear-gradient(90deg, rgba(212, 175, 55, 0.1), transparent);
          padding-top: 8px;
          padding-bottom: 8px;
        }

        .stats-box {
          background: rgba(0, 0, 0, 0.5);
          border-radius: 8px;
          padding: 10px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .stat-row {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          letter-spacing: 1px;
          text-transform: uppercase;
          color: #94a3b8;
          align-items: center;
        }

        .stat-row span:last-child {
          color: #fff;
          font-family: 'Teko', sans-serif;
          font-size: 15px;
          font-weight: 600;
        }

        .skills-section {
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .skills-header {
          font-family: 'Cinzel', serif;
          color: #d4af37;
          font-size: 16px;
          letter-spacing: 2px;
          margin-bottom: 8px;
          border-bottom: 1px solid rgba(212, 175, 55, 0.3);
          padding-bottom: 4px;
          flex-shrink: 0;
        }

        .skills-list {
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding-right: 5px;
          flex: 1;
        }
        
        .skills-list::-webkit-scrollbar { width: 6px; }
        .skills-list::-webkit-scrollbar-thumb { background: #d4af37; border-radius: 3px; }
        .skills-list::-webkit-scrollbar-track { background: rgba(0,0,0,0.3); }

        .skill-item {
          background: rgba(20, 15, 30, 0.8);
          border-radius: 6px;
          padding: 8px;
          display: flex;
          gap: 12px;
          align-items: center;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .skill-icon-wrap {
          width: 40px;
          height: 40px;
          background: url('/assets/gui/PNG/buttonSquare_brown.png') center/100% 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          position: relative;
        }
        
        .skill-icon-wrap img { width: 24px; height: 24px; image-rendering: pixelated; }
        
        .skill-key {
          position: absolute;
          bottom: -4px;
          right: -4px;
          background: #d4af37;
          color: #000;
          font-weight: 900;
          font-size: 9px;
          padding: 1px 4px;
          border-radius: 3px;
        }

        .skill-info { flex: 1; }

        .skill-name {
          font-family: 'Outfit', sans-serif;
          font-weight: 800;
          font-size: 13px;
          margin-bottom: 2px;
          display: flex;
          justify-content: space-between;
        }

        .skill-cd { color: #38bdf8; font-size: 11px; }

        .skill-desc { color: #94a3b8; font-size: 11px; line-height: 1.3; }

        .enter-btn-wrap {
          margin-top: 5px;
          text-align: center;
          flex-shrink: 0;
          width: 100%;
          display: flex;
          justify-content: center;
        }

        .enter-btn {
          background: url('/assets/gui/PNG/buttonLong_brown.png') center/100% 100%;
          color: #fff;
          font-family: 'Cinzel', serif;
          font-weight: 900;
          font-size: clamp(16px, 3vw, 22px);
          padding: 15px 40px;
          border: none;
          cursor: pointer;
          transition: all 0.2s;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
          letter-spacing: 2px;
          filter: drop-shadow(0 5px 15px rgba(0, 0, 0, 0.8));
          width: 100%;
          max-width: 400px;
        }

        .enter-btn:hover {
          filter: drop-shadow(0 0 20px rgba(255, 215, 0, 0.6)) brightness(1.2);
          transform: translateY(-2px);
        }
        
        .enter-btn:active {
          background: url('/assets/gui/PNG/buttonLong_brown_pressed.png') center/100% 100%;
          transform: translateY(2px);
        }

        #char-select-fs-btn {
          background: url('/assets/gui/PNG/buttonSquare_brown.png') center/100% 100%;
          border: none; padding: 10px 15px; color: #fff; cursor: pointer;
          font-weight: bold; font-family: 'Outfit'; font-size: 10px;
        }

        /* Mobile & Small Screen Optimization */
        @media (max-width: 900px), (max-height: 700px) {
          #char-select-screen { padding: 10px; }
          .class-detail-container {
            grid-template-columns: 1fr;
            overflow-y: auto;
            gap: 15px;
            padding: 12px;
          }
          .skills-list { overflow: visible; }
          .skills-section { overflow: visible; }
          .left-col { overflow: visible; }
          .char-presentation { border-width: 6px; }
          .enter-btn-wrap {
            position: sticky;
            bottom: 0;
            background: linear-gradient(0deg, rgba(0,0,0,0.9) 0%, transparent 100%);
            padding-top: 20px;
            padding-bottom: 10px;
          }
          .stats-box { grid-template-columns: 1fr 1fr 1fr; }
        }
        @media (max-width: 500px) {
          .stats-box { grid-template-columns: 1fr 1fr; }
          .class-card { flex: 0 0 75px; }
          .card-sprite-canvas { width: 48px; height: 48px; }
        }
      </style>

      <canvas id="bg-canvas"></canvas>
      <div class="select-content-wrapper">
        
        <div style="position: absolute; right: 0; top: 0; z-index: 100;">
          <button id="char-select-fs-btn">FULLSCREEN</button>
        </div>

        <div class="title-banner">
          <h1 class="select-title">CHOOSE YOUR CHAMPION</h1>
        </div>
        
        <div class="classes-carousel" id="classes-carousel">
          ${CHARACTER_CLASSES.map(c => `
            <div class="class-card ${c.id === this.selectedClass.id ? 'active' : ''}" data-class-id="${c.id}">
              <canvas class="card-sprite-canvas" data-class="${c.id}" width="64" height="64"></canvas>
              <div class="class-card-name">${c.name}</div>
              <div class="class-card-role" style="color:${c.themeColor}; border-color:${c.themeColor}">${c.role}</div>
            </div>
          `).join('')}
        </div>

        <div class="class-detail-container" id="class-detail">
          <div class="left-col">
            <div class="char-presentation">
              <div class="char-display-box">
                <canvas id="hero-showcase-canvas" width="128" height="128"></canvas>
              </div>
              <div class="char-info-text">
                <h2 style="color: ${this.selectedClass.accentColor}">${this.selectedClass.name}</h2>
                <div class="char-title" style="color: ${this.selectedClass.themeColor}">${this.selectedClass.title}</div>
              </div>
            </div>
            <div class="lore-box">
              ${this.selectedClass.description}
            </div>
            <div class="stats-box">
              <div class="stat-row"><span>Health (HP):</span><span style="color:#ef4444">${this.selectedClass.stats.maxHp}</span></div>
              <div class="stat-row"><span>Energy:</span><span style="color:#3b82f6">Unlimited</span></div>
              <div class="stat-row"><span>Attack (ATK):</span><span style="color:#f97316">${this.selectedClass.stats.atk}</span></div>
              <div class="stat-row"><span>Defense (DEF):</span><span style="color:#c084fc">${this.selectedClass.stats.def}</span></div>
              <div class="stat-row"><span>Critical:</span><span style="color:#ffd700">${Math.round(this.selectedClass.stats.critChance * 100)}%</span></div>
              <div class="stat-row"><span>Speed:</span><span style="color:#2dd4bf">${this.selectedClass.stats.speed}</span></div>
            </div>
          </div>
          
          <div class="skills-section">
            <div class="skills-header">6 UNIQUE CLASS SKILLS</div>
            <div class="skills-list">
              ${this.selectedClass.skills.map((s, idx) => `
                <div class="skill-item">
                  <div class="skill-icon-wrap">
                    <img src="${this.getSkillIcon(s, this.selectedClass.id, idx)}" />
                    <span class="skill-key">${s.key}</span>
                  </div>
                  <div class="skill-info">
                    <div class="skill-name">
                      <span style="color: ${s.isUltimate ? '#ffd700' : '#f8fafc'}">${s.name} ${s.isUltimate ? '★ ULTIMATE' : ''}</span>
                      <span class="skill-cd">CD: ${s.cooldown}s</span>
                    </div>
                    <div class="skill-desc">${s.description}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="enter-btn-wrap">
          <button class="enter-btn" id="start-game-btn">ENTER DUNGEON BATTLE</button>
        </div>
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
