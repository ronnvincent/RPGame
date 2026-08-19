/**
 * Co-op party lobby.
 *
 * Replaces the old inline "Creating lobby..." box that lived inside the World
 * Map. That box auto-started the run the moment anyone accepted an invite,
 * which is how a guest could end up creating a second lobby and silently
 * splitting the party. The lobby is an explicit place you sit in: slots,
 * ready-up, and a host-driven START.
 *
 * The layout follows the console-style staging screen it was asked to match:
 * a full-bleed dark stage, tabs across the top, your character standing large
 * on the left with the run's details listed under them, empty party slots as
 * crests to the right, and the controls as a key legend along the bottom.
 * Everything the old panel could do is still here - it moved into tabs rather
 * than being stacked in one column.
 */

import { network, LobbyState, LobbyMember, FriendEntry, OpenLobby } from '../network/NetworkManager';
import { voice } from '../network/VoiceChat';
import { CHARACTER_CLASSES } from '../classes/ClassDefinitions';
import { DUNGEONS } from '../dungeons/DungeonManager';
import { HERO_SPRITES, heroFrame } from '../engine/HeroSprites';
import { synergyFor } from '../network/PartySynergy';

const STYLE_ID = 'coop-lobby-style';
type Tab = 'party' | 'public' | 'friends';

function classOf(classId: string | null) {
  return CHARACTER_CLASSES.find(c => c.id === classId) || null;
}

/** Real sprite art for a class - the first skill icon, which always exists. */
function classIcon(classId: string | null): string | null {
  const cls = classOf(classId);
  return cls?.skills?.[0]?.iconImage || null;
}

export class CoopLobbyUI {
  private voiceRepaint: (() => void) | null = null;
  private root: HTMLDivElement | null = null;
  private state: LobbyState | null = null;
  private parent: HTMLElement;
  private onLaunch: () => void;
  private localReady = false;
  private friends: FriendEntry[] = [];
  private tab: Tab = 'party';
  private openLobbies: OpenLobby[] = [];
  /** Frame of the standing idle loop, advanced by a timer while open. */
  private idleFrame = 0;
  private idleTimer: number | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

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

    network.onLobbyList(lobbies => {
      this.openLobbies = lobbies;
      if (this.root && this.tab === 'public') this.render();
    });
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

    // The character on the stage breathes. A still frame reads as a loading
    // screen; the walk cycle is what makes the lobby feel like the game.
    this.idleTimer = window.setInterval(() => {
      this.idleFrame++;
      const img = this.root?.querySelector('.cl-hero-img') as HTMLImageElement | null;
      const src = this.heroIdleSrc();
      if (img && src) img.src = src;
    }, 110);
  }

  public close() {
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
    if (this.idleTimer !== null) {
      window.clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
    this.root?.remove();
    this.root = null;
  }

  /** Our own class, from the lobby if the server knows it or the save if not. */
  private myClassId(): string | null {
    const mine = this.state?.members.find(m => m.socketId === network.socket?.id);
    return mine?.classId || localStorage.getItem('lastClassId') || null;
  }

  /** Current frame of the idle loop, wrapped to whatever the class actually has. */
  private heroIdleSrc(): string | null {
    const cls = this.myClassId();
    if (!cls) return null;
    const set = HERO_SPRITES[cls];
    const frames = set?.anims?.idle || 1;
    return heroFrame(cls, 'idle', this.idleFrame % frames);
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
    const st = this.state;
    const max = st?.maxPlayers ?? 4;
    const members = st?.members ?? [];
    const dungeon = DUNGEONS.find(d => d.id === st?.dungeonId);
    const iAmHost = network.isHost;
    const everyoneReady = members.length > 0 && members.every(m => m.ready);
    const synergy = synergyFor(members);
    const heroSrc = this.heroIdleSrc();

    // Four cards, and yours is the first of them. Standing your character off
    // to the side of the stage separated you from the party you are forming -
    // the point of the screen is the four of you together.
    const me = members.find(m => m.socketId === network.socket?.id);
    const others = members.filter(m => m.socketId !== network.socket?.id);
    const crests: string[] = [this.crest(me, heroSrc)];
    for (let i = 0; i < max - 1; i++) {
      crests.push(others[i] ? this.crest(others[i]) : this.emptyCrest());
    }

    const action = iAmHost
      ? `<button class="cl-key cl-start" ${everyoneReady ? '' : 'disabled'}>
           <b>ENTER</b> ${everyoneReady ? 'Start Run' : 'Waiting for party'}
         </button>`
      : `<button class="cl-key ${this.localReady ? 'cl-unready' : 'cl-ready'}">
           <b>R</b> ${this.localReady ? 'Cancel Ready' : 'Ready'}
         </button>`;

    this.root.innerHTML = `
      <div class="cl-stage">
        <div class="cl-topo"></div>

        <div class="cl-tabs">
          <span class="cl-hint">Q</span>
          ${this.tabBtn('party', 'Party')}
          ${this.tabBtn('public', 'Public Games')}
          ${this.tabBtn('friends', 'Friends')}
          <span class="cl-hint">E</span>
        </div>

        <div class="cl-main">
          <div class="cl-left">
            <button class="cl-quick">QUICK JOIN</button>

            <div class="cl-facts">
              ${this.fact('Dungeon', dungeon ? dungeon.name : (st?.dungeonId || 'Not chosen'))}
              ${this.fact('Network', network.socket?.connected ? 'CONNECTED' : 'OFFLINE')}
              ${this.fact('Party', `${members.length}/${max}`)}
              ${this.fact('Bonus', synergy.label, synergy.id !== 'none')}
              ${this.fact('Your ID', localStorage.getItem('playerShortId') || '&mdash;')}
            </div>
          </div>

          <div class="cl-right">
            ${this.tab === 'party' ? `
              <div class="cl-crests">${crests.join('')}</div>
              <div class="cl-syn ${synergy.id !== 'none' ? 'on' : ''}">
                <div class="cl-syn-label">${synergy.label}</div>
                <div class="cl-syn-detail">${synergy.detail}</div>
                ${synergy.id !== 'none' ? `<div class="cl-syn-nums">
                  ${synergy.atk !== 1 ? `<span>ATK ${this.pct(synergy.atk)}</span>` : ''}
                  ${synergy.def !== 1 ? `<span>DEF ${this.pct(synergy.def)}</span>` : ''}
                  ${synergy.exp !== 1 ? `<span>EXP ${this.pct(synergy.exp)}</span>` : ''}
                </div>` : ''}
              </div>` : ''}

            ${this.tab === 'public' ? this.publicPanel() : ''}
            ${this.tab === 'friends' ? this.friendsPanel() : ''}
          </div>
        </div>

        <div class="cl-toast"></div>

        <div class="cl-foot">
          <button class="cl-key cl-leave"><b>ESC</b> Leave Party</button>
          <button class="cl-key cl-mic" title="Toggle Microphone"><b>M</b> Mic</button>
          <button class="cl-key cl-spk" title="Toggle Party Audio"><b>H</b> Audio</button>
          <div class="cl-foot-right">${action}</div>
        </div>
      </div>`;

    this.bind();
  }

  private pct(mult: number): string {
    const d = Math.round((mult - 1) * 100);
    return `${d > 0 ? '+' : ''}${d}%`;
  }

  private tabBtn(id: Tab, label: string): string {
    return `<button class="cl-tab ${this.tab === id ? 'on' : ''}" data-tab="${id}">${label}</button>`;
  }

  private fact(label: string, value: string, highlight = false): string {
    return `<div class="cl-fact">
      <span class="cl-fact-k">${label}</span>
      <span class="cl-fact-v ${highlight ? 'hot' : ''}">${value}</span>
    </div>`;
  }

  /**
   * A filled party slot. Yours gets your actual character standing in it -
   * animated, from the same idle loop the game uses - while everyone else's
   * shows their class mark, which is all the server gives us about them.
   */
  private crest(m: LobbyMember | undefined, heroSrc?: string | null): string {
    if (!m) return this.emptyCrest();
    const cls = classOf(m.classId);
    const icon = classIcon(m.classId);
    const accent = cls?.themeColor || '#6b7280';
    const state = m.isHost ? 'LEADER' : m.ready ? 'READY' : 'WAITING';
    const mine = m.socketId === network.socket?.id;
    const art = mine && heroSrc
      ? `<img class="cl-hero-img" src="${heroSrc}" alt="" />`
      : icon ? `<img src="${icon}" alt="" />` : '';
    return `
      <div class="cl-crest filled ${mine ? 'is-me' : ''} ${m.ready ? 'is-ready' : ''}" style="--accent:${accent}">
        <div class="cl-crest-art ${mine ? 'cl-crest-hero' : ''}">${art}</div>
        <div class="cl-crest-name">${m.name}${m.online ? '' : ' <i>(offline)</i>'}</div>
        <div class="cl-crest-meta">Lv ${m.level} &middot; ${cls ? cls.name : 'Choosing'}</div>
        ${m.power ? `<div class="cl-crest-power">${m.power.toLocaleString()} PWR</div>` : ''}
        <div class="cl-crest-state">${state}</div>
      </div>`;
  }

  private emptyCrest(): string {
    return `
      <div class="cl-crest empty">
        <div class="cl-crest-plus">&#10010;</div>
        <div class="cl-crest-meta">Open slot</div>
      </div>`;
  }

  private publicPanel(): string {
    const rows = this.openLobbies.length
      ? this.openLobbies.map(l => {
          const d = DUNGEONS.find(x => x.id === l.dungeonId);
          const host = `${l.hostName}&rsquo;s party`;
          return `
            <div class="cl-pub">
              <div class="cl-pub-meta">
                <div class="cl-pub-name">${d ? d.name : l.dungeonId}</div>
                <div class="cl-pub-sub">${host} &middot; Lv ${l.minLevel}+ &middot; ${l.members}/${l.maxPlayers}</div>
              </div>
              <button class="cl-mini cl-join" data-room="${l.roomId}">JOIN</button>
            </div>`;
        }).join('')
      : '<div class="cl-none">No open parties right now. Start one and others can find you.</div>';

    return `
      <div class="cl-pane">
        <div class="cl-pane-head">
          <span>OPEN PARTIES</span>
          <button class="cl-mini cl-refresh">REFRESH</button>
        </div>
        <div class="cl-pub-list">${rows}</div>
      </div>`;
  }

  private friendsPanel(): string {
    return `
      <div class="cl-pane">
        <div class="cl-pane-head"><span>INVITE BY ID</span></div>
        <div class="cl-row">
          <input class="cl-id" type="text" maxlength="6" placeholder="PLAYER ID" />
          <button class="cl-mini cl-inv">INVITE</button>
        </div>

        <div class="cl-pane-head"><span>FRIENDS</span></div>
        <div class="cl-row">
          <input class="cl-fid" type="text" maxlength="6" placeholder="ADD BY ID" />
          <button class="cl-mini cl-addf">ADD</button>
        </div>
        <div class="cl-friends">${this.friendRows()}</div>
      </div>`;
  }

  private friendRows(): string {
    if (!this.friends.length) {
      return '<div class="cl-none">No friends yet &mdash; add one by their Player ID.</div>';
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
            <div class="cl-fsub">Lv ${f.level}${cls ? ' &middot; ' + cls.name : ''} &middot; ${status}</div>
          </div>
          <button class="cl-mini cl-finv" data-uuid="${f.uuid}" ${canInvite ? '' : 'disabled'}>INVITE</button>
          <button class="cl-mini cl-frem" data-uuid="${f.uuid}" title="Remove">&#10005;</button>
        </div>`;
    }).join('');
  }

  private bind() {
    if (!this.root) return;

    const q = <T extends HTMLElement>(sel: string) => this.root!.querySelector(sel) as T | null;

    const micBtn = q<HTMLButtonElement>('.cl-mic');
    const spkBtn = q<HTMLButtonElement>('.cl-spk');

    const paintVoice = () => {
      if (micBtn) {
        micBtn.textContent = voice.isMicOn ? '🎙️ ON' : '🎙️ MUTED';
        micBtn.style.opacity = voice.isMicOn ? '1' : '0.55';
      }
      if (spkBtn) {
        const live = voice.peerCount;
        spkBtn.textContent = !voice.isSpeakerOn ? '🎧 OFF'
          : live > 0 ? `🎧 ${live}`
          : voice.attemptedPeers > 0 ? '🎧 …'
          : '🎧 ON';
        spkBtn.style.opacity = voice.isSpeakerOn ? '1' : '0.55';
      }
    };
    // Re-rendering replaces these buttons, so the old listener is dropped
    // before a new one is added or they accumulate on every repaint.
    if (this.voiceRepaint) voice.removeStateListener(this.voiceRepaint);
    this.voiceRepaint = paintVoice;
    voice.addStateListener(paintVoice);
    paintVoice();

    micBtn?.addEventListener('click', async () => {
      await voice.ensureJoined(network.socket);
      voice.toggleMic();
    });
    spkBtn?.addEventListener('click', async () => {
      await voice.ensureJoined(network.socket);
      voice.toggleSpeaker();
    });

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

    // Tabs. Switching to Public asks the server for the list rather than
    // showing whatever was fetched last time the tab happened to be opened.
    this.root.querySelectorAll<HTMLButtonElement>('.cl-tab').forEach(btn =>
      btn.addEventListener('click', () => this.setTab(btn.dataset.tab as Tab)));

    q<HTMLButtonElement>('.cl-quick')?.addEventListener('click', () => {
      this.toast('Looking for an open party...');
      network.quickJoin();
    });

    q<HTMLButtonElement>('.cl-refresh')?.addEventListener('click', () => network.browseLobbies());

    this.root.querySelectorAll<HTMLButtonElement>('.cl-join').forEach(btn =>
      btn.addEventListener('click', () => {
        const room = btn.dataset.room;
        if (room) network.acceptInvite(room);
      }));

    this.bindKeys();
  }

  private setTab(tab: Tab) {
    if (!tab || tab === this.tab) return;
    this.tab = tab;
    if (tab === 'public') network.browseLobbies();
    this.render();
  }

  /**
   * The key legend along the bottom is a promise that those keys work, so they
   * are bound rather than decorative. One listener, replaced on each render, or
   * they accumulate every time the lobby repaints.
   */
  private bindKeys() {
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    const order: Tab[] = ['party', 'public', 'friends'];
    this.keyHandler = (e: KeyboardEvent) => {
      if (!this.root) return;
      const typing = (e.target as HTMLElement)?.tagName === 'INPUT';
      if (typing) return;

      const at = order.indexOf(this.tab);
      if (e.code === 'KeyQ') this.setTab(order[(at + order.length - 1) % order.length]);
      else if (e.code === 'KeyE') this.setTab(order[(at + 1) % order.length]);
      else if (e.code === 'Escape') { network.leaveLobby(); this.close(); }
      else if (e.code === 'KeyM') { voice.ensureJoined(network.socket).then(() => voice.toggleMic()); }
      else if (e.code === 'KeyH') { voice.ensureJoined(network.socket).then(() => voice.toggleSpeaker()); }
      else if (e.code === 'KeyR' && !network.isHost) {
        this.localReady = !this.localReady;
        network.sendReady(this.localReady);
      } else if (e.code === 'Enter' && network.isHost) {
        network.startMatch();
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  private injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = `
      #coop-lobby {
        /* Fixed, not absolute: this is a whole screen, and it should not be
           able to be clipped or inset by whatever it happens to be parented to.
           The z-index clears the HUD layer beneath it. */
        position: fixed; inset: 0; z-index: 400;
        font-family: 'Outfit', sans-serif;
        color: #cfd3d8;
        background: #07080a;
      }

      .cl-stage {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        overflow: hidden;
        background:
          radial-gradient(120% 80% at 20% 40%, rgba(38,42,50,0.55) 0%, rgba(7,8,10,0) 60%),
          linear-gradient(180deg, #0b0d10 0%, #060709 100%);
      }

      /* The contour wash behind everything. Drawn as repeating conic slivers so
         it costs nothing to render and never tiles visibly. */
      .cl-topo {
        position: absolute; inset: -20%;
        pointer-events: none;
        opacity: 0.16;
        background-image:
          repeating-radial-gradient(circle at 22% 42%, transparent 0 38px, rgba(150,170,190,0.30) 38px 39px),
          repeating-radial-gradient(circle at 78% 66%, transparent 0 54px, rgba(150,170,190,0.22) 54px 55px);
      }

      .cl-tabs {
        position: relative;
        display: flex; align-items: center; justify-content: center;
        gap: 4px; padding: 12px 16px 10px;
        border-bottom: 1px solid rgba(255,255,255,0.07);
      }

      .cl-tab {
        background: none; border: none; cursor: pointer;
        padding: 6px 16px; border-radius: 3px;
        color: #8a9099;
        font-family: 'Outfit', sans-serif;
        font-size: 13px; font-weight: 600; letter-spacing: 0.4px;
      }
      .cl-tab:hover { color: #dfe4ea; }
      .cl-tab.on { color: #f5f7fa; background: rgba(255,255,255,0.09); }

      .cl-hint {
        width: 20px; height: 20px; margin: 0 8px;
        display: inline-flex; align-items: center; justify-content: center;
        border: 1px solid rgba(255,255,255,0.28); border-radius: 3px;
        font-size: 10px; font-weight: 700; color: #9aa1ab;
      }

      .cl-main {
        position: relative; flex: 1;
        display: grid; grid-template-columns: minmax(190px, 24%) 1fr;
        gap: 20px; padding: 18px 26px; min-height: 0;
      }

      .cl-left { display: flex; flex-direction: column; gap: 14px; min-height: 0; }

      .cl-quick {
        align-self: flex-start;
        padding: 11px 26px; margin-bottom: 6px; cursor: pointer;
        background: linear-gradient(180deg, #6b5320, #4a380f);
        border: 1px solid #caa04a; border-radius: 2px;
        color: #ffd98a;
        font-family: 'Cinzel', serif; font-weight: 800;
        font-size: 13px; letter-spacing: 1.6px;
      }
      .cl-quick:hover { background: linear-gradient(180deg, #86682a, #5b4514); }
      .cl-quick:active { transform: translateY(1px); }

      /* The character stands on the stage. Pixel art scaled hard, so smoothing
         must be off or it turns to mush at this size. */
      /* Your character stands inside your own card now, not off to the side of
         the stage. The sprite sheets are wide frames with the figure centred,
         so the frame is cropped to the figure rather than scaled to fit - at
         fit-size the character would be a quarter of the card. */
      .cl-crest-art.cl-crest-hero {
        width: 100%; height: 96px;
        overflow: hidden;
        display: flex; align-items: flex-end; justify-content: center;
      }
      .cl-crest-art img.cl-hero-img {
        height: 150px; width: auto; max-width: none;
        image-rendering: pixelated;
        filter: drop-shadow(0 8px 10px rgba(0,0,0,0.7));
      }

      .cl-facts { display: flex; flex-direction: column; gap: 3px; }
      .cl-fact { display: flex; gap: 12px; font-size: 11.5px; }
      .cl-fact-k { width: 74px; color: #6f7681; letter-spacing: 0.3px; }
      .cl-fact-v { color: #e3e7ec; font-weight: 700; letter-spacing: 0.5px; }
      .cl-fact-v.hot { color: #ffd98a; }

      .cl-right { display: flex; flex-direction: column; gap: 14px; min-height: 0; }

      .cl-crests { display: flex; gap: 14px; align-items: flex-start; flex-wrap: wrap; }

      /* The crest shape from the reference: a shield tapering to a point. */
      .cl-crest {
        /* Do not let the row squeeze them. A fourth card was added and flex
           items shrink by default, so at narrow widths all four collapsed to
           slivers rather than the row simply running out of space. */
        flex: none;
        width: 116px; min-height: 226px;
        padding: 14px 8px 22px;
        display: flex; flex-direction: column; align-items: center; gap: 5px;
        text-align: center;
        clip-path: polygon(0 0, 100% 0, 100% 82%, 50% 100%, 0 82%);
        background: rgba(255,255,255,0.035);
        border: 1px solid rgba(255,255,255,0.10);
      }
      .cl-crest.empty { color: #565c66; }
      .cl-crest-plus { font-size: 26px; opacity: 0.5; margin-top: 52px; }
      .cl-crest.filled {
        background: linear-gradient(180deg, rgba(255,255,255,0.07), rgba(0,0,0,0.35));
        box-shadow: inset 0 0 0 1px var(--accent, #6b7280);
      }
      .cl-crest.is-ready { box-shadow: inset 0 0 0 2px #4ade80; }
      /* Yours reads as yours at a glance across four near-identical cards. */
      .cl-crest.is-me { box-shadow: inset 0 0 0 2px #d4af37; }
      .cl-crest.is-me.is-ready { box-shadow: inset 0 0 0 2px #4ade80, inset 0 0 0 4px rgba(212,175,55,0.5); }
      .cl-crest-art { width: 52px; height: 52px; display: flex; align-items: center; justify-content: center; }
      .cl-crest-art img { width: 44px; height: 44px; image-rendering: pixelated; }
      .cl-crest-name { font-size: 12.5px; font-weight: 800; color: #eef1f5; }
      .cl-crest-name i { font-style: normal; color: #6f7681; font-size: 10px; }
      .cl-crest-meta { font-size: 10.5px; color: #8a9099; }
      .cl-crest-power { font-size: 10.5px; font-weight: 800; color: #ffd98a; letter-spacing: 0.5px; }
      .cl-crest-state {
        margin-top: auto; font-size: 9.5px; font-weight: 800;
        letter-spacing: 1px; color: #b9c0c9;
      }

      .cl-syn {
        padding: 10px 14px; max-width: 420px;
        border-left: 3px solid rgba(255,255,255,0.14);
        background: rgba(255,255,255,0.03);
      }
      .cl-syn.on { border-left-color: #ffd98a; background: rgba(120, 95, 30, 0.18); }
      .cl-syn-label { font-family: 'Cinzel', serif; font-weight: 800; font-size: 13px; letter-spacing: 1.2px; color: #e8ecf1; }
      .cl-syn.on .cl-syn-label { color: #ffd98a; }
      .cl-syn-detail { font-size: 11px; color: #8a9099; margin-top: 2px; }
      .cl-syn-nums { display: flex; gap: 12px; margin-top: 6px; }
      .cl-syn-nums span { font-size: 11px; font-weight: 800; color: #7dd3fc; }

      .cl-pane {
        flex: 1; min-height: 0; overflow-y: auto;
        max-width: 520px;
        background: rgba(255,255,255,0.025);
        border: 1px solid rgba(255,255,255,0.07);
        padding: 12px 14px;
      }
      .cl-pane-head {
        display: flex; align-items: center; justify-content: space-between;
        font-size: 10.5px; font-weight: 800; letter-spacing: 1.4px;
        color: #6f7681; margin: 4px 0 8px;
      }
      .cl-row { display: flex; gap: 8px; margin-bottom: 10px; }
      .cl-row input {
        flex: 1; padding: 8px 10px;
        background: rgba(0,0,0,0.45);
        border: 1px solid rgba(255,255,255,0.14);
        color: #e8ecf1; font-family: 'Outfit', sans-serif;
        font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase;
      }

      .cl-mini {
        padding: 7px 12px; cursor: pointer;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.16);
        color: #dfe4ea; font-family: 'Outfit', sans-serif;
        font-size: 10.5px; font-weight: 800; letter-spacing: 0.8px;
      }
      .cl-mini:hover { background: rgba(255,255,255,0.14); }
      .cl-mini:disabled { opacity: 0.35; cursor: default; }

      .cl-pub, .cl-friend {
        display: flex; align-items: center; gap: 10px;
        padding: 9px 10px; margin-bottom: 6px;
        background: rgba(0,0,0,0.28);
        border: 1px solid rgba(255,255,255,0.07);
      }
      .cl-pub-meta, .cl-fmeta { flex: 1; min-width: 0; }
      .cl-pub-name, .cl-fname { font-size: 12.5px; font-weight: 700; color: #e8ecf1; }
      .cl-pub-sub, .cl-fsub { font-size: 10.5px; color: #7c838d; }
      .cl-friend.is-off { opacity: 0.55; }
      .cl-dot { width: 7px; height: 7px; border-radius: 50%; background: #4b5563; }
      .cl-dot.on { background: #4ade80; }
      .cl-none { font-size: 11.5px; color: #6f7681; padding: 10px 2px; }

      .cl-foot {
        position: relative;
        display: flex; align-items: center; gap: 8px;
        padding: 10px 26px 14px;
        border-top: 1px solid rgba(255,255,255,0.07);
      }
      .cl-foot-right { margin-left: auto; }

      .cl-key {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 7px 12px; cursor: pointer;
        background: none; border: none;
        color: #9aa1ab; font-family: 'Outfit', sans-serif;
        font-size: 11.5px; font-weight: 600;
      }
      .cl-key:hover { color: #e8ecf1; }
      .cl-key b {
        display: inline-flex; align-items: center; justify-content: center;
        min-width: 22px; height: 20px; padding: 0 5px;
        border: 1px solid rgba(255,255,255,0.28); border-radius: 3px;
        font-size: 9.5px; font-weight: 800; color: #cfd3d8;
      }
      .cl-key:disabled { opacity: 0.4; cursor: default; }
      .cl-start:not(:disabled) { color: #ffd98a; }
      .cl-start:not(:disabled) b { border-color: #caa04a; color: #ffd98a; }
      .cl-ready { color: #4ade80; }
      .cl-ready b { border-color: #4ade80; color: #4ade80; }

      .cl-toast {
        position: absolute; left: 50%; bottom: 66px; transform: translateX(-50%);
        padding: 8px 16px; border-radius: 3px;
        background: rgba(0,0,0,0.85); border: 1px solid #caa04a;
        color: #ffd98a; font-size: 12px; font-weight: 600;
        opacity: 0; transition: opacity 0.25s; pointer-events: none;
        z-index: 5;
      }

      /* Landscape phones: the stage still works, but the crests have to shrink
         and the character cannot take a third of the width. */
      @media (max-width: 900px), (orientation: landscape) and (max-height: 500px) {
        .cl-main { grid-template-columns: minmax(140px, 22%) 1fr; gap: 12px; padding: 10px 14px; }
        .cl-tabs { padding: 8px 10px 6px; }
        .cl-tab { padding: 5px 10px; font-size: 11.5px; }
        .cl-quick { padding: 8px 16px; font-size: 11px; }
        .cl-crest { width: 78px; min-height: 168px; padding: 8px 4px 16px; }
        .cl-crest-art.cl-crest-hero { height: 72px; }
        .cl-crest-art img.cl-hero-img { height: 112px; }
        .cl-crest-plus { margin-top: 36px; font-size: 20px; }
        .cl-crest-art { width: 40px; height: 40px; }
        .cl-crest-art img { width: 34px; height: 34px; }
        .cl-crest-name { font-size: 11px; }
        .cl-crests { gap: 7px; }
        .cl-fact { font-size: 10.5px; }
        .cl-fact-k { width: 60px; }
        .cl-foot { padding: 8px 14px 10px; }
        .cl-key { padding: 6px 8px; font-size: 10.5px; }
      }
    `;
    document.head.appendChild(st);
  }
}
