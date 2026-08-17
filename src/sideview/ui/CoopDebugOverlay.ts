/**
 * Co-op diagnostic overlay.
 *
 * Shows the live multiplayer state on screen so a desync can be read off both
 * devices at once instead of guessed at. Hidden unless explicitly enabled.
 *
 * Enable:  add ?coopdebug=1 to the URL, or run
 *          localStorage.setItem('rpg_debug_multiplayer','1') then reload.
 * Disable: ?coopdebug=0, or remove the key.
 */

import { network } from '../network/NetworkManager';
import { SideViewEngine } from '../engine/SideViewEngine';

const KEY = 'rpg_debug_multiplayer';

export function isCoopDebugEnabled(): boolean {
  try {
    const param = new URLSearchParams(window.location.search).get('coopdebug');
    if (param === '1') localStorage.setItem(KEY, '1');
    if (param === '0') localStorage.removeItem(KEY);
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export class CoopDebugOverlay {
  private el: HTMLDivElement | null = null;
  private accum = 0;

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

    const remoteLines = remotes.length
      ? remotes.map(r =>
          `   ${(r.name || '?').slice(0, 8)} ${r.isTownMode ? 'TOWN' : 'DUNG'} ` +
          `x${Math.round(r.x)} ${r.animState || ''}`).join('\n')
      : '   (none visible)';

    this.el.textContent =
      `ROLE ${role}  (${s.lastRoleSource})\n` +
      `MODE ${mode}   D${dungeonIndex} W${waveIndex + 1}\n` +
      `room ${room}  sock ${sid}  conn ${network.socket?.connected ? 'y' : 'N'}\n` +
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
