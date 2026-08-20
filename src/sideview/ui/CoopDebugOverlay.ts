/**
 * Co-op diagnostic overlay.
 *
 * Shows the live multiplayer state on screen so a desync can be read off both
 * devices at once instead of guessed at. Hidden unless explicitly enabled.
 *
 * Enable:  add ?coopdebug=1 or ?perfdebug=1 to the URL, or set the matching
 *          localStorage debug key and reload.
 * Disable: use the same query with value 0, or remove the key.
 */

import { network } from '../network/NetworkManager';
import { SideViewEngine } from '../engine/SideViewEngine';

const KEY = 'rpg_debug_multiplayer';
const PERFORMANCE_KEY = 'rpg_debug_performance';

export function isCoopDebugEnabled(): boolean {
  try {
    const param = new URLSearchParams(window.location.search).get('coopdebug');
    const performanceParam = new URLSearchParams(window.location.search).get('perfdebug');
    if (param === '1') localStorage.setItem(KEY, '1');
    if (param === '0') localStorage.removeItem(KEY);
    if (performanceParam === '1') localStorage.setItem(PERFORMANCE_KEY, '1');
    if (performanceParam === '0') localStorage.removeItem(PERFORMANCE_KEY);
    return localStorage.getItem(KEY) === '1' || localStorage.getItem(PERFORMANCE_KEY) === '1';
  } catch {
    return false;
  }
}

export class CoopDebugOverlay {
  private el: HTMLDivElement | null = null;
  private accum = 0;
  private frameTimeEmaMs = 1000 / 60;
  private worstFrameMs = 0;

  constructor(parent: HTMLElement) {
    if (!isCoopDebugEnabled()) return;

    const el = document.createElement('div');
    el.id = 'coop-debug-overlay';
    el.style.cssText = [
      'position:fixed', 'top:4px', 'left:4px', 'z-index:2147483647',
      'background:rgba(0,0,0,0.82)', 'color:#7CFC98',
      'font:11px/1.35 ui-monospace,Consolas,monospace',
      'padding:6px 8px', 'border:1px solid #2f7', 'border-radius:4px',
      'white-space:pre', 'pointer-events:none', 'max-width:60vw'
    ].join(';');
    parent.appendChild(el);
    this.el = el;
  }

  /** Called every frame; repaints a few times a second. */
  public update(dt: number, engine: SideViewEngine | null, waveIndex: number, dungeonIndex: number) {
    if (!this.el) return;
    const frameMs = Math.max(0, Math.min(250, dt * 1000));
    this.frameTimeEmaMs += (frameMs - this.frameTimeEmaMs) * 0.08;
    this.worstFrameMs = Math.max(this.worstFrameMs, frameMs);
    this.accum += dt;
    if (this.accum < 0.2) return;
    this.accum = 0;

    const s = network.stats;
    const alive = engine ? engine.enemies.filter(e => !e.isDead).length : 0;
    const total = engine ? engine.enemies.length : 0;
    const remotes = Object.values(network.remotePlayers);
    const sid = network.socket?.id ? network.socket.id.slice(0, 6) : '-';
    const room = network.room ? network.room.slice(-6) : 'none';

    // The two fields that matter most for the current class of bug.
    const role = network.isHost ? 'HOST' : 'GUEST';
    const mode = engine ? (engine.isTownMode ? 'TOWN' : 'DUNGEON') : '-';
    const performance = engine?.particles.getPerformanceMetrics();
    const fps = this.frameTimeEmaMs > 0 ? Math.min(999, 1000 / this.frameTimeEmaMs) : 0;
    const quality = performance?.quality.effective || '-';
    const activeVfx = performance?.active.spriteVfx || 0;
    const activeParticles = performance?.active.particles || 0;
    const residentImages = performance?.images.residentImages || 0;
    const frameLine = `fps ${fps.toFixed(0)}  avg ${this.frameTimeEmaMs.toFixed(1)}ms  worst ${this.worstFrameMs.toFixed(1)}ms`;
    this.worstFrameMs = 0;

    const remoteLines = remotes.length
      ? remotes.map(r =>
          `   ${(r.name || '?').slice(0, 8)} ${r.isTownMode ? 'TOWN' : 'DUNG'} ` +
          `x${Math.round(r.x)} ${r.animState || ''}`).join('\n')
      : '   (none visible)';

    this.el.textContent =
      `ROLE ${role}  (${s.lastRoleSource})\n` +
      `MODE ${mode}   D${dungeonIndex} W${waveIndex + 1}\n` +
      `room ${room}  sock ${sid}  conn ${network.socket?.connected ? 'y' : 'N'}\n` +
      `${frameLine}\n` +
      `vfx ${quality}  sprites ${activeVfx}  particles ${activeParticles}  images ${residentImages}\n` +
      `enemies ${alive}/${total}   syncs ${s.enemySyncCount}\n` +
      `skills  out ${s.skillsSent}  in ${s.skillsRecv}\n` +
      `dmg     sent ${s.lastDamageSent}  recv ${s.lastDamageRecv}  hit ${s.lastHitRecv}\n` +
      `party (${remotes.length}):\n${remoteLines}`;
  }

  public destroy() {
    this.el?.remove();
    this.el = null;
  }
}
