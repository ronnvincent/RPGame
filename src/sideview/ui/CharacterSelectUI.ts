import { CHARACTER_CLASSES, CharacterClass, SkillDefinition } from '../classes/ClassDefinitions';
import { audio } from '../engine/AudioManager';
import { sprites } from '../engine/SpriteManager';
import { escapeHtml, escapeHtmlAttribute, safeLocalAssetPath } from './UiSafety';

const STYLE_ID = 'character-select-rpg-style';
// Alpha scans across every idle and primary-attack frame put all visible hero
// pixels inside roughly 95px of the anchor in either direction and 95px above
// the feet. Fit that envelope before zooming so a larger preview stays inside
// the canvas even when a weapon trail reaches beyond the character body.
const SHOWCASE_CONTENT_HALF_WIDTH = 95;
const SHOWCASE_CONTENT_HEIGHT = 95;
const SHOWCASE_MAX_SCALE = 3;

/** A keyboard, touch and screen-reader friendly class hall. */
export class CharacterSelectUI {
  private container: HTMLElement;
  private selectedClass: CharacterClass = CHARACTER_CLASSES[0];
  private onClassSelectedCallback: (charClass: CharacterClass) => void;
  private isDestroyed = false;
  private showcaseAnimState: 'idle' | 'attack' = 'idle';
  private showcaseTimer = 0;
  private bgTimer = 0;
  private lastFrameAt = 0;
  private particles: Array<{ x: number; y: number; vx: number; vy: number; life: number; color: string; size: number }> = [];
  private readonly keyHandler = (event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.cycleClass(-1, 'prev-char-btn');
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.cycleClass(1, 'next-char-btn');
    }
  };

  constructor(rootElement: HTMLElement, onClassSelected: (charClass: CharacterClass) => void) {
    this.container = document.createElement('main');
    this.container.id = 'char-select-screen';
    this.container.className = 'rpg-screen character-select-screen';
    this.container.setAttribute('aria-labelledby', 'char-select-title');
    this.onClassSelectedCallback = onClassSelected;
    rootElement.appendChild(this.container);
    this.injectStyles();
    this.container.addEventListener('keydown', this.keyHandler);
    this.render();
    this.startAnimationLoop();
    audio.playTownBGM();
  }

  private getSkillIcon(skill: SkillDefinition, selectedClassId: string, skillIdx = 0): string {
    if (skill.iconImage) return safeLocalAssetPath(skill.iconImage, '/assets/rpg-icons/32x32/sword_03a.png');
    const icons: Record<string, string[]> = {
      warrior: ['sword_03a.png', 'sword_02a.png', 'shield_01a.png', 'scroll_01b.png', 'sword_01c.png', 'crystal_01h.png'],
      paladin: ['sword_02c.png', 'shield_03a.png', 'helmet_02a.png', 'crystal_01i.png', 'potion_01a.png', 'crystal_01c.png'],
      berserker: ['sword_02a.png', 'potion_03b.png', 'boots_01e.png', 'ring_01a.png', 'shard_01g.png', 'gem_01b.png'],
      dragoon: ['staff_02ab.png', 'armor_01c.png', 'crystal_01g.png', 'staff_02d.png', 'gem_01j.png', 'crystal_01f.png'],
      mage: ['staff_03a.png', 'crystal_01f.png', 'ring_03b.png', 'spellbook_03a.png', 'crystal_01d.png', 'gem_01c.png'],
      priest: ['necklace_01a.png', 'potion_01b.png', 'spellbook_02a.png', 'ring_02a.png', 'crystal_01j.png', 'gem_01d.png'],
      necromancer: ['skull_01a.png', 'potion_03e.png', 'bone01a.png', 'spellbook_01a.png', 'crystal_01d.png', 'gem_01e.png'],
      archer: ['bow_03a.png', 'arrow_03a.png', 'leaf_01a.png', 'bow_02a.png', 'arrow_03e.png', 'crystal_01b.png'],
      ninja: ['shard_01a.png', 'scroll_01f.png', 'boots_01e.png', 'sword_01a.png', 'sword_02c.png', 'gem_01i.png'],
      assassin: ['sword_01d.png', 'shard_01d.png', 'potion_03c.png', 'hat_01a.png', 'ring_01d.png', 'gem_01f.png'],
    };
    const pool = icons[selectedClassId.toLowerCase()] || icons.warrior;
    return `/assets/rpg-icons/32x32/${pool[skillIdx % pool.length]}`;
  }

  public render(): void {
    const cls = this.selectedClass;
    const className = escapeHtml(cls.name);
    const classDescription = escapeHtml(cls.description);
    const accent = escapeHtmlAttribute(cls.accentColor);
    this.container.style.setProperty('--class-accent', cls.accentColor);
    this.container.innerHTML = `
      <canvas class="character-select-bg" id="bg-canvas" aria-hidden="true"></canvas>
      <div class="character-select-shade" aria-hidden="true"></div>
      <section class="character-select-shell" aria-describedby="char-select-help">
        <header class="character-select-header">
          <div>
            <p class="rpg-kicker">Hall of Champions</p>
            <h1 class="rpg-title" id="char-select-title">Choose Your Calling</h1>
            <p class="rpg-help" id="char-select-help">Use the class roster or the Left and Right Arrow keys. Review all six skills before beginning.</p>
          </div>
          <button class="rpg-button character-fs" id="char-select-fs-btn" type="button" aria-label="Toggle fullscreen">Fullscreen</button>
        </header>

        <div class="character-select-layout">
          <section class="rpg-panel character-showcase" aria-labelledby="selected-class-name">
            <p class="rpg-kicker">Selected Class</p>
            <h2 class="rpg-heading character-class-badge" id="selected-class-name">${className}</h2>
            <button class="rpg-icon-button character-cycle character-cycle--prev" id="prev-char-btn" type="button" aria-label="Previous class">&lt;</button>
            <canvas id="hero-showcase-canvas" width="640" height="420" role="img" aria-label="Animated ${escapeHtmlAttribute(cls.name)} class preview"></canvas>
            <button class="rpg-icon-button character-cycle character-cycle--next" id="next-char-btn" type="button" aria-label="Next class">&gt;</button>
            <button class="rpg-button rpg-button--primary character-start" id="start-game-btn" type="button">Begin as ${className}</button>
          </section>

          <section class="rpg-panel character-details" aria-label="${escapeHtmlAttribute(cls.name)} details">
            <div class="character-copy">
              <h2 class="rpg-heading">${className}</h2>
              <p>${classDescription}</p>
            </div>
            <dl class="character-stats" aria-label="Base statistics">
              ${this.stat('Health', cls.stats.maxHp)}
              ${this.stat('Mana', cls.stats.maxMp)}
              ${this.stat('Attack', cls.stats.atk)}
              ${this.stat('Defense', cls.stats.def)}
              ${this.stat('Speed', cls.stats.speed)}
              ${this.stat('Critical', `${Math.round(cls.stats.critChance * 100)}%`)}
            </dl>
            <div class="rpg-divider" aria-hidden="true"></div>
            <h3 class="rpg-heading character-skills-title">Class Skills</h3>
            <div class="character-skills">
              ${cls.skills.map((skill, index) => {
                const icon = escapeHtmlAttribute(this.getSkillIcon(skill, cls.id, index));
                const binding = escapeHtml(skill.key || String(index + 1));
                return `<article class="rpg-card character-skill">
                  <img src="${icon}" width="32" height="32" alt="" loading="lazy" decoding="async">
                  <div>
                    <div class="character-skill__title"><span>${escapeHtml(skill.name)}</span><kbd class="rpg-key">${binding}</kbd></div>
                    <p>${escapeHtml(skill.description)}</p>
                    <span class="character-skill__meta">${Math.round(skill.damageMultiplier * 100)}% potency · ${skill.manaCost} MP · ${skill.cooldown}s cooldown</span>
                  </div>
                </article>`;
              }).join('')}
            </div>
          </section>
        </div>

        <nav class="character-roster" aria-label="Available classes">
          ${CHARACTER_CLASSES.map(option => `<button
            class="character-roster__button ${option.id === cls.id ? 'is-selected' : ''}"
            type="button" data-class-id="${escapeHtmlAttribute(option.id)}"
            aria-pressed="${option.id === cls.id}">
            <canvas class="card-sprite-canvas" width="88" height="76" data-class="${escapeHtmlAttribute(option.id)}" aria-hidden="true"></canvas>
            <span>${escapeHtml(option.name)}</span>
          </button>`).join('')}
        </nav>
        <span class="rpg-visually-hidden" aria-live="polite">${className} selected</span>
      </section>`;

    this.attachEvents();
  }

  private stat(label: string, value: string | number): string {
    return `<div class="rpg-card character-stat"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
  }

  private attachEvents(): void {
    this.container.querySelector('#start-game-btn')?.addEventListener('click', () => {
      audio.playQuestAccept();
      const selected = this.selectedClass;
      this.destroy();
      this.onClassSelectedCallback(selected);
    });

    this.container.querySelector('#char-select-fs-btn')?.addEventListener('click', () => {
      audio.playClick();
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => undefined);
      else document.exitFullscreen?.().catch(() => undefined);
    });
    this.container.querySelector('#prev-char-btn')?.addEventListener('click', () => this.cycleClass(-1, 'prev-char-btn'));
    this.container.querySelector('#next-char-btn')?.addEventListener('click', () => this.cycleClass(1, 'next-char-btn'));
    this.container.querySelectorAll<HTMLButtonElement>('[data-class-id]').forEach(button => {
      button.addEventListener('click', () => {
        const found = CHARACTER_CLASSES.find(candidate => candidate.id === button.dataset.classId);
        if (!found || found.id === this.selectedClass.id) return;
        this.selectedClass = found;
        this.showcaseAnimState = 'attack';
        this.showcaseTimer = .45;
        audio.playClick();
        this.render();
        this.container.querySelector<HTMLButtonElement>(`[data-class-id="${CSS.escape(found.id)}"]`)?.focus();
      });
    });
    this.container.querySelector('#hero-showcase-canvas')?.addEventListener('click', () => {
      this.showcaseAnimState = 'attack';
      this.showcaseTimer = .45;
      audio.playSlash('heavy');
    });
  }

  private cycleClass(direction: number, focusId: string): void {
    const current = CHARACTER_CLASSES.findIndex(candidate => candidate.id === this.selectedClass.id);
    this.selectedClass = CHARACTER_CLASSES[(current + direction + CHARACTER_CLASSES.length) % CHARACTER_CLASSES.length];
    this.showcaseAnimState = 'attack';
    this.showcaseTimer = .45;
    audio.playClick();
    this.render();
    this.container.querySelector<HTMLElement>(`#${focusId}`)?.focus();
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.container.removeEventListener('keydown', this.keyHandler);
    this.container.remove();
  }

  private startAnimationLoop(): void {
    const loop = (time: number) => {
      if (this.isDestroyed) return;
      const dt = this.lastFrameAt ? Math.min(.05, (time - this.lastFrameAt) / 1000) : .016;
      this.lastFrameAt = time;
      if (!document.hidden) this.draw(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private draw(dt: number): void {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      || document.documentElement.dataset.rpgReducedMotion === 'true';
    if (!reducedMotion) this.bgTimer += dt;
    if (this.showcaseTimer > 0) {
      this.showcaseTimer -= dt;
      if (this.showcaseTimer <= 0) this.showcaseAnimState = 'idle';
    }

    const bg = this.container.querySelector<HTMLCanvasElement>('#bg-canvas');
    if (bg) {
      const width = Math.max(1, Math.round(bg.clientWidth));
      const height = Math.max(1, Math.round(bg.clientHeight));
      if (bg.width !== width || bg.height !== height) { bg.width = width; bg.height = height; }
      const ctx = bg.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, width, height);
        sprites.drawEnvironment(ctx, this.bgTimer * 24, width, height, height - 40, width * 2);
      }
    }

    this.container.querySelectorAll<HTMLCanvasElement>('.card-sprite-canvas').forEach(canvas => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      ctx.save();
      ctx.translate(Math.round(canvas.width / 2), canvas.height - 6);
      ctx.scale(.82, .82);
      sprites.drawHero(ctx, 0, 0, canvas.dataset.class || 'warrior', 'idle', 1, 0);
      ctx.restore();
    });

    const showcase = this.container.querySelector<HTMLCanvasElement>('#hero-showcase-canvas');
    const ctx = showcase?.getContext('2d');
    if (!showcase || !ctx) return;
    const width = Math.max(1, Math.round(showcase.clientWidth || showcase.width));
    const height = Math.max(1, Math.round(showcase.clientHeight || showcase.height));
    if (showcase.width !== width || showcase.height !== height) { showcase.width = width; showcase.height = height; }
    const cx = Math.round(width / 2);
    const floor = height - Math.max(22, Math.min(34, Math.round(height * .08)));
    const horizontalFit = (width - 32) / (SHOWCASE_CONTENT_HALF_WIDTH * 2);
    const verticalFit = (floor - 16) / SHOWCASE_CONTENT_HEIGHT;
    const rawScale = Math.max(1, Math.min(SHOWCASE_MAX_SCALE, horizontalFit, verticalFit));
    // Quarter steps keep nearest-neighbour pixels visually even while the
    // available panel size changes between desktop, tablet and phone layouts.
    const showcaseScale = Math.max(1, Math.floor(rawScale * 4) / 4);
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.globalAlpha = .45;
    ctx.fillStyle = this.selectedClass.accentColor;
    ctx.shadowColor = this.selectedClass.accentColor;
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.ellipse(cx, floor, 62 + showcaseScale * 18, 12 + showcaseScale * 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (!reducedMotion && Math.random() < .28) {
      this.particles.push({ x: cx + Math.random() * 90 - 45, y: floor, vx: Math.random() - .5, vy: -(25 + Math.random() * 34), life: 1, color: this.selectedClass.accentColor, size: 1.5 + Math.random() * 2 });
    }
    this.particles.forEach(particle => {
      particle.x += particle.vx * dt * 30;
      particle.y += particle.vy * dt;
      particle.life -= dt * .8;
      if (particle.life <= 0) return;
      ctx.globalAlpha = particle.life;
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
    });
    ctx.globalAlpha = 1;
    this.particles = this.particles.filter(particle => particle.life > 0).slice(-36);
    ctx.save();
    ctx.translate(cx, floor);
    ctx.scale(showcaseScale, showcaseScale);
    sprites.drawHero(ctx, 0, 0, this.selectedClass.id, this.showcaseAnimState, 1, this.showcaseTimer, this.selectedClass.themeColor);
    ctx.restore();
  }

  private injectStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .character-select-screen { overflow: hidden; background: #05070a; }
      .character-select-bg, .character-select-shade { position: absolute; inset: 0; width: 100%; height: 100%; }
      .character-select-bg { image-rendering: pixelated; filter: saturate(.7) brightness(.34) contrast(1.08); transform: scale(1.03); }
      .character-select-shade { background: radial-gradient(circle at 28% 44%, color-mix(in srgb, var(--class-accent) 12%, transparent), transparent 34%), linear-gradient(90deg, rgba(3,5,8,.72), rgba(3,5,8,.28) 50%, rgba(3,5,8,.78)); pointer-events: none; }
      .character-select-shell { position: relative; z-index: 1; display: grid; grid-template-rows: auto minmax(0,1fr) auto; gap: 10px; width: min(1440px,100%); height: 100%; margin: auto; }
      .character-select-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 3px 4px; }
      .character-select-header p { margin: 4px 0 0; }
      .character-select-layout { display: grid; grid-template-columns: minmax(430px, 1.05fr) minmax(480px, .95fr); gap: 14px; min-height: 0; }
      .character-select-screen .character-showcase,
      .character-select-screen .character-details {
        box-sizing: border-box;
        border: 1px solid rgba(231,189,85,.58);
        border-image: none;
        border-radius: 8px;
        color: #f4ead2;
        background:
          linear-gradient(135deg, rgba(231,189,85,.1), transparent 24%),
          radial-gradient(circle at 50% 18%, color-mix(in srgb, var(--class-accent) 9%, transparent), transparent 42%),
          linear-gradient(165deg, rgba(39,32,25,.97), rgba(15,16,20,.985) 48%, rgba(7,9,13,.995));
        box-shadow: inset 0 0 0 2px rgba(0,0,0,.62), inset 0 0 32px rgba(0,0,0,.36), 0 14px 34px rgba(0,0,0,.48);
        filter: none;
      }
      .character-showcase { position: relative; display: grid; grid-template-rows: auto auto minmax(260px,1fr) auto; justify-items: center; align-items: center; align-content: stretch; gap: 5px; min-height: 0; padding: clamp(12px,1.4vw,20px); overflow: hidden; text-align: center; }
      .character-class-badge { color: var(--class-accent); }
      #hero-showcase-canvas { display:block; width:100%; height:100%; min-height:260px; border-block:1px solid rgba(231,189,85,.16); background:radial-gradient(ellipse at 50% 76%, color-mix(in srgb, var(--class-accent) 15%, transparent), transparent 48%); cursor:pointer; image-rendering:pixelated; }
      .character-cycle { position:absolute; top:50%; z-index:2; transform:translateY(-50%); cursor:pointer; }
      .character-cycle:active { transform:translateY(calc(-50% + 2px)); }
      .character-cycle--prev { left:12px; } .character-cycle--next { right:12px; }
      .character-start { width:min(320px,84%); }
      .character-details { min-height:0; overflow:auto; padding:14px 16px; scrollbar-color:rgba(231,189,85,.48) rgba(5,7,10,.7); }
      .character-copy p { margin:6px 0 10px; color:#c9bea8; line-height:1.45; }
      .character-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:7px; margin:0; }
      .character-select-screen .character-stat,
      .character-select-screen .character-skill { border:1px solid rgba(231,189,85,.25); border-image:none; border-radius:5px; background:linear-gradient(145deg,rgba(57,46,34,.78),rgba(12,14,18,.94) 70%); box-shadow:inset 0 0 0 1px rgba(0,0,0,.45); filter:none; }
      .character-stat { display:flex; align-items:baseline; justify-content:space-between; gap:6px; padding:9px; }
      .character-stat dt { color:#c5b99f; font-size:.72rem; font-weight:800; text-transform:uppercase; }
      .character-stat dd { margin:0; color:var(--class-accent); font-weight:900; font-variant-numeric:tabular-nums; }
      .character-skills-title { margin-bottom:7px; }
      .character-skills { display:grid; grid-template-columns:1fr 1fr; gap:7px; }
      .character-skill { display:grid; grid-template-columns:38px 1fr; gap:8px; align-items:start; padding:8px; }
      .character-skill img { image-rendering:pixelated; }
      .character-skill__title { display:flex; justify-content:space-between; gap:5px; color:var(--rpg-gold-bright); font-weight:900; }
      .character-skill p { margin:3px 0; color:#ded3bd; font-size:.78rem; line-height:1.35; }
      .character-skill__meta { color:#bfb298; font-size:.72rem; }
      .character-roster { display:flex; gap:6px; overflow-x:auto; padding:3px 2px; scrollbar-width:thin; }
      .character-roster__button { flex:1 0 104px; min-height:88px; padding:2px 6px 6px; border:1px solid rgba(231,189,85,.34); border-radius:5px; color:#c4b89f; background:linear-gradient(rgba(28,25,22,.94),rgba(8,10,14,.96)); font:800 .74rem/1.1 'Outfit',sans-serif; cursor:pointer; box-shadow:inset 0 0 0 1px rgba(0,0,0,.55); }
      .character-roster__button canvas { display:block; width:70px; height:60px; margin:auto; image-rendering:pixelated; }
      .character-roster__button.is-selected { color:var(--rpg-gold-bright); border-color:var(--class-accent); background:linear-gradient(color-mix(in srgb,var(--class-accent) 18%,#28231d),#0d1015 72%); box-shadow:inset 0 0 0 1px var(--class-accent),0 0 14px color-mix(in srgb,var(--class-accent) 30%,transparent); }
      .character-roster__button:focus-visible { outline:2px solid var(--rpg-focus); outline-offset:2px; }
      @media (max-width:980px), (orientation:portrait) {
        .character-select-shell { grid-template-rows:auto minmax(0,1fr) auto; }
        .character-select-header .rpg-help { display:none; }
        .character-select-layout { grid-template-columns:1fr; overflow:auto; }
        .character-showcase { min-height:clamp(380px,54dvh,500px); }
        #hero-showcase-canvas { min-height:270px; }
        .character-details { overflow:visible; }
        .character-skills { grid-template-columns:1fr; }
        .character-roster { max-height:94px; }
      }
      @media (max-width:560px) {
        .character-select-header { align-items:center; }
        .character-select-header .rpg-kicker { display:none; }
        .character-select-header .rpg-title { font-size:clamp(1.25rem,6vw,1.65rem); }
        .character-showcase { grid-template-rows:auto auto minmax(240px,1fr) auto; min-height:350px; padding:10px; }
        #hero-showcase-canvas { min-height:240px; }
        .character-details { padding:12px; }
        .character-stats { grid-template-columns:repeat(2,1fr); }
        .character-cycle--prev { left:7px; } .character-cycle--next { right:7px; }
        .character-roster__button { flex-basis:94px; }
      }
      @media (max-height:520px) and (orientation:landscape) {
        .character-select-shell { gap:6px; }
        .character-select-header .rpg-help, .character-select-header .rpg-kicker, .character-showcase > .rpg-kicker { display:none; }
        .character-select-layout { grid-template-columns:minmax(280px,.85fr) minmax(390px,1.15fr); gap:8px; }
        .character-showcase { grid-template-rows:auto minmax(120px,1fr) auto; gap:2px; min-height:0; padding:6px 10px; }
        #hero-showcase-canvas { min-height:120px; height:100%; }
        .character-skills { grid-template-columns:1fr 1fr; }
        .character-roster { max-height:66px; }
        .character-roster__button { flex-basis:84px; min-height:62px; padding:1px 4px 3px; font-size:.65rem; }
        .character-roster__button canvas { width:48px; height:40px; }
      }
    `;
    document.head.appendChild(style);
  }
}
