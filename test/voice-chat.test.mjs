/**
 * Party voice: the server introduces peers and carries the handshake.
 *
 * The audio itself is peer to peer, so there is nothing here to test on the
 * wire except the introduction - which is the part that decides whether two
 * players in the same room can ever hear each other. It also has to survive a
 * scene change, since voice belongs to the room and not to the lobby screen.
 */
import { readFileSync } from 'node:fs';
import { io } from 'socket.io-client';

const URL = process.env.COOP_TEST_URL || 'http://localhost:3001';
const SLOW = !!process.env.COOP_TEST_URL;
const T = ms => (SLOW ? ms * 3 : ms);
const RUN = Math.random().toString(36).slice(2, 8);
const A = { uuid: `uuid-vca-${RUN}`, name: 'Talker', shortId: `VA${RUN}`.toUpperCase(), classId: 'mage', level: 5 };
const B = { uuid: `uuid-vcb-${RUN}`, name: 'Listener', shortId: `VB${RUN}`.toUpperCase(), classId: 'warrior', level: 5 };

let failures = 0;
const check = (l, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++; };
const connect = () => new Promise(r => { const s = io(URL, { forceNew: true, reconnection: false }); s.on('connect', () => r(s)); });
const waitFor = (s, ev, ms = T(1500)) => new Promise(res => {
  const t = setTimeout(() => res(null), ms);
  s.once(ev, d => { clearTimeout(t); res(d); });
});

const run = async () => {
  console.log('\n=== PARTY VOICE ===\n');

  const a = await connect(); a.emit('register_player', A);
  const b = await connect(); b.emit('register_player', B);
  await new Promise(r => setTimeout(r, T(250)));

  a.emit('create_lobby', { dungeonId: 'goblin_catacombs', minLevel: 1, ...A });
  const lobby = await waitFor(a, 'lobby_update');
  b.emit('accept_invite', { roomId: lobby.roomId, ...B });
  await new Promise(r => setTimeout(r, T(400)));

  // First in hears nobody.
  const aPeers = waitFor(a, 'voice_peers');
  a.emit('voice_join');
  const first = await aPeers;
  check('the first to join is told the call is empty', !!first && first.peers.length === 0);

  // Second in is told about the first, and the first is told someone arrived.
  const announced = waitFor(a, 'voice_peer_joined');
  const bPeers = waitFor(b, 'voice_peers');
  b.emit('voice_join');
  const second = await bPeers;
  const joinedMsg = await announced;

  check('the second to join is given the existing peer', !!second && second.peers.length === 1);
  check('and that peer is named', !!second && second.peers[0].name === 'Talker');
  check('the first is told someone joined', !!joinedMsg && joinedMsg.name === 'Listener');

  // The handshake is carried between them.
  const relayed = waitFor(b, 'voice_signal');
  a.emit('voice_signal', { to: b.id, signal: { kind: 'offer', sdp: { type: 'offer', sdp: 'test-sdp' } } });
  const sig = await relayed;
  check('a signal reaches the addressed peer', !!sig && sig.signal?.sdp?.sdp === 'test-sdp');
  check('and says who it came from', !!sig && sig.from === a.id);

  // Leaving is announced, so a dead connection is dropped rather than kept.
  const left = waitFor(a, 'voice_peer_left');
  b.emit('voice_leave');
  check('leaving the call is announced', !!(await left));

  [a, b].forEach(s => s.close());

  // Voice must not be torn down when the scene changes.
  const hud = readFileSync('src/sideview/ui/GameHUD.ts', 'utf8');
  const vc = readFileSync('src/sideview/network/VoiceChat.ts', 'utf8');
  check('the controls live in the HUD, so they survive entering a dungeon', /toggle-mic-btn/.test(hud) && /toggle-voice-btn/.test(hud));
  check('muting disables the track rather than dropping the connection', /t\.enabled = this\.micOn/.test(vc));
  check('the speaker mutes locally, per peer', /p\.audio\.muted = !on/.test(vc));

  // The three things that decide whether audio actually goes both ways.
  check('a signal arriving before joining is ignored, so the call cannot end up one-way',
        /if \(!this\.joined\) return;/.test(vc));
  check('with no microphone it still asks for a receive-only audio line',
        /addTransceiver\('audio', \{ direction: 'recvonly' \}\)/.test(vc));
  check('the peer count reports connected peers, not attempted ones',
        /connectionState === 'connected'/.test(vc));

  // The controls appear in two places and must agree with each other.
  const lobbyUi = readFileSync('src/sideview/ui/CoopLobbyUI.ts', 'utf8');
  check('the lobby panel has the same controls', /cl-mic/.test(lobbyUi) && /cl-spk/.test(lobbyUi));
  check('both screens observe one voice object', /addStateListener/.test(lobbyUi) && /addStateListener/.test(hud));
  check('several listeners are supported, so neither screen silences the other',
        /stateListeners = new Set/.test(vc));
  check('the lobby drops its old listener before repainting',
        /removeStateListener/.test(lobbyUi));

  console.log('');
  console.log(failures === 0 ? 'PARTY VOICE OK' : `PARTY VOICE FAILURES: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch(e => { console.error(e); process.exit(1); });
