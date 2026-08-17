/**
 * Co-op party lobby - MLBB-style.
 *
 * Replaces the old inline "Creating lobby..." box that lived inside the World
 * Map. That box auto-started the run the moment anyone accepted an invite,
 * which is how a guest could end up creating a second lobby and silently
 * splitting the party. The lobby is now an explicit place you sit in: slots,
 * ready-up, and a host-driven START.
 */

import { network, LobbyState, LobbyMember, FriendEntry } from '../network/NetworkManager';
import { CHARACTER_CLASSES } from '../classes/ClassDefinitions';
import { DUNGEONS } from '../dungeons/DungeonManager';

const STYLE_ID = 'coop-lobby-style';

function classOf(classId: string | null) {
  return CHARACTER_CLASSES.find(c => c.id === classId) || null;
}

/** Real sprite art for a class - the first skill icon, which always exists. */
function classIcon(classId: string | null): string | null {
  const cls = classOf(classId);
  return cls?.skills?.[0]?.iconImage || null;
}

export class CoopLobbyUI {
  private root: HTMLDivElement | null = null;
  private state: LobbyState | null = null;
  private parent: HTMLElement;
  private onLaunch: () => void;
  private localReady = false;
  private friends: FriendEntry[] = [];

  constructor(parent: HTMLElement, onLaunch: () => void) {
    this.parent = parent;
    this.onLaunch = onLaunch;

    network.onLobbyState(state => {
      this.state = state;
      if (state.started) {
        this.close();
        this.onLaunch();
      } else {
        this.render();
      }
    });

    network.onLobbyLeft(() => this.close());
    network.onLobbyError(msg => this.toast(msg));

    network.onFriends(friends => {
      this.friends = friends;
      if (this.root) this.render();
    });
    network.onFriendNotice(msg => this.toast(msg));
  }

  public get isOpen(): boolean {
    return !!this.root;
  }

  public open() {
    if (this.root) return;
    this.injectStyle();

    const root = document.createElement('div');
    root.id = 'coop-lobby';
    root.innerHTML = '<div class="cl-panel"><div class="cl-body">Opening party…</div></div>';
    this.parent.appendChild(root);
    this.root = root;
    network.requestFriends();
    this.render();
  }

  public close() {
    this.root?.remove();
    this.root = null;
  }

  private toast(msg: string) {
    const el = this.root?.querySelector('.cl-toast') as HTMLElement | null;
    if (!el) return;
    el.textContent = msg;
    el.style.opacity = '1';
    window.setTimeout(() => { el.style.opacity = '0'; }, 2600);
  }

  private render() {
    if (!this.root) return;
    const s = this.state;
    const max = s?.maxPlayers ?? 4;
    const members = s?.members ?? [];
    const dungeon = DUNGEONS.find(d => d.id === s?.dungeonId);
    const me = members.find(m => m.socketId === network.socket?.id);
    const iAmHost = network.isHost;
    const everyoneReady = members.every(m => m.ready);

    const slots: string[] = [];
    for (let i = 0; i < max; i++) {
      slots.push(members[i] ? this.slotCard(members[i]) : this.emptySlot());
    }

    const actionBtn = iAmHost
      ? `<button class="cl-btn cl-start" ${everyoneReady ? '' : 'disabled'}>
           ${everyoneReady ? 'START' : 'WAITING FOR PARTY'}
         </button>`
      : `<button class="cl-btn ${this.localReady ? 'cl-unready' : 'cl-ready'}">
           ${this.localReady ? 'CANCEL READY' : 'READY'}
         </button>`;

    this.root.innerHTML = `
      <div class="cl-panel">
        <div class="cl-head">
          <div>
            <div class="cl-title">PARTY</div>
            <div class="cl-sub">${dungeon ? dungeon.name : (s?.dungeonId || '—')}</div>
          </div>
          <div class="cl-count">${members.length}/${max}</div>
        </div>

        <div class="cl-slots">${slots.join('')}</div>

        <div class="cl-cols">
          <div class="cl-col">
            <div class="cl-label">INVITE BY ID</div>
            <div class="cl-invite">
              <input class="cl-id" type="text" maxlength="6" placeholder="PLAYER ID" />
              <button class="cl-btn cl-inv">INVITE</button>
            </div>
            <div class="cl-myid">Your ID: <b>${localStorage.getItem('playerShortId') || '—'}</b></div>
          </div>

          <div class="cl-col">
            <div class="cl-label">FRIENDS</div>
            <div class="cl-invite">
              <input class="cl-fid" type="text" maxlength="6" placeholder="ADD BY ID" />
              <button class="cl-btn cl-addf">ADD</button>
            </div>
            <div class="cl-friends">${this.friendRows()}</div>
          </div>
        </div>

        <div class="cl-toast"></div>

        <div class="cl-foot">
          <button class="cl-btn cl-leave">LEAVE PARTY</button>
          ${actionBtn}
        </div>
      </div>`;

    this.bind();
  }

  private slotCard(m: LobbyMember): string {
    const cls = classOf(m.classId);
    const icon = classIcon(m.classId);
    const accent = cls?.themeColor || '#6b7280';
    const badge = m.isHost
      ? '<div class="cl-badge cl-hostb">LEADER</div>'
      : m.ready
        ? '<div class="cl-badge cl-readyb">READY</div>'
        : '<div class="cl-badge cl-waitb">WAITING</div>';

    return `
      <div class="cl-slot ${m.ready ? 'is-ready' : ''}" style="--accent:${accent}">
        <div class="cl-portrait">
          ${icon ? `<img src="${icon}" alt="" />` : '<div class="cl-noart"></div>'}
        </div>
        <div class="cl-name">${m.name}${m.online ? '' : ' <span class="cl-off">(offline)</span>'}</div>
        <div class="cl-meta">Lv ${m.level} · ${cls ? cls.role : '—'}</div>
        <div class="cl-class">${cls ? cls.name : 'Choosing…'}</div>
        ${badge}
      </div>`;
  }

  private friendRows(): string {
    if (!this.friends.length) {
      return '<div class="cl-nofriends">No friends yet — add one by their Player ID.</div>';
    }
    return this.friends.map(f => {
      const cls = classOf(f.classId);
      const status = f.inParty ? 'In party' : f.online ? 'Online' : 'Offline';
      const canInvite = f.online && !f.inParty;
      return `
        <div class="cl-friend ${f.online ? '' : 'is-off'}">
          <span class="cl-dot ${f.online ? 'on' : ''}"></span>
          <div class="cl-fmeta">
            <div class="cl-fname">${f.name}</div>
            <div class="cl-fsub">Lv ${f.level}${cls ? ' · ' + cls.name : ''} · ${status}</div>
          </div>
          <button class="cl-mini cl-finv" data-uuid="${f.uuid}" ${canInvite ? '' : 'disabled'}>INVITE</button>
          <button class="cl-mini cl-frem" data-uuid="${f.uuid}" title="Remove">✕</button>
        </div>`;
    }).join('');
  }

  private emptySlot(): string {
    return `
      <div class="cl-slot cl-empty">
        <div class="cl-plus">+</div>
        <div class="cl-meta">Open slot</div>
      </div>`;
  }

  private bind() {
    if (!this.root) return;

    const q = <T extends HTMLElement>(sel: string) => this.root!.querySelector(sel) as T | null;

    q<HTMLButtonElement>('.cl-leave')?.addEventListener('click', () => {
      network.leaveLobby();
      this.close();
    });

    q<HTMLButtonElement>('.cl-start')?.addEventListener('click', () => network.startMatch());

    q<HTMLButtonElement>('.cl-ready')?.addEventListener('click', () => {
      this.localReady = true;
      network.sendReady(true);
    });
    q<HTMLButtonElement>('.cl-unready')?.addEventListener('click', () => {
      this.localReady = false;
      network.sendReady(false);
    });

    const input = q<HTMLInputElement>('.cl-id');
    const invite = () => {
      const id = (input?.value || '').trim().toUpperCase();
      if (id.length < 4) { this.toast('Enter a valid Player ID.'); return; }
      network.invitePlayer(id, (msg) => this.toast(msg));
      if (input) input.value = '';
    };
    q<HTMLButtonElement>('.cl-inv')?.addEventListener('click', invite);
    input?.addEventListener('keydown', e => { if (e.key === 'Enter') invite(); });

    const fInput = q<HTMLInputElement>('.cl-fid');
    const addFriend = () => {
      const id = (fInput?.value || '').trim().toUpperCase();
      if (id.length < 4) { this.toast('Enter a valid Player ID.'); return; }
      network.addFriend(id);
      if (fInput) fInput.value = '';
    };
    q<HTMLButtonElement>('.cl-addf')?.addEventListener('click', addFriend);
    fInput?.addEventListener('keydown', e => { if (e.key === 'Enter') addFriend(); });

    this.root.querySelectorAll<HTMLButtonElement>('.cl-finv').forEach(btn =>
      btn.addEventListener('click', () => network.inviteFriend(btn.dataset.uuid || '')));
    this.root.querySelectorAll<HTMLButtonElement>('.cl-frem').forEach(btn =>
      btn.addEventListener('click', () => network.removeFriend(btn.dataset.uuid || '')));
  }

  private injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = `
      #coop-lobby{position:fixed;inset:0;z-index:99998;display:flex;align-items:center;
        justify-content:center;background:rgba(6,4,12,.86);font-family:'Cinzel',serif;}
      #coop-lobby img{image-rendering:pixelated;}
      .cl-panel{width:min(920px,94vw);max-height:92vh;overflow:auto;padding:18px 20px 16px;
        background:#241a13;border:3px solid #6b4a24;border-radius:10px;
        box-shadow:0 0 0 3px #120c08, 0 18px 50px rgba(0,0,0,.7);color:#f5e7c8;}
      .cl-head{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:14px;}
      .cl-title{font-size:22px;letter-spacing:3px;color:#ffd77a;}
      .cl-sub{font-size:13px;opacity:.75;font-family:'Outfit',sans-serif;}
      .cl-count{font-size:18px;color:#ffd77a;}
      .cl-slots{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;}
      @media (max-width:700px){.cl-slots{grid-template-columns:repeat(2,1fr);}}
      .cl-slot{position:relative;background:#1a1209;border:2px solid #4a3320;
        border-radius:8px;padding:12px 8px 30px;text-align:center;
        border-top:3px solid var(--accent,#6b7280);min-height:150px;}
      .cl-slot.is-ready{box-shadow:0 0 0 2px rgba(126,231,150,.45) inset;}
      .cl-portrait{width:56px;height:56px;margin:0 auto 8px;display:flex;align-items:center;
        justify-content:center;background:#0e0906;border:2px solid #3a2a18;border-radius:6px;}
      .cl-portrait img{width:40px;height:40px;}
      .cl-noart{width:40px;height:40px;background:#241a13;}
      .cl-name{font-size:14px;color:#fff;}
      .cl-off{font-size:10px;color:#e57373;}
      .cl-meta{font-size:11px;opacity:.7;font-family:'Outfit',sans-serif;}
      .cl-class{font-size:12px;color:var(--accent,#aaa);margin-top:2px;}
      .cl-badge{position:absolute;left:0;right:0;bottom:0;padding:4px 0;font-size:10px;
        letter-spacing:2px;border-bottom-left-radius:5px;border-bottom-right-radius:5px;}
      .cl-hostb{background:#7a5a12;color:#ffe9a8;}
      .cl-readyb{background:#1f5c34;color:#b9f6ca;}
      .cl-waitb{background:#3a2a18;color:#c9b79a;}
      .cl-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;
        border-style:dashed;opacity:.5;padding-bottom:12px;}
      .cl-plus{font-size:30px;color:#8d7a5c;}
      .cl-cols{display:grid;grid-template-columns:1fr 1.2fr;gap:14px;margin-top:16px;}
      @media (max-width:700px){.cl-cols{grid-template-columns:1fr;}}
      .cl-label{font-size:11px;letter-spacing:2px;color:#c9a961;margin-bottom:6px;}
      .cl-myid{font-size:11px;opacity:.7;margin-top:6px;font-family:'Outfit',sans-serif;}
      .cl-myid b{color:#ffd77a;letter-spacing:2px;}
      .cl-friends{margin-top:8px;max-height:150px;overflow-y:auto;
        background:#150e08;border:2px solid #3a2a18;border-radius:6px;}
      .cl-nofriends{padding:14px 10px;font-size:11px;opacity:.6;text-align:center;
        font-family:'Outfit',sans-serif;}
      .cl-friend{display:flex;align-items:center;gap:8px;padding:7px 9px;
        border-bottom:1px solid #2a1e12;}
      .cl-friend:last-child{border-bottom:none;}
      .cl-friend.is-off{opacity:.5;}
      .cl-dot{width:8px;height:8px;border-radius:50%;background:#6b5a44;flex:none;}
      .cl-dot.on{background:#4ade80;box-shadow:0 0 6px #4ade80;}
      .cl-fmeta{flex:1;min-width:0;}
      .cl-fname{font-size:13px;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      .cl-fsub{font-size:10px;opacity:.65;font-family:'Outfit',sans-serif;}
      .cl-mini{padding:4px 8px;font-size:10px;letter-spacing:1px;border:1px solid #6b4a24;
        border-radius:4px;background:#3b2a16;color:#ffe9a8;cursor:pointer;font-family:'Cinzel',serif;}
      .cl-mini:hover{background:#4c3720;}
      .cl-mini:disabled{opacity:.35;cursor:not-allowed;}
      .cl-frem{color:#ffb4b4;border-color:#7a3a3a;background:#3a1f1f;}
      .cl-invite{display:flex;gap:8px;}
      .cl-id{flex:1;padding:9px;background:#0e0906;border:2px solid #4a3320;border-radius:5px;
        color:#fff;letter-spacing:3px;text-align:center;font-family:'Outfit',sans-serif;}
      .cl-id:focus{outline:none;border-color:#a1791f;}
      .cl-btn{padding:9px 16px;border:2px solid #6b4a24;border-radius:5px;background:#3b2a16;
        color:#ffe9a8;cursor:pointer;letter-spacing:2px;font-family:'Cinzel',serif;font-size:13px;}
      .cl-btn:hover{background:#4c3720;}
      .cl-btn:disabled{opacity:.45;cursor:not-allowed;}
      .cl-start{background:#1f5c34;border-color:#2e8b4f;color:#d6ffe4;}
      .cl-ready{background:#1f5c34;border-color:#2e8b4f;color:#d6ffe4;}
      .cl-unready{background:#5c1f1f;border-color:#8b2e2e;color:#ffd6d6;}
      .cl-leave{background:#3a1f1f;border-color:#7a3a3a;color:#ffc9c9;}
      .cl-foot{display:flex;justify-content:space-between;gap:10px;margin-top:14px;}
      .cl-toast{min-height:16px;margin-top:8px;font-size:12px;color:#ffd77a;opacity:0;
        transition:opacity .25s;font-family:'Outfit',sans-serif;text-align:center;}
    `;
    document.head.appendChild(st);
  }
}
