import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { PlayerState } from './SideViewEngine';
import { ItemData } from '../items/ItemDatabase';

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

  public static async saveGame(playerState: PlayerState, inventory: ItemData[], maxDungeonCleared: number) {
    try {
      const db = await this.initDB();
      // Only extract necessary state to save
      const stateToSave: any = {
        characterClass: { id: playerState.characterClass?.id, name: playerState.characterClass?.name },
        level: playerState.level,
        exp: playerState.exp,
        maxExp: playerState.maxExp,
        gold: playerState.gold,
      };

      await db.put('saveData', {
        playerState: stateToSave,
        inventory,
        maxDungeonCleared,
        lastUpdated: Date.now()
      }, 'slot1');
      console.log('Game saved successfully.');
    } catch (error) {
      console.error('Failed to save game:', error);
    }
  }

  public static async loadGame(): Promise<{
    playerState: Partial<PlayerState> | null;
    inventory: ItemData[];
    maxDungeonCleared: number;
  }> {
    try {
      const db = await this.initDB();
      const data = await db.get('saveData', 'slot1');
      if (data) {
        console.log('Game loaded successfully.');
        return {
          playerState: data.playerState,
          inventory: data.inventory,
          maxDungeonCleared: data.maxDungeonCleared || 0,
        };
      }
    } catch (error) {
      console.error('Failed to load game:', error);
    }
    return { playerState: null, inventory: [], maxDungeonCleared: 0 };
  }

  public static async deleteSave() {
    try {
      const db = await this.initDB();
      await db.delete('saveData', 'slot1');
      console.log('Save deleted.');
    } catch (error) {
      console.error('Failed to delete save:', error);
    }
  }
}
