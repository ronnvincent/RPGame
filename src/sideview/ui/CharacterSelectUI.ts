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
        
        /* Base Reset & Variables */
        #char-select-screen {
          position: fixed;
          inset: 0;
          color: #f8fafc;
          font-family: 'Outfit', sans-serif;
          z-index: 1000;
          background: #000;
          user-select: none;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 10px;
          box-sizing: border-box;
        }

        #bg-canvas {
          position: fixed;
          inset: 0;
          width: 100%;
          height: 100%;
          z-index: 0;
          pointer-events: none;
          image-rendering: pixelated;
          filter: blur(8px) brightness(0.5) hue-rotate(30deg);
          transform: scale(1.1);
        }
        
        .main-layout {
          position: relative;
          z-index: 2;
          width: 100%;
          height: 100%;
          max-width: 1400px;
          max-height: 900px;
          display: grid;
          grid-template-columns: 120px 1fr 380px;
          gap: 20px;
          border: 2px solid rgba(212, 175, 55, 0.4);
          background: rgba(10, 5, 15, 0.6);
          backdrop-filter: blur(12px);
          border-radius: 16px;
          padding: 20px;
          box-shadow: inset 0 0 50px rgba(0,0,0,0.8), 0 20px 50px rgba(0,0,0,0.8);
          box-sizing: border-box;
        }

        /* LEFT PANEL: Roster */
        .roster-panel {
          display: flex;
          flex-direction: column;
          gap: 10px;
          overflow-y: auto;
          overflow-x: hidden;
          padding-right: 5px;
          scrollbar-width: none;
          mask-image: linear-gradient(to bottom, black 90%, transparent 100%);
        }
        .roster-panel::-webkit-scrollbar { display: none; }

        .class-card {
          flex: 0 0 auto;
          background: rgba(20, 15, 30, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 10px 5px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5);
          position: relative;
        }

        .class-card:hover {
          transform: translateX(5px);
          border-color: rgba(212, 175, 55, 0.6);
          background: rgba(40, 25, 60, 0.8);
        }

        .class-card.active {
          border-color: #ffd700;
          background: linear-gradient(135deg, rgba(70, 40, 100, 0.9) 0%, rgba(20, 10, 30, 0.9) 100%);
          box-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
          transform: translateX(10px);
        }
        
        .class-card.active::before {
          content: ''; position: absolute; left: -5px; top: 50%; transform: translateY(-50%);
          width: 4px; height: 60%; background: #ffd700; border-radius: 4px;
          box-shadow: 0 0 10px #ffd700;
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
          font-size: 9px;
          font-weight: 800;
          padding: 2px 4px;
          border-radius: 4px;
          margin-top: 2px;
          text-transform: uppercase;
          border: 1px solid rgba(255, 255, 255, 0.15);
        }

        /* CENTER PANEL: Hero Showcase */
        .showcase-panel {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          position: relative;
          background: radial-gradient(circle at center, rgba(30, 20, 50, 0.4) 0%, transparent 70%);
          border-radius: 16px;
          padding: 20px;
        }
        
        .title-banner {
          position: absolute;
          top: 0;
          width: 100%;
          text-align: center;
          padding: 10px 0;
        }
        
        .select-title {
          font-family: 'Cinzel', serif;
          font-size: clamp(24px, 3vw, 36px);
          font-weight: 900;
          color: #ffeba1;
          text-shadow: 0 0 20px rgba(255, 215, 0, 0.8), 2px 2px 0px #4a3000;
          margin: 0;
          letter-spacing: 4px;
        }

        .hero-platform {
          position: relative;
          width: 160px;
          height: 160px;
          margin-top: 60px;
          background: rgba(0, 0, 0, 0.5);
          border: 2px solid rgba(212, 175, 55, 0.6);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 40px rgba(212, 175, 55, 0.3);
        }

        #hero-showcase-canvas { 
          width: 180px; 
          height: 180px; 
          image-rendering: pixelated; 
          cursor: pointer;
          transition: transform 0.1s;
        }
        #hero-showcase-canvas:active { transform: scale(0.95); }

        .hero-name-plate {
          text-align: center;
          margin-top: 20px;
        }

        .hero-name-plate h2 {
          font-family: 'Cinzel', serif;
          font-size: 42px;
          margin: 0;
          text-shadow: 0 4px 10px rgba(0, 0, 0, 0.9);
        }

        .hero-name-plate h3 {
          font-family: 'Outfit', sans-serif;
          font-size: 14px;
          margin: 5px 0 0 0;
          letter-spacing: 4px;
          text-transform: uppercase;
        }

        .lore-box {
          font-style: italic;
          color: #cbd5e1;
          font-size: 13px;
          line-height: 1.5;
          text-align: center;
          margin-top: 20px;
          max-width: 80%;
          text-shadow: 0 1px 3px #000;
        }
        
        .enter-btn-wrap {
          margin-top: auto;
          width: 100%;
          display: flex;
          justify-content: center;
          padding-top: 20px;
        }

        .enter-btn {
          background: url('/assets/gui/PNG/buttonLong_brown.png') center/100% 100%;
          color: #fff;
          font-family: 'Cinzel', serif;
          font-weight: 900;
          font-size: 22px;
          padding: 18px 50px;
          border: none;
          cursor: pointer;
          transition: all 0.2s;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
          letter-spacing: 2px;
          filter: drop-shadow(0 10px 20px rgba(0, 0, 0, 0.8));
        }

        .enter-btn:hover {
          filter: drop-shadow(0 0 20px rgba(255, 215, 0, 0.8)) brightness(1.2);
          transform: translateY(-2px);
        }
        .enter-btn:active {
          background: url('/assets/gui/PNG/buttonLong_brown_pressed.png') center/100% 100%;
          transform: translateY(2px);
        }

        /* RIGHT PANEL: Stats & Skills */
        .info-panel {
          display: flex;
          flex-direction: column;
          gap: 15px;
          background: rgba(0, 0, 0, 0.4);
          border-radius: 12px;
          padding: 15px;
          border: 1px solid rgba(255,255,255,0.05);
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: #d4af37 transparent;
        }

        .stats-box {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          background: rgba(20, 15, 30, 0.8);
          padding: 15px;
          border-radius: 10px;
          border: 1px solid rgba(212, 175, 55, 0.3);
          flex-shrink: 0;
        }

        .stat-row {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          letter-spacing: 1px;
          text-transform: uppercase;
          color: #94a3b8;
          align-items: center;
        }

        .stat-row span:last-child {
          font-family: 'Teko', sans-serif;
          font-size: 16px;
          font-weight: 600;
        }

        .skills-header {
          font-family: 'Cinzel', serif;
          color: #d4af37;
          font-size: 16px;
          letter-spacing: 2px;
          margin-top: 5px;
          border-bottom: 1px solid rgba(212, 175, 55, 0.3);
          padding-bottom: 5px;
          flex-shrink: 0;
        }

        .skills-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .skill-item {
          background: rgba(30, 20, 40, 0.7);
          border-radius: 8px;
          padding: 10px;
          display: flex;
          gap: 12px;
          align-items: center;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .skill-icon-wrap {
          width: 44px;
          height: 44px;
          background: url('/assets/gui/PNG/buttonSquare_brown.png') center/100% 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          position: relative;
        }
        
        .skill-icon-wrap img { width: 26px; height: 26px; image-rendering: pixelated; }
        
        .skill-key {
          position: absolute;
          bottom: -4px;
          right: -4px;
          background: #d4af37;
          color: #000;
          font-weight: 900;
          font-size: 10px;
          padding: 1px 5px;
          border-radius: 4px;
        }

        .skill-info { flex: 1; }

        .skill-name {
          font-family: 'Outfit', sans-serif;
          font-weight: 800;
          font-size: 14px;
          margin-bottom: 3px;
          display: flex;
          justify-content: space-between;
        }

        .skill-cd { color: #38bdf8; font-size: 11px; }

        .skill-desc { color: #94a3b8; font-size: 11px; line-height: 1.4; }

        /* PORTRAIT / EXTREME MOBILE RESPONSIVENESS */
        @media (max-width: 950px) {
          .main-layout {
            grid-template-columns: 1fr;
            grid-template-rows: auto auto 1fr;
            overflow-y: auto;
            overflow-x: hidden;
            padding: 10px;
            gap: 15px;
            height: auto;
            max-height: 100vh;
          }
          
          .roster-panel {
            flex-direction: row;
            overflow-x: auto;
            overflow-y: hidden;
            padding-bottom: 5px;
            mask-image: none;
          }
          .class-card { flex: 0 0 80px; }
          .class-card.active { transform: translateY(-5px); }
          .class-card.active::before {
            top: auto; bottom: -5px; left: 50%; transform: translateX(-50%);
            width: 60%; height: 4px;
          }
          
          .showcase-panel { padding: 10px; }
          .title-banner { position: relative; margin-bottom: 10px; }
          .hero-platform { margin-top: 10px; width: 120px; height: 120px; }
          #hero-showcase-canvas { width: 140px; height: 140px; }
          
          .info-panel { overflow: visible; }
          
          .enter-btn-wrap {
            position: sticky;
            bottom: 0;
            background: linear-gradient(0deg, #000 30%, transparent 100%);
            padding: 20px 0 10px 0;
            z-index: 100;
          }
        }
      </style>

      <canvas id="bg-canvas"></canvas>
      <div class="main-layout">
        
        <div style="position: absolute; right: 10px; top: 10px; z-index: 100;">
          <button id="char-select-fs-btn" style="background: url('/assets/gui/PNG/buttonSquare_brown.png') center/100% 100%; border: none; padding: 10px; color: #fff; cursor: pointer; font-family: 'Outfit'; font-weight: bold; font-size: 10px;">[ ] FS</button>
        </div>

        <!-- LEFT PANEL: ROSTER -->
        <div class="roster-panel" id="classes-carousel">
          ${CHARACTER_CLASSES.map(c => `
            <div class="class-card ${c.id === this.selectedClass.id ? 'active' : ''}" data-class-id="${c.id}">
              <canvas class="card-sprite-canvas" data-class="${c.id}" width="64" height="64"></canvas>
              <div class="class-card-name">${c.name}</div>
              <div class="class-card-role" style="color:${c.themeColor}; border-color:${c.themeColor}">${c.role}</div>
            </div>
          `).join('')}
        </div>

        <!-- CENTER PANEL: SHOWCASE -->
        <div class="showcase-panel">
          <div class="title-banner">
            <h1 class="select-title">CHOOSE YOUR CHAMPION</h1>
          </div>
          
          <div class="hero-platform">
            <canvas id="hero-showcase-canvas" width="128" height="128"></canvas>
          </div>
          
          <div class="hero-name-plate">
            <h2 style="color: ${this.selectedClass.accentColor}">${this.selectedClass.name}</h2>
            <h3 style="color: ${this.selectedClass.themeColor}">${this.selectedClass.title}</h3>
          </div>
          
          <div class="lore-box">${this.selectedClass.description}</div>
          
          <div class="enter-btn-wrap">
            <button class="enter-btn" id="start-game-btn">ENTER BATTLE</button>
          </div>
        </div>

        <!-- RIGHT PANEL: INFO -->
        <div class="info-panel" id="class-detail">
          <div class="stats-box">
            <div class="stat-row"><span>HP:</span><span style="color:#ef4444">${this.selectedClass.stats.maxHp}</span></div>
            <div class="stat-row"><span>Energy:</span><span style="color:#3b82f6">Infinite</span></div>
            <div class="stat-row"><span>ATK:</span><span style="color:#f97316">${this.selectedClass.stats.atk}</span></div>
            <div class="stat-row"><span>DEF:</span><span style="color:#c084fc">${this.selectedClass.stats.def}</span></div>
            <div class="stat-row"><span>CRIT:</span><span style="color:#ffd700">${Math.round(this.selectedClass.stats.critChance * 100)}%</span></div>
            <div class="stat-row"><span>SPD:</span><span style="color:#2dd4bf">${this.selectedClass.stats.speed}</span></div>
          </div>
          
          <div class="skills-header">UNIQUE SKILLS</div>
          <div class="skills-list">
            ${this.selectedClass.skills.map((s, idx) => `
              <div class="skill-item">
                <div class="skill-icon-wrap">
                  <img src="${this.getSkillIcon(s, this.selectedClass.id, idx)}" />
                  <span class="skill-key">${s.key}</span>
                </div>
                <div class="skill-info">
                  <div class="skill-name">
                    <span style="color: ${s.isUltimate ? '#ffd700' : '#f8fafc'}">${s.name} ${s.isUltimate ? '★' : ''}</span>
                    <span class="skill-cd">CD: ${s.cooldown}s</span>
                  </div>
                  <div class="skill-desc">${s.description}</div>
                </div>
              </div>
            `).join('')}
          </div>
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
