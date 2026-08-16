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
      if (uuid && name) {
        this.socket?.emit('register_player', { uuid, name });
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

  public joinMatchmaking(dungeonId: string, onStart: (roomData: any) => void, onWait: (msg: string) => void) {
    if (!this.socket) this.connect();
    
    // Setup listeners once
    this.socket?.off('matchmaking_status');
    this.socket?.off('dungeon_start');

    this.socket?.on('matchmaking_status', (data) => {
      onWait(data.message);
    });

    this.socket?.on('dungeon_start', (data) => {
      this.room = data.roomId;
      onStart(data);
    });

    this.socket?.emit('join_matchmaking', { dungeonId });
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
