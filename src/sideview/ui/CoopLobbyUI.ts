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
import {
  escapeHtml,
  escapeHtmlAttribute,
  finiteNumber,
  installModalFocusTrap,
  safeLocalAssetPath,
} from './UiSafety';

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
  private releaseFocus: (() => void) | null = null;

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
    root.className = 'rpg-screen';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'coop-lobby-title');
    root.innerHTML = '<div class="cl-panel"><div class="cl-body">Opening party...</div></div>';
    this.parent.appendChild(root);
    this.root = root;
    network.requestFriends();
    this.render();
    this.releaseFocus = installModalFocusTrap(root, {
      onEscape: () => {
        network.leaveLobby();
        this.close();
      },
      initialFocus: root.querySelector<HTMLButtonElement>('.cl-tab.on'),
    });

    // The character on the stage breathes. A still frame reads as a loading
    // screen; the walk cycle is what makes the lobby feel like the game.
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      || document.documentElement.dataset.rpgReducedMotion === 'true';
    if (!reducedMotion) this.idleTimer = window.setInterval(() => {
      this.idleFrame++;
      // Every card, each on its own class's frame count - querySelector took
      // the first one, so only the leftmost character ever animated.
      this.root?.querySelectorAll('.cl-hero-img').forEach((el) => {
        const img = el as HTMLImageElement;
        const next = this.heroIdleSrc(img.getAttribute('data-class'));
        if (next) img.src = next;
      });
    }, 110);
  }

  public close() {
    this.releaseFocus?.();
    this.releaseFocus = null;
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
    if (this.idleTimer !== null) {
      window.clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.voiceRepaint) {
      voice.removeStateListener(this.voiceRepaint);
      this.voiceRepaint = null;
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
  /**
   * The current idle frame for any class, not just ours.
   *
   * This took no argument and always answered for the local player, so a
   * teammate's card fell back to a small class mark while yours had a
   * character standing in it - the cards were not the same kind of thing.
   * Returns null for a class with no sprite set, and the caller falls back.
   */
  private heroIdleSrc(classId?: string | null): string | null {
    const cls = classId ?? this.myClassId();
    if (!cls) return null;
    const set = HERO_SPRITES[cls];
    if (!set) return null;
    const frames = set.anims?.idle || 1;
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
    const focused = this.root.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
    const focusKey = focused?.dataset.focusKey || '';
    const inviteDraft = (this.root.querySelector('.cl-id') as HTMLInputElement | null)?.value || '';
    const friendDraft = (this.root.querySelector('.cl-fid') as HTMLInputElement | null)?.value || '';
    const st = this.state;
    const max = Math.max(1, Math.min(4, Math.trunc(finiteNumber(st?.maxPlayers, 4))));
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
      ? `<button class="cl-key cl-start" type="button" data-focus-key="start" ${everyoneReady ? '' : 'disabled'}>
           <b>ENTER</b> ${everyoneReady ? 'Start Run' : 'Waiting for party'}
         </button>`
      : `<button class="cl-key ${this.localReady ? 'cl-unready' : 'cl-ready'}" type="button" data-focus-key="ready">
           <b>R</b> ${this.localReady ? 'Cancel Ready' : 'Ready'}
         </button>`;

    this.root.innerHTML = `
      <div class="cl-stage">
        <div class="cl-topo"></div>

        <header class="cl-titlebar">
          <div><p class="rpg-kicker">Expedition Staging</p><h1 class="rpg-title" id="coop-lobby-title">Party Lobby</h1></div>
          <div class="cl-room-status" role="status">${network.socket?.connected ? 'Connected' : 'Connection recovering'}</div>
        </header>

        <div class="cl-tabs" role="tablist" aria-label="Lobby sections">
          <span class="cl-hint">Q</span>
          ${this.tabBtn('party', 'Party')}
          ${this.tabBtn('public', 'Public Games')}
          ${this.tabBtn('friends', 'Friends')}
          <span class="cl-hint">E</span>
        </div>

        <div class="cl-main">
          <aside class="cl-left" aria-label="Expedition details">
            <button class="cl-quick" type="button" data-focus-key="quick">QUICK JOIN</button>

            <div class="cl-facts">
              ${this.fact('Dungeon', dungeon ? dungeon.name : (st?.dungeonId || 'Not chosen'))}
              ${this.fact('Network', network.socket?.connected ? 'CONNECTED' : 'OFFLINE')}
              ${this.fact('Party', `${members.length}/${max}`)}
              ${this.fact('Bonus', synergy.label, synergy.id !== 'none')}
              ${this.fact('Your ID', localStorage.getItem('playerShortId') || 'Not assigned')}
            </div>
          </aside>

          <section class="cl-right" aria-live="polite">
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
          </section>
        </div>

        <div class="cl-toast" role="status" aria-live="polite"></div>

        <div class="cl-foot">
          <button class="cl-key cl-leave" type="button" data-focus-key="leave"><b>ESC</b> Leave Party</button>
          <button class="cl-key cl-mic" type="button" data-focus-key="mic" title="Toggle Microphone"><b>M</b> Mic</button>
          <button class="cl-key cl-spk" type="button" data-focus-key="speaker" title="Toggle Party Audio"><b>H</b> Audio</button>
          <div class="cl-foot-right">${action}</div>
        </div>
      </div>`;

    this.bind();
    const invite = this.root.querySelector('.cl-id') as HTMLInputElement | null;
    const friend = this.root.querySelector('.cl-fid') as HTMLInputElement | null;
    if (invite) invite.value = inviteDraft;
    if (friend) friend.value = friendDraft;
    if (focusKey) requestAnimationFrame(() => this.root?.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus());
  }

  private pct(mult: number): string {
    const d = Math.round((mult - 1) * 100);
    return `${d > 0 ? '+' : ''}${d}%`;
  }

  private tabBtn(id: Tab, label: string): string {
    const active = this.tab === id;
    return `<button class="cl-tab ${active ? 'on' : ''}" type="button" role="tab" aria-selected="${active}" data-tab="${id}" data-focus-key="tab-${id}">${escapeHtml(label)}</button>`;
  }

  private fact(label: string, value: string, highlight = false): string {
    return `<div class="cl-fact">
      <span class="cl-fact-k">${escapeHtml(label)}</span>
      <span class="cl-fact-v ${highlight ? 'hot' : ''}">${escapeHtml(value)}</span>
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
    // Everyone stands in their own card. The class travels with the lobby
    // packet, so a teammate's sprite is as available as ours - it was simply
    // never asked for. data-class lets the idle loop advance each one on its
    // own frame count.
    const src = safeLocalAssetPath(mine ? (heroSrc ?? this.heroIdleSrc(m.classId)) : this.heroIdleSrc(m.classId));
    const iconPath = safeLocalAssetPath(icon);
    const classId = cls?.id || '';
    // A network class id must never be inserted raw as data-class="${m.classId...".
    const art = src
      ? `<img class="cl-hero-img" data-class="${escapeHtmlAttribute(classId)}" src="${escapeHtmlAttribute(src)}" alt="" />`
      : iconPath ? `<img src="${escapeHtmlAttribute(iconPath)}" alt="" />` : '';
    const level = Math.max(1, Math.trunc(finiteNumber(m.level, 1)));
    const power = Math.max(0, Math.trunc(finiteNumber(m.power)));
    return `
      <div class="cl-crest filled ${mine ? 'is-me' : ''} ${m.ready ? 'is-ready' : ''}" style="--accent:${accent}">
        <div class="cl-crest-art ${src ? 'cl-crest-hero' : ''}">${art}</div>
        <div class="cl-crest-name">${escapeHtml(m.name)}${m.online ? '' : ' <i>(offline)</i>'}</div>
        <div class="cl-crest-meta">Lv ${level} &middot; ${escapeHtml(cls ? cls.name : 'Choosing')}</div>
        ${power ? `<div class="cl-crest-power">${power.toLocaleString()} PWR</div>` : ''}
        <div class="cl-crest-state">${escapeHtml(state)}</div>
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
          const host = `${l.hostName}'s party`;
          const level = Math.max(1, Math.trunc(finiteNumber(l.minLevel, 1)));
          const members = Math.max(0, Math.trunc(finiteNumber(l.members)));
          const maximum = Math.max(1, Math.min(4, Math.trunc(finiteNumber(l.maxPlayers, 4))));
          return `
            <div class="cl-pub">
              <div class="cl-pub-meta">
                <div class="cl-pub-name">${escapeHtml(d ? d.name : l.dungeonId)}</div>
                <div class="cl-pub-sub">${escapeHtml(host)} &middot; Lv ${level}+ &middot; ${members}/${maximum}</div>
              </div>
              <button class="cl-mini cl-join" type="button" data-room="${escapeHtmlAttribute(l.roomId)}" data-focus-key="join-${escapeHtmlAttribute(l.roomId)}">JOIN</button>
            </div>`;
        }).join('')
      : '<div class="cl-none">No open parties right now. Start one and others can find you.</div>';

    return `
      <div class="cl-pane">
        <div class="cl-pane-head">
          <span>OPEN PARTIES</span>
          <button class="cl-mini cl-refresh" type="button" data-focus-key="refresh">REFRESH</button>
        </div>
        <div class="cl-pub-list">${rows}</div>
      </div>`;
  }

  private friendsPanel(): string {
    return `
      <div class="cl-pane">
        <div class="cl-pane-head"><span>INVITE BY ID</span></div>
        <div class="cl-row">
          <label class="rpg-visually-hidden" for="cl-invite-id">Player ID to invite</label>
          <input class="cl-id" id="cl-invite-id" type="text" maxlength="6" autocomplete="off" placeholder="PLAYER ID" data-focus-key="invite-id" />
          <button class="cl-mini cl-inv" type="button" data-focus-key="invite">INVITE</button>
        </div>

        <div class="cl-pane-head"><span>FRIENDS</span></div>
        <div class="cl-row">
          <label class="rpg-visually-hidden" for="cl-friend-id">Player ID to add as friend</label>
          <input class="cl-fid" id="cl-friend-id" type="text" maxlength="6" autocomplete="off" placeholder="ADD BY ID" data-focus-key="friend-id" />
          <button class="cl-mini cl-addf" type="button" data-focus-key="add-friend">ADD</button>
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
      const level = Math.max(1, Math.trunc(finiteNumber(f.level, 1)));
      const uuid = escapeHtmlAttribute(f.uuid);
      return `
        <div class="cl-friend ${f.online ? '' : 'is-off'}">
          <span class="cl-dot ${f.online ? 'on' : ''}"></span>
          <div class="cl-fmeta">
            <div class="cl-fname">${escapeHtml(f.name)}</div>
            <div class="cl-fsub">Lv ${level}${cls ? ' &middot; ' + escapeHtml(cls.name) : ''} &middot; ${escapeHtml(status)}</div>
          </div>
          <button class="cl-mini cl-finv" type="button" data-uuid="${uuid}" data-focus-key="friend-invite-${uuid}" ${canInvite ? '' : 'disabled'}>INVITE</button>
          <button class="cl-mini cl-frem" type="button" data-uuid="${uuid}" data-focus-key="friend-remove-${uuid}" title="Remove friend">&times;</button>
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
        micBtn.textContent = voice.isMicOn ? 'Mic On' : 'Mic Muted';
        micBtn.style.opacity = voice.isMicOn ? '1' : '0.55';
        micBtn.setAttribute('aria-pressed', String(voice.isMicOn));
      }
      if (spkBtn) {
        const live = voice.peerCount;
        spkBtn.textContent = !voice.isSpeakerOn ? 'Audio Off'
          : live > 0 ? `Audio ${live}`
          : voice.attemptedPeers > 0 ? 'Audio Connecting'
          : 'Audio On';
        spkBtn.style.opacity = voice.isSpeakerOn ? '1' : '0.55';
        spkBtn.setAttribute('aria-pressed', String(voice.isSpeakerOn));
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
        padding: 14px 32px; margin-bottom: 6px; cursor: pointer;
        background: linear-gradient(180deg, #6b5320, #4a380f);
        border: 1px solid #caa04a; border-radius: 2px;
        color: #ffd98a;
        font-family: 'Cinzel', serif; font-weight: 800;
        font-size: 15px; letter-spacing: 1.8px;
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
        width: 100%; height: 150px;
        overflow: hidden;
        display: flex; align-items: flex-end; justify-content: center;
      }
      .cl-crest-art img.cl-hero-img {
        height: 228px; width: auto; max-width: none;
        image-rendering: pixelated;
        filter: drop-shadow(0 8px 10px rgba(0,0,0,0.7));
      }

      .cl-facts { display: flex; flex-direction: column; gap: 3px; }
      .cl-fact { display: flex; gap: 12px; font-size: 11.5px; }
      .cl-fact-k { width: 74px; color: #6f7681; letter-spacing: 0.3px; }
      .cl-fact-v { color: #e3e7ec; font-weight: 700; letter-spacing: 0.5px; }
      .cl-fact-v.hot { color: #ffd98a; }

      .cl-right { display: flex; flex-direction: column; gap: 14px; min-height: 0; }

      /* The party tab had the crests pinned to the top of a tall column with
         the rest of it empty. They fill it now. Only this tab grows - the other
         two are lists, and a list stretched to fill reads as padding. */
      .cl-crests {
        display: flex; gap: 16px;
        align-items: stretch;
        justify-content: center;
        flex: 1; min-height: 0;
        max-height: 460px;
      }

      /* The crest shape from the reference: a shield tapering to a point. */
      .cl-crest {
        /* Do not let the row squeeze them. A fourth card was added and flex
           items shrink by default, so at narrow widths all four collapsed to
           slivers rather than the row simply running out of space. */
        flex: none;
        width: 150px; min-height: 0;
        padding: 14px 8px 22px;
        display: flex; flex-direction: column; align-items: center; gap: 5px;
        text-align: center;
        clip-path: polygon(0 0, 100% 0, 100% 82%, 50% 100%, 0 82%);
        background: rgba(255,255,255,0.035);
        border: 1px solid rgba(255,255,255,0.10);
      }
      .cl-crest.empty { color: #565c66; }
      .cl-crest-plus { font-size: 34px; opacity: 0.5; margin-top: auto; }
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
      .cl-crest-name { font-size: 14px; font-weight: 800; color: #eef1f5; }
      .cl-crest-name i { font-style: normal; color: #6f7681; font-size: 10px; }
      .cl-crest-meta { font-size: 11.5px; color: #8a9099; }
      .cl-crest-power { font-size: 12px; font-weight: 800; color: #ffd98a; letter-spacing: 0.5px; }
      .cl-crest-state {
        margin-top: auto; font-size: 11px; font-weight: 800;
        letter-spacing: 1px; color: #b9c0c9;
      }

      /* Centred under the crests rather than pinned to the left of a wide
         column. A left accent bar reads as lopsided once the block is centred,
         so the accent runs along the top instead. */
      .cl-syn {
        align-self: center;
        width: min(560px, 100%);
        padding: 11px 16px;
        text-align: center;
        border-top: 3px solid rgba(255,255,255,0.14);
        background: rgba(255,255,255,0.03);
      }
      .cl-syn.on { border-top-color: #ffd98a; background: rgba(120, 95, 30, 0.18); }
      .cl-syn-label { font-family: 'Cinzel', serif; font-weight: 800; font-size: 13px; letter-spacing: 1.2px; color: #e8ecf1; }
      .cl-syn.on .cl-syn-label { color: #ffd98a; }
      .cl-syn-detail { font-size: 11px; color: #8a9099; margin-top: 2px; }
      .cl-syn-nums { display: flex; gap: 12px; margin-top: 6px; justify-content: center; }
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

      /* No keyboard, no key caps. The footer legend told a phone to press ESC
         and ENTER, which that device does not have - the buttons themselves are
         tappable, so only the label is worth showing there. */
      @media (hover: none) and (pointer: coarse) {
        .cl-key b { display: none; }
        /* Every footer action becomes a real target, not a line of text with a
           key cap next to it. A phone has nothing to press ESC or ENTER with,
           so these are the only way to leave or start from one. */
        .cl-key {
          gap: 0;
          padding: 10px 18px;
          font-weight: 800;
          font-size: 12.5px;
          border: 1px solid rgba(255,255,255,0.28);
          border-radius: 4px;
          background: rgba(255,255,255,0.06);
        }
        .cl-key:active { background: rgba(255,255,255,0.14); }
        .cl-start:not(:disabled), .cl-ready {
          border-color: currentColor;
          background: rgba(212, 175, 55, 0.16);
        }
        .cl-foot { gap: 10px; padding: 10px 14px 12px; }
      }
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
        .cl-crest { width: 96px; min-height: 0; padding: 10px 5px 18px; }
        .cl-crest-art.cl-crest-hero { height: 104px; }
        .cl-crest-art img.cl-hero-img { height: 158px; }
        .cl-crest-plus { margin-top: 36px; font-size: 20px; }
        .cl-crest-art { width: 40px; height: 40px; }
        .cl-crest-art img { width: 34px; height: 34px; }
        .cl-crest-name { font-size: 12px; }
        .cl-crests { gap: 9px; max-height: none; }
        .cl-fact { font-size: 10.5px; }
        .cl-fact-k { width: 60px; }
        .cl-foot { padding: 8px 14px 10px; }
        .cl-key { padding: 6px 8px; font-size: 10.5px; }
      }

      /* Shared dark-fantasy treatment. Runtime Kenney borders supply the
         pixel frame while the staging layout and interaction hooks stay put. */
      #coop-lobby { padding: 0; background: #05070a; }
      .cl-stage {
        padding: max(8px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right))
          max(8px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left));
        background: radial-gradient(circle at 50% 20%, rgba(82,54,108,.2), transparent 44%), linear-gradient(#0b0e14,#05070a);
      }
      .cl-titlebar {
        position: relative; display: flex; align-items: flex-start; justify-content: space-between;
        gap: 12px; padding: 8px 18px 2px;
      }
      .cl-titlebar p { margin: 0 0 2px; }
      .cl-room-status { color: #9dd8ac; font-size: 11px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
      .cl-tabs { border-bottom-color: rgba(231,189,85,.24); }
      .cl-tab { min-height: 44px; border: 1px solid transparent; }
      .cl-tab.on { color: var(--rpg-gold-bright); border-color: rgba(231,189,85,.45); background: rgba(231,189,85,.1); }
      .cl-quick { min-height: 48px; color: #171006; background: linear-gradient(#ffe39a,#d8a83b 52%,#a66f20 53%); box-shadow: 0 4px #07080b; }
      .cl-pane, .cl-crest, .cl-syn {
        border: 10px solid transparent;
        border-image: url('/assets/runtime/ui/fantasy-borders/default-panel/panel-016.png') 16 / 10px / 0 stretch;
        image-rendering: pixelated;
      }
      .cl-crest { border-width: 8px; border-image-width: 8px; }
      .cl-mini, .cl-key { min-height: 44px; touch-action: manipulation; }
      .cl-mini { color: var(--rpg-paper); border-color: rgba(231,189,85,.32); background: linear-gradient(#302c34,#15161d); }
      .cl-row input { min-height: 44px; border-color: rgba(231,189,85,.34); }
      .cl-foot { border-top-color: rgba(231,189,85,.2); background: rgba(5,7,10,.76); }

      @media (pointer: coarse) {
        .cl-tab, .cl-mini, .cl-key, .cl-quick, .cl-row input { min-height: 48px; }
      }

      @media (orientation: portrait), (max-width: 620px) {
        .cl-stage { overflow-y: auto; }
        .cl-titlebar { padding: 5px 8px 0; }
        .cl-titlebar .rpg-title { font-size: 1.15rem; }
        .cl-tabs { justify-content: flex-start; overflow-x: auto; padding-inline: 4px; }
        .cl-hint { display: none; }
        .cl-main { flex: none; display: flex; flex-direction: column; gap: 9px; padding: 8px 5px; min-height: auto; }
        .cl-left { display: grid; grid-template-columns: auto 1fr; align-items: start; gap: 8px; }
        .cl-quick { padding: 9px 13px; margin: 0; font-size: 11px; }
        .cl-facts { display: grid; grid-template-columns: 1fr 1fr; }
        .cl-fact { gap: 5px; }
        .cl-fact-k { width: auto; }
        .cl-right { min-height: 380px; }
        .cl-crests { justify-content: flex-start; min-height: 270px; overflow-x: auto; padding-bottom: 5px; }
        .cl-crest { width: 126px; min-height: 250px; }
        .cl-crest-art.cl-crest-hero { height: 120px; }
        .cl-crest-art img.cl-hero-img { height: 184px; }
        .cl-pane { width: 100%; max-width: none; min-height: 300px; }
        .cl-foot { position: sticky; bottom: 0; flex-wrap: wrap; padding: 8px 5px; z-index: 4; }
        .cl-foot-right { margin-left: 0; }
        .cl-toast { position: fixed; bottom: max(72px, env(safe-area-inset-bottom)); }
      }
    `;
    document.head.appendChild(st);
  }
}
