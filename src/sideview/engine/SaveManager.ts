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
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const API_URL = isLocal ? 'http://localhost:3001/api' : 'https://rpgame-production-3453.up.railway.app/api';
        
        fetch(`${API_URL}/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uuid, saveData })
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
    try {
      // 1. Try to fetch from cloud first
      const uuid = localStorage.getItem('playerUUID');
      if (uuid) {
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const API_URL = isLocal ? 'http://localhost:3001/api' : 'https://rpgame-production-3453.up.railway.app/api';
        
        try {
          const res = await fetch(`${API_URL}/load/${uuid}`);
          const cloudData = await res.json();
          if (cloudData.success && cloudData.saveData) {
             console.log('Game loaded from Cloud DB.');
             
             // Update local DB to match cloud DB
             const db = await this.initDB();
             await db.put('saveData', cloudData.saveData, uuid || 'slot1');
             
             return {
                playerState: cloudData.saveData.playerState,
                inventory: cloudData.saveData.inventory || [],
                maxDungeonCleared: cloudData.saveData.maxDungeonCleared || 0,
             };
          }
        } catch (e) {
          console.warn('Cloud DB load failed, falling back to Local DB.');
        }
      }

      // 2. Fallback to local DB
      const db = await this.initDB();
      const data = await db.get('saveData', uuid || 'slot1');
      if (data) {
        console.log('Game loaded from Local DB.');
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
      const uuid = localStorage.getItem('playerUUID');
      const db = await this.initDB();
      await db.delete('saveData', uuid || 'slot1');
      console.log('Save deleted.');
    } catch (error) {
      console.error('Failed to delete save:', error);
    }
  }
}
