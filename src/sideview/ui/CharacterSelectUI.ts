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
          z-index: 1000;
          background: #000;
          color: #f8fafc;
          font-family: 'Outfit', sans-serif;
          user-select: none;
          -webkit-user-select: none;
          -webkit-touch-callout: none;
          overflow: hidden;
        }

        #bg-canvas {
          position: fixed;
          inset: 0;
          width: 100%;
          height: 100%;
          z-index: 0;
          pointer-events: none;
          image-rendering: pixelated;
          filter: blur(4px) brightness(0.5);
          transform: scale(1.1);
        }
        
        .main-layout {
          position: absolute;
          inset: max(10px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) max(10px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left));
          z-index: 2;
          display: flex;
          gap: 20px;
        }

        /* Mobile / Portrait Mode */
        @media (max-width: 800px), (orientation: portrait) {
          .main-layout {
            flex-direction: column;
            gap: 10px;
          }
          .showcase-area {
            height: 40vh !important;
            flex: none !important;
          }
          .details-area {
            flex: 1;
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch;
          }
        }

        .showcase-area {
          flex: 1;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          border-image: url('/assets/kenney-rpg-ui/panel_brown.png') 16 fill;
          border-style: solid;
          border-width: 16px;
          image-rendering: pixelated;
          box-shadow: 0 10px 20px rgba(0,0,0,0.8);
        }

        #hero-showcase-canvas {
          width: 100%;
          height: 100%;
          image-rendering: pixelated;
          cursor: pointer;
          filter: drop-shadow(0 15px 20px rgba(0,0,0,0.8));
          z-index: 2;
        }

        .cycle-btn {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 50px;
          height: 50px;
          border-image: url('/assets/kenney-rpg-ui/buttonSquare_brown.png') 10 fill;
          border-style: solid;
          border-width: 10px;
          background: transparent;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-weight: 900;
          font-size: 24px;
          z-index: 10;
        }
        .cycle-btn:active { filter: brightness(0.8); transform: translateY(-46%); }
        #prev-char-btn { left: 10px; }
        #next-char-btn { right: 10px; }

        .class-badge {
          position: absolute;
          top: -20px;
          left: 50%;
          transform: translateX(-50%);
          border-image: url('/assets/kenney-rpg-ui/panelInset_brown.png') 10 fill;
          border-style: solid;
          border-width: 10px;
          font-family: 'Cinzel', serif;
          font-size: 22px;
          font-weight: 900;
          color: #facc15;
          text-shadow: 2px 2px 0 #000;
          z-index: 5;
          padding: 0 20px;
        }

        .details-area {
          width: 100%;
          max-width: 450px;
          display: flex;
          flex-direction: column;
          gap: 15px;
          border-image: url('/assets/kenney-rpg-ui/panel_brown.png') 16 fill;
          border-style: solid;
          border-width: 16px;
          image-rendering: pixelated;
          box-shadow: 0 10px 20px rgba(0,0,0,0.8);
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          padding-right: 5px; /* Scrollbar breathing room */
        }

        /* Scrollbar Styling for Details Area */
        .details-area::-webkit-scrollbar { width: 8px; }
        .details-area::-webkit-scrollbar-track { background: rgba(0,0,0,0.5); border-radius: 4px; }
        .details-area::-webkit-scrollbar-thumb { background: #8b5a2b; border-radius: 4px; border: 1px solid #3e2723; }

        .info-header h2 { margin: 0; font-family: 'Cinzel', serif; font-size: 28px; color: #facc15; text-shadow: 2px 2px 0 #000; text-align: center; }
        .info-header p { margin: 10px 0 0; font-size: 15px; color: #cbd5e1; line-height: 1.5; text-align: justify; }

        .stats-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .stat-box {
          border-image: url('/assets/kenney-rpg-ui/panelInset_brown.png') 10 fill;
          border-style: solid;
          border-width: 10px;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 5px 0;
        }
        .stat-val { font-family: 'Teko', sans-serif; font-size: 26px; font-weight: 600; line-height: 1; text-shadow: 1px 1px 0 #000; }
        .stat-label { font-size: 11px; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
        
        .skills-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }
        .skill-card {
          border-image: url('/assets/kenney-rpg-ui/panelInset_brown.png') 10 fill;
          border-style: solid;
          border-width: 10px;
          display: flex;
          gap: 12px;
          align-items: center;
        }
        .skill-icon-wrap {
          width: 48px;
          height: 48px;
          border-image: url('/assets/kenney-rpg-ui/buttonSquare_brown.png') 10 fill;
          border-style: solid;
          border-width: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .skill-info { flex: 1; min-width: 0; }
        .skill-name { font-size: 15px; font-weight: 900; color: #facc15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: 1px 1px 0 #000; }
        .skill-desc { font-size: 12px; color: #cbd5e1; line-height: 1.3; margin-top: 4px; }

        #start-game-btn {
          margin-top: 10px;
          width: 100%;
          min-height: 60px;
          border-image: url('/assets/kenney-rpg-ui/buttonLong_brown.png') 10 fill;
          border-style: solid;
          border-width: 10px;
          background: transparent;
          color: #fff;
          font-family: 'Cinzel', serif;
          font-size: 22px;
          font-weight: 900;
          text-shadow: 2px 2px 0px rgba(0,0,0,0.8);
          cursor: pointer;
          transition: transform 0.1s;
        }
        #start-game-btn:active { transform: scale(0.96); filter: brightness(0.8); }

        #char-select-fs-btn {
          position: absolute;
          top: max(10px, env(safe-area-inset-top));
          right: max(10px, env(safe-area-inset-right));
          width: auto;
          padding: 0 15px;
          height: 44px;
          border-image: url('/assets/kenney-rpg-ui/buttonSquare_brown.png') 10 fill;
          border-style: solid;
          border-width: 10px;
          background: transparent;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
          color: #fff;
          font-weight: bold;
        }
      </style>

      <canvas id="bg-canvas"></canvas>
      <button id="char-select-fs-btn" title="Toggle Fullscreen">FULLSCREEN</button>
      
      <div class="main-layout">
        <!-- Left: Stage & Character Showcase -->
        <div class="showcase-area">
          <div class="class-badge">${this.selectedClass.name}</div>
          <button class="cycle-btn" id="prev-char-btn">&lt;</button>
          <canvas id="hero-showcase-canvas"></canvas>
          <button class="cycle-btn" id="next-char-btn">&gt;</button>
        </div>

        <!-- Right: Details, Stats, Skills -->
        <div class="details-area">
          <div class="info-header">
            <h2>${this.selectedClass.name}</h2>
            <p>${this.selectedClass.description}</p>
          </div>

          <div class="stats-grid">
            <div class="stat-box"><span class="stat-val" style="color: #ef4444;">${this.selectedClass.stats.maxHp}</span><span class="stat-label">Max HP</span></div>
            <div class="stat-box"><span class="stat-val" style="color: #3b82f6;">${this.selectedClass.stats.maxMp}</span><span class="stat-label">Max MP</span></div>
            <div class="stat-box"><span class="stat-val" style="color: #f97316;">${this.selectedClass.stats.atk}</span><span class="stat-label">Attack</span></div>
            <div class="stat-box"><span class="stat-val" style="color: #8b5cf6;">${this.selectedClass.stats.def}</span><span class="stat-label">Defense</span></div>
            <div class="stat-box"><span class="stat-val" style="color: #22c55e;">${this.selectedClass.stats.speed}</span><span class="stat-label">Speed</span></div>
            <div class="stat-box"><span class="stat-val" style="color: #eab308;">${(this.selectedClass.stats.critChance * 100).toFixed(0)}%</span><span class="stat-label">Crit Rate</span></div>
          </div>

          <div style="font-family: 'Cinzel', serif; font-size: 18px; color: #facc15; border-bottom: 2px solid #5a4031; padding-bottom: 4px; margin-top: 10px;">Class Skills</div>
          <div class="skills-grid">
            ${this.selectedClass.skills.map((s, idx) => `
              <div class="skill-card">
                <div class="skill-icon-wrap">
                  <img src="${this.getSkillIcon(s, this.selectedClass.id, idx)}" width="32" height="32" style="image-rendering: pixelated;" />
                </div>
                <div class="skill-info">
                  <div class="skill-name">${s.name}</div>
                  <div class="skill-desc">${s.description}</div>
                </div>
              </div>
            `).join('')}
          </div>

          <button id="start-game-btn">BEGIN JOURNEY</button>
        </div>
      </div>
    `;
    this.attachEvents();
  }

  private attachEvents() {
    const startBtn = this.container.querySelector('#start-game-btn');
    startBtn?.addEventListener('click', () => {
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

    const prevBtn = this.container.querySelector('#prev-char-btn');
    const nextBtn = this.container.querySelector('#next-char-btn');
    
    const cycleCharacter = (direction: number) => {
      let currentIndex = CHARACTER_CLASSES.findIndex(c => c.id === this.selectedClass.id);
      currentIndex += direction;
      
      if (currentIndex < 0) {
        currentIndex = CHARACTER_CLASSES.length - 1;
      } else if (currentIndex >= CHARACTER_CLASSES.length) {
        currentIndex = 0;
      }
      
      this.selectedClass = CHARACTER_CLASSES[currentIndex];
      this.showcaseAnimState = 'attack';
      this.showcaseTimer = 0.5;
      audio.playClick();
      this.render();
    };

    prevBtn?.addEventListener('click', () => cycleCharacter(-1));
    nextBtn?.addEventListener('click', () => cycleCharacter(1));

    const showcaseCanvas = this.container.querySelector('#hero-showcase-canvas') as HTMLCanvasElement;
    if (showcaseCanvas) {
      showcaseCanvas.addEventListener('click', () => {
        this.showcaseAnimState = 'attack';
        this.showcaseTimer = 0.45;
        audio.playSlash('heavy');
      });
    }
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
