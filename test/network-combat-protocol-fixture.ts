import {
  NetworkManager,
  RUN_SYNC_MAX_BYTES,
  RUN_SYNC_PROTOCOL_VERSION,
  isBoundedDungeonRunState,
  type CombatDefenseResultPacket,
  type DungeonRunState,
  type FullSyncSnapshot,
} from '../src/sideview/network/NetworkManager';
import {
  isBoundedDungeonEncounterSnapshot,
  type DungeonEncounterSnapshot,
} from '../src/sideview/dungeons/DungeonEncounterRuntime';

class CaptureSocket {
  readonly emitted: Array<{ event: string; payload: any }> = [];

  emit(event: string, payload?: any) {
    this.emitted.push({ event, payload });
  }
}

export function createProtocolHarness(isHost: boolean) {
  const manager = new NetworkManager();
  const socket = new CaptureSocket();
  manager.socket = socket as any;
  manager.room = 'room:test';
  manager.isHost = isHost;
  return {
    manager,
    socket,
    sendRunSync: (runState: DungeonRunState, encounterSnapshot?: DungeonEncounterSnapshot) => (
      manager.sendRunSync(runState, encounterSnapshot)
    ),
    sendCombatDefense: (packet: CombatDefenseResultPacket) => manager.sendCombatDefense(packet),
    sendFullSync: (snapshot: Omit<FullSyncSnapshot, 'requesterId'>, groundY = 100) => (
      manager.sendFullSync('requester:test', snapshot, groundY)
    ),
    serializeEnemy: (enemy: any, groundY = 100) => (manager as any).serializeEnemy(enemy, groundY),
  };
}

export {
  RUN_SYNC_MAX_BYTES,
  RUN_SYNC_PROTOCOL_VERSION,
  isBoundedDungeonRunState,
  isBoundedDungeonEncounterSnapshot,
};
