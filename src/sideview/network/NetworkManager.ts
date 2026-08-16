import { io, Socket } from 'socket.io-client';
import { PlayerState } from '../engine/SideViewEngine';

export class NetworkManager {
  public socket: Socket | null = null;
  public static instance: NetworkManager;
  public room: string | null = null;
  
  public remotePlayers: Record<string, {
    name: string;
    x: number;
    y: number;
    facing: number;
    isGrounded: boolean;
    isAttacking: boolean;
  }> = {};

  constructor() {
    NetworkManager.instance = this;
  }

  public connect() {
    if (this.socket) return;
    
    // Automatically switch between Localhost and Railway Live Server
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const SERVER_URL = isLocal ? 'http://localhost:3001' : 'https://rpgame-production-3453.up.railway.app';
    
    this.socket = io(SERVER_URL);

    this.socket.on('connect', () => {
      console.log('Connected to multiplayer server.');
      
      const uuid = localStorage.getItem('playerUUID');
      const name = localStorage.getItem('playerName');
      const shortId = localStorage.getItem('playerShortId');
      if (uuid && name && shortId) {
        this.socket?.emit('register_player', { uuid, name, shortId });
      }
    });

    this.socket.on('remote_player_move', (data) => {
      if (!this.remotePlayers[data.socketId]) {
        this.remotePlayers[data.socketId] = {
          name: 'Player', // Can be updated if we pass name
          x: data.x, y: data.y, facing: data.facing,
          isGrounded: data.isGrounded, isAttacking: data.isAttacking
        };
      } else {
        const p = this.remotePlayers[data.socketId];
        p.x = data.x;
        p.y = data.y;
        p.facing = data.facing;
        p.isGrounded = data.isGrounded;
        p.isAttacking = data.isAttacking;
      }
    });

    this.socket.on('player_left', (data) => {
      delete this.remotePlayers[data.socketId];
    });
  }

  public createLobby(dungeonId: string, onUpdate: (lobbyData: any) => void, onStart: (roomData: any) => void) {
    if (!this.socket) this.connect();
    
    this.socket?.off('lobby_update');
    this.socket?.off('dungeon_start');

    this.socket?.on('lobby_update', (data) => {
      onUpdate(data);
    });

    this.socket?.on('dungeon_start', (data) => {
      this.room = data.roomId;
      onStart(data);
    });

    const uuid = localStorage.getItem('playerUUID');
    const name = localStorage.getItem('playerName');
    const shortId = localStorage.getItem('playerShortId');
    this.socket?.emit('create_lobby', { dungeonId, uuid, name, shortId });
  }

  public invitePlayer(targetShortId: string, onResponse: (msg: string, success: boolean) => void) {
    if (!this.socket) return;
    const uuid = localStorage.getItem('playerUUID');
    const name = localStorage.getItem('playerName');
    const shortId = localStorage.getItem('playerShortId');
    this.socket.emit('send_invite', { targetShortId, uuid, name, shortId }, (response: { success: boolean, msg: string }) => {
      onResponse(response.msg, response.success);
    });
  }

  public acceptInvite(roomId: string, onStart: (roomData: any) => void) {
    if (!this.socket) this.connect();
    
    this.socket?.off('dungeon_start');
    this.socket?.on('dungeon_start', (data) => {
      this.room = data.roomId;
      onStart(data);
    });

    const uuid = localStorage.getItem('playerUUID');
    const name = localStorage.getItem('playerName');
    const shortId = localStorage.getItem('playerShortId');
    this.socket?.emit('accept_invite', { roomId, uuid, name, shortId });
  }

  public listenForInvites(onInviteReceived: (inviteData: { fromName: string, dungeonId: string, roomId: string }) => void) {
    if (!this.socket) this.connect();
    this.socket?.off('invite_received');
    this.socket?.on('invite_received', (data) => {
      onInviteReceived(data);
    });
  }

  public sendPlayerMove(playerState: PlayerState, isAttacking: boolean = false) {
    if (!this.socket || !this.room) return;
    this.socket.emit('player_move', {
      x: playerState.x,
      y: playerState.y,
      facing: playerState.facing,
      isGrounded: playerState.isGrounded,
      isAttacking
    });
  }
}

export const network = new NetworkManager();
