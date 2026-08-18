/**
 * Party voice chat.
 *
 * Peer to peer over WebRTC, with the game server doing nothing but introducing
 * the peers and carrying the handshake. Audio never touches the server, so it
 * costs no bandwidth there and does not care which scene the game is in - voice
 * belongs to the room, not to the lobby screen, which is why it survives
 * walking into a dungeon.
 *
 * A mesh rather than a mixer: with a party cap of four that is three
 * connections each at worst, and it needs no media server.
 */

type Signal =
  | { kind: 'offer'; sdp: RTCSessionDescriptionInit }
  | { kind: 'answer'; sdp: RTCSessionDescriptionInit }
  | { kind: 'ice'; candidate: RTCIceCandidateInit };

interface Peer {
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  name: string;
}

/** Public STUN only. A TURN server would be needed for strict NATs. */
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export class VoiceChat {
  private socket: any = null;
  private stream: MediaStream | null = null;
  private peers = new Map<string, Peer>();

  private micOn = false;
  private speakerOn = true;
  private joined = false;

  /** Called whenever mic/speaker/connection state changes, for the UI. */
  public onStateChange: (() => void) | null = null;
  /** Called with a human-readable problem, e.g. a refused microphone. */
  public onError: ((msg: string) => void) | null = null;

  public get isMicOn() { return this.micOn; }
  public get isSpeakerOn() { return this.speakerOn; }
  public get isJoined() { return this.joined; }
  public get peerCount() { return this.peers.size; }

  public attach(socket: any) {
    if (this.socket === socket) return;
    this.socket = socket;

    socket.on('voice_peers', ({ peers }: { peers: Array<{ socketId: string; name: string }> }) => {
      // We are the newcomer: we offer to everyone already there.
      peers.forEach((p) => this.connectTo(p.socketId, p.name, true));
    });

    socket.on('voice_peer_joined', ({ socketId, name }: { socketId: string; name: string }) => {
      // They will offer to us; prepare a connection to answer with.
      this.connectTo(socketId, name, false);
    });

    socket.on('voice_peer_left', ({ socketId }: { socketId: string }) => this.dropPeer(socketId));

    socket.on('voice_signal', async ({ from, signal }: { from: string; signal: Signal }) => {
      const peer = this.peers.get(from) || this.connectTo(from, 'Party', false);
      if (!peer) return;
      try {
        if (signal.kind === 'offer') {
          await peer.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          const answer = await peer.pc.createAnswer();
          await peer.pc.setLocalDescription(answer);
          this.send(from, { kind: 'answer', sdp: answer });
        } else if (signal.kind === 'answer') {
          await peer.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        } else if (signal.kind === 'ice') {
          await peer.pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      } catch (err) {
        console.warn('[VOICE] signal failed', err);
      }
    });
  }

  /**
   * Asks for the microphone and joins the room's voice mesh.
   *
   * The browser will not grant a microphone without a user gesture, so this is
   * only ever called from a button press.
   */
  public async join(): Promise<boolean> {
    if (this.joined) return true;
    if (!this.socket) return false;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
    } catch (err) {
      // Refused, or no microphone at all. Speaker-only is still useful, so this
      // is reported rather than thrown.
      this.onError?.('Microphone unavailable. You can still hear the party.');
      this.stream = null;
    }

    // Start muted: joining a call already transmitting is a surprise nobody wants.
    this.setMicOn(false);
    this.joined = true;
    this.socket.emit('voice_join');
    this.onStateChange?.();
    return true;
  }

  public leave() {
    this.socket?.emit('voice_leave');
    this.peers.forEach((_, id) => this.dropPeer(id));
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.joined = false;
    this.micOn = false;
    this.onStateChange?.();
  }

  public setMicOn(on: boolean) {
    this.micOn = on && Boolean(this.stream);
    // Disabling the track keeps the connection up but sends silence, which is
    // what a mute button should do - renegotiating on every toggle would drop
    // audio for a moment each time.
    this.stream?.getAudioTracks().forEach((t) => { t.enabled = this.micOn; });
    this.onStateChange?.();
  }

  public setSpeakerOn(on: boolean) {
    this.speakerOn = on;
    this.peers.forEach((p) => { p.audio.muted = !on; });
    this.onStateChange?.();
  }

  public toggleMic() { this.setMicOn(!this.micOn); }
  public toggleSpeaker() { this.setSpeakerOn(!this.speakerOn); }

  private send(to: string, signal: Signal) {
    this.socket?.emit('voice_signal', { to, signal });
  }

  private connectTo(socketId: string, name: string, initiator: boolean): Peer | null {
    if (this.peers.has(socketId)) return this.peers.get(socketId)!;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // One audio element per peer, so muting the speaker is a local decision
    // and does not tell the other side to stop sending.
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.muted = !this.speakerOn;
    audio.style.display = 'none';
    document.body.appendChild(audio);

    const peer: Peer = { pc, audio, name };
    this.peers.set(socketId, peer);

    this.stream?.getTracks().forEach((track) => pc.addTrack(track, this.stream!));

    pc.ontrack = (ev) => {
      audio.srcObject = ev.streams[0];
      audio.play().catch(() => { /* blocked until a gesture; the toggle provides one */ });
      this.onStateChange?.();
    };

    pc.onicecandidate = (ev) => {
      if (ev.candidate) this.send(socketId, { kind: 'ice', candidate: ev.candidate.toJSON() });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.dropPeer(socketId);
      this.onStateChange?.();
    };

    if (initiator) {
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer).then(() => this.send(socketId, { kind: 'offer', sdp: offer })))
        .catch((err) => console.warn('[VOICE] offer failed', err));
    }

    return peer;
  }

  private dropPeer(socketId: string) {
    const peer = this.peers.get(socketId);
    if (!peer) return;
    try { peer.pc.close(); } catch { /* already closed */ }
    peer.audio.srcObject = null;
    peer.audio.remove();
    this.peers.delete(socketId);
    this.onStateChange?.();
  }
}

/** One per page: voice outlives any single screen. */
export const voice = new VoiceChat();
