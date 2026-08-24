import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { PlayerState } from './SideViewEngine';
import { ItemData } from '../items/ItemDatabase';
import { getGameApiBase } from '../config/RuntimeConfig';

interface RpgSaveDB extends DBSchema {
  saveData: {
    key: string;
    value: {
      playerState: Partial<PlayerState>;
      inventory: ItemData[];
      maxDungeonCleared: number;
      lastUpdated: number;
    };
  };
}

export class SaveManager {
  private static dbPromise: Promise<IDBPDatabase<RpgSaveDB>>;

  public static async initDB() {
    if (!this.dbPromise) {
      this.dbPromise = openDB<RpgSaveDB>('rpg-save-db', 1, {
        upgrade(db) {
          if (!db.objectStoreNames.contains('saveData')) {
            db.createObjectStore('saveData');
          }
        },
      });
    }
    return this.dbPromise;
  }

  public static async saveGame(playerState: PlayerState, inventory: ItemData[], maxDungeonCleared: number, power: number = 0) {
    try {
      const db = await this.initDB();
      // Only extract necessary state to save
      const stateToSave: any = {
        characterClass: { id: playerState.characterClass?.id, name: playerState.characterClass?.name },
        level: playerState.level,
        exp: playerState.exp,
        maxExp: playerState.maxExp,
        gold: playerState.gold,
        diamonds: playerState.diamonds ?? 0,
        keysOfPower: playerState.keysOfPower ?? 0,
        unificationStones: playerState.unificationStones ?? 0,
        magicSubstance: playerState.magicSubstance ?? 0,
        // Equipment was never saved. Equipping moves an item OUT of the
        // inventory and into a slot, and only the inventory was persisted - so
        // the moment you equipped something and reloaded, it was gone from both
        // places at once. That is the whole of the reported loss.
        equipment: playerState.equipment,
        skillLevels: playerState.skillLevels,
        skillPoints: playerState.skillPoints,
        // Written into the save as well as into its own column. The column can
        // only ever hold what the newest client sent; the save is what every
        // client has always written, so a figure kept here can be read back for
        // anyone, including accounts that predate the column.
        power,
      };

      const saveData = {
        playerState: stateToSave,
        inventory,
        maxDungeonCleared,
        lastUpdated: Date.now()
      };

      const uuid = localStorage.getItem('playerUUID');
      // 1. Save locally
      await db.put('saveData', saveData, uuid || 'slot1');
      console.log('Game saved locally.');

      // 2. Sync to cloud
      if (uuid) {
        const API_URL = getGameApiBase();
        const sessionToken = localStorage.getItem('playerSessionToken');
        
        fetch(`${API_URL}/save`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
          },
          // Power travels with the save it was computed from, so the
          // leaderboard can never show a figure for state the server does not
          // have.
          body: JSON.stringify({
            uuid,
            saveData,
            power,
            className: playerState.characterClass?.name,
            level: playerState.level,
          })
        }).then(res => res.json()).then(data => {
           if(data.success) console.log('Game synced to Cloud DB.');
        }).catch(err => console.error('Cloud DB Sync failed:', err));
      }

    } catch (error) {
      console.error('Failed to save game:', error);
    }
  }

  public static async loadGame(): Promise<{
    playerState: Partial<PlayerState> | null;
    inventory: ItemData[];
    maxDungeonCleared: number;
  }> {
    const empty = { playerState: null, inventory: [], maxDungeonCleared: 0 };

    try {
      const uuid = localStorage.getItem('playerUUID');
      const db = await this.initDB();
      const local = await db.get('saveData', uuid || 'slot1');

      // The cloud is fetched, not trusted. The upload is fire and forget, so a
      // failed or slow sync leaves the server holding an older save - and this
      // used to take the cloud copy unconditionally and write it over the local
      // one, throwing away everything since the last upload that worked. That
      // is how a full inventory disappeared on a restart.
      let cloud: any = null;
      if (uuid) {
        const API_URL = getGameApiBase();
        try {
          const sessionToken = localStorage.getItem('playerSessionToken');
          const res = await fetch(`${API_URL}/load/${uuid}`, {
            headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {},
          });
          const body = await res.json();
          if (body.success && body.saveData) cloud = body.saveData;
        } catch {
          console.warn('Cloud load failed; using the local save.');
        }
      }

      const localAt = Number(local?.lastUpdated) || 0;
      const cloudAt = Number(cloud?.lastUpdated) || 0;
      const winner = cloudAt > localAt ? cloud : local;

      if (!winner) return empty;

      console.log(
        `Save loaded from ${winner === cloud ? 'cloud' : 'local'}` +
        ` (local ${localAt || 'none'}, cloud ${cloudAt || 'none'}).`
      );

      // Only write back when the cloud genuinely is ahead, so a stale copy
      // cannot become the local one and make the loss permanent.
      if (winner === cloud) await db.put('saveData', cloud, uuid || 'slot1');

      return {
        playerState: winner.playerState,
        inventory: winner.inventory || [],
        maxDungeonCleared: winner.maxDungeonCleared || 0,
      };
    } catch (error) {
      console.error('Failed to load game:', error);
    }
    return empty;
  }


  public static async deleteSave() {
    try {
      const uuid = localStorage.getItem('playerUUID');
      const db = await this.initDB();
      await db.delete('saveData', uuid || 'slot1');
      console.log('Save deleted.');
    } catch (error) {
      console.error('Failed to delete save:', error);
    }
  }
}
