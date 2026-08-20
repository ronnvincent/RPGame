import { NetworkManager } from '../src/sideview/network/NetworkManager';

class CaptureSocket {
  id = 'socket:test';
  connected = true;
  readonly emitted: Array<{ event: string; payload: unknown }> = [];

  emit(event: string, payload?: unknown) {
    this.emitted.push({ event, payload });
  }
}

class MemoryStorage {
  private values = new Map<string, string>([
    ['playerUUID', 'uuid:test-player'],
    ['playerName', 'Tester'],
    ['playerShortId', 'TEST01'],
  ]);

  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

export function exerciseLobbyStartFlow() {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: new MemoryStorage(),
  });

  const manager = new NetworkManager();
  const socket = new CaptureSocket();
  manager.socket = socket as any;

  let launchedDungeon = '';
  manager.onDungeonStart(data => { launchedDungeon = data.dungeonId; });

  // This is the sequence that used to replace the standing handler with the
  // empty callback passed by GameHUD.
  manager.createLobby('goblin_catacombs', 1);
  (manager as any).onDungeonStartCb?.({ dungeonId: 'goblin_catacombs' });

  const missingRoomResult = manager.startMatch();
  manager.room = 'room:test';
  const sentResult = manager.startMatch();

  return {
    launchedDungeon,
    missingRoomResult,
    sentResult,
    events: socket.emitted.map(item => item.event),
  };
}
