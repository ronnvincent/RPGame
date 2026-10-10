/**
 * Cinematic developer credits intro.
 *
 * Plays once per new account, right after login/guest creation and before
 * the Character Select screen. Unskippable, auto-runs, self-destructs.
 */

const STYLE_ID = 'cinematic-intro-style';
const INTRO_PLAYED_KEY = 'introPlayed';

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes ci-fade-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes ci-fade-out {
      from { opacity: 1; }
      to   { opacity: 0; }
    }
    @keyframes ci-scale-in {
      from { opacity: 0; transform: scale(0.85); filter: blur(8px); }
      to   { opacity: 1; transform: scale(1);    filter: blur(0);   }
    }
    @keyframes ci-float-up {
      from { opacity: 0; transform: translateY(30px); }
      to   { opacity: 1; transform: translateY(0);    }
    }
    @keyframes ci-ember-rise {
      0%   { opacity: 0; transform: translateY(0) scale(1); }
      15%  { opacity: 1; }
      85%  { opacity: 0.6; }
      100% { opacity: 0; transform: translateY(-100vh) scale(0.3); }
    }
    @keyframes ci-glow-pulse {
      0%, 100% { opacity: 0.3; transform: scale(1); }
      50%      { opacity: 0.6; transform: scale(1.15); }
    }
    @keyframes ci-line-expand {
      from { width: 0; }
      to   { width: 120px; }
    }
    @keyframes ci-badge-glow {
      0%, 100% { box-shadow: 0 0 30px rgba(212,175,55,0.15), inset 0 0 20px rgba(212,175,55,0.05); }
      50%      { box-shadow: 0 0 60px rgba(212,175,55,0.3), inset 0 0 40px rgba(212,175,55,0.1); }
    }

    .ci-overlay {
      position: fixed; inset: 0; z-index: 999999;
      display: flex; align-items: center; justify-content: center;
      background: #000;
      pointer-events: none;
      overflow: hidden;
      font-family: 'Cinzel', 'Times New Roman', serif;
    }

    .ci-particles {
      position: absolute; inset: 0;
      pointer-events: none;
    }

    .ci-ember {
      position: absolute;
      width: 3px; height: 3px;
      border-radius: 50%;
      background: radial-gradient(circle, #ffd700, #d4af37 60%, transparent);
      box-shadow: 0 0 6px 2px rgba(255,215,0,0.4);
      animation: ci-ember-rise linear infinite;
      will-change: transform, opacity;
    }

    .ci-glow {
      position: absolute;
      width: 300px; height: 300px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(212,175,55,0.15), transparent 70%);
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      animation: ci-glow-pulse 3s ease-in-out infinite;
      pointer-events: none;
    }

    .ci-beat {
      position: absolute; inset: 0;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      text-align: center;
      padding: 20px;
      opacity: 0;
    }

    .ci-studio-name {
      font-size: clamp(2rem, 7vw, 4rem);
      font-weight: 900;
      letter-spacing: 8px;
      color: #ffd700;
      text-shadow:
        0 0 40px rgba(255,215,0,0.4),
        0 4px 12px rgba(0,0,0,0.9);
      margin-bottom: 8px;
    }

    .ci-line {
      height: 2px;
      background: linear-gradient(90deg, transparent, #d4af37, transparent);
      margin: 12px auto 16px;
      animation: ci-line-expand 1s ease-out forwards;
    }

    .ci-role {
      font-family: 'Outfit', sans-serif;
      font-size: clamp(0.7rem, 2.5vw, 0.95rem);
      font-weight: 700;
      letter-spacing: 3px;
      color: #b8976a;
      text-transform: uppercase;
      margin-bottom: 6px;
    }

    .ci-person-name {
      font-size: clamp(1.6rem, 5vw, 2.8rem);
      font-weight: 900;
      letter-spacing: 4px;
      color: #fdf6e3;
      text-shadow:
        0 0 30px rgba(255,215,0,0.25),
        0 3px 8px rgba(0,0,0,0.9);
      margin-bottom: 6px;
    }

    .ci-subtitle {
      font-family: 'Outfit', sans-serif;
      font-size: clamp(0.65rem, 2vw, 0.85rem);
      font-weight: 600;
      letter-spacing: 2px;
      color: #94a3b8;
      text-transform: uppercase;
    }

    .ci-badge {
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 28px 44px;
      border: 1px solid rgba(212,175,55,0.35);
      border-radius: 8px;
      background: linear-gradient(145deg, rgba(22,18,30,0.9), rgba(8,6,12,0.95));
      animation: ci-badge-glow 2.5s ease-in-out infinite;
    }

    .ci-badge-title {
      font-size: clamp(2.2rem, 8vw, 3.6rem);
      font-weight: 900;
      letter-spacing: 12px;
      color: #ffd700;
      text-shadow: 0 0 30px rgba(255,215,0,0.3);
    }

    .ci-badge-sub {
      font-family: 'Outfit', sans-serif;
      font-size: clamp(0.55rem, 1.8vw, 0.75rem);
      font-weight: 600;
      letter-spacing: 2.5px;
      color: #94a3b8;
      text-transform: uppercase;
      margin-top: 8px;
    }
  `;
  document.head.appendChild(style);
}

function createEmbers(container: HTMLElement, count: number): void {
  for (let i = 0; i < count; i++) {
    const ember = document.createElement('div');
    ember.className = 'ci-ember';
    const size = 2 + Math.random() * 4;
    ember.style.width = `${size}px`;
    ember.style.height = `${size}px`;
    ember.style.left = `${Math.random() * 100}%`;
    ember.style.bottom = `${-10 + Math.random() * 20}%`;
    ember.style.animationDuration = `${4 + Math.random() * 6}s`;
    ember.style.animationDelay = `${Math.random() * 8}s`;
    container.appendChild(ember);
  }
}

function animateBeat(
  beat: HTMLElement,
  fadeInDuration: number,
  holdDuration: number,
  fadeOutDuration: number,
): Promise<void> {
  return new Promise(resolve => {
    beat.style.animation = `ci-scale-in ${fadeInDuration}ms cubic-bezier(0.16, 1, 0.3, 1) forwards`;
    beat.style.opacity = '0';

    setTimeout(() => {
      beat.style.animation = `ci-fade-out ${fadeOutDuration}ms ease-in forwards`;
      setTimeout(() => {
        beat.style.display = 'none';
        resolve();
      }, fadeOutDuration);
    }, fadeInDuration + holdDuration);
  });
}

export function shouldPlayIntro(): boolean {
  return !localStorage.getItem(INTRO_PLAYED_KEY);
}

export function markIntroPlayed(): void {
  localStorage.setItem(INTRO_PLAYED_KEY, '1');
}

export function playCinematicIntro(): Promise<void> {
  return new Promise(resolve => {
    injectStyles();

    const overlay = document.createElement('div');
    overlay.className = 'ci-overlay';

    const particles = document.createElement('div');
    particles.className = 'ci-particles';
    createEmbers(particles, 40);
    overlay.appendChild(particles);

    const glow = document.createElement('div');
    glow.className = 'ci-glow';
    overlay.appendChild(glow);

    // Beat 1: Studio Title
    const beat1 = document.createElement('div');
    beat1.className = 'ci-beat';
    beat1.innerHTML = `
      <div class="ci-studio-name">CECT STUDIO</div>
      <div class="ci-line"></div>
      <div class="ci-role">Lead Developer &amp; Game Designer</div>
      <div class="ci-person-name">Ronn Vincent Pingol</div>
      <div class="ci-subtitle">A CECT Studio Production</div>
    `;
    overlay.appendChild(beat1);

    // Beat 2: QA Credit
    const beat2 = document.createElement('div');
    beat2.className = 'ci-beat';
    beat2.innerHTML = `
      <div class="ci-role">Assistant QA Tester</div>
      <div class="ci-person-name">Kevin Paradina</div>
      <div class="ci-subtitle">Quality Assurance &amp; Playtesting</div>
    `;
    overlay.appendChild(beat2);

    // Beat 3: Team Badge
    const beat3 = document.createElement('div');
    beat3.className = 'ci-beat';
    beat3.innerHTML = `
      <div class="ci-badge">
        <div class="ci-badge-title">IT3C</div>
        <div class="ci-badge-sub">Forged in the fires of Block IT3C</div>
      </div>
    `;
    overlay.appendChild(beat3);

    document.body.appendChild(overlay);

    overlay.style.animation = 'ci-fade-in 1.5s ease-out forwards';

    const run = async () => {
      await new Promise(r => setTimeout(r, 1500));

      await animateBeat(beat1, 1200, 2300, 800);
      await new Promise(r => setTimeout(r, 300));

      await animateBeat(beat2, 1000, 2000, 800);
      await new Promise(r => setTimeout(r, 300));

      await animateBeat(beat3, 1000, 1800, 600);

      overlay.style.animation = 'ci-fade-out 1s ease-in forwards';
      await new Promise(r => setTimeout(r, 1000));

      overlay.remove();
      markIntroPlayed();
      resolve();
    };

    run();
  });
}
