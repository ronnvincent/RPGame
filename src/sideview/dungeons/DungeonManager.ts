/**
 * Dungeon Manager, Waves, Enemy AI & Multi-Phase Bosses
 */

import { ItemData, getRandomLoot } from '../items/ItemDatabase';

export interface EnemyStats {
  name: string;
  type: 'mob' | 'elite' | 'boss';
  icon: string;
  color: string;
  maxHp: number;
  hp: number;
  atk: number;
  def: number;
  speed: number;
  expReward: number;
  goldReward: number;
  width: number;
  height: number;
  attackRange: number;
  attackCooldown: number;
  attackTimer: number;
  // Boss Phase mechanics
  phases?: number;
  currentPhase?: number;
  specialAttackTimer?: number;
}


export interface EnemyInstance extends EnemyStats {
  id: string;
  x: number;
  y: number;
  isActive: boolean;
  spawnDelay: number;
  vx: number;
  vy: number;
  isGrounded: boolean;
  facing: number; // 1 = right, -1 = left
  isAttacking: boolean;
  hitStun: number;
  isDead: boolean;
  lootDrop?: ItemData;
}

export interface DungeonWave {
  waveNumber: number;
  enemies: {
    name: string;
    type: 'mob' | 'elite' | 'boss';
    icon: string;
    color: string;
    maxHp: number;
    atk: number;
    def: number;
    speed: number;
    expReward: number;
    goldReward: number;
    width: number;
    height: number;
    count: number;
    phases?: number;
  }[];
}

export interface DungeonDefinition {
  id: string;
  name: string;
  subtitle: string;
  theme: BattleTheme;
  backgroundGradient: [string, string];
  platformColor: string;
  ambientParticles: string;
  waves: DungeonWave[];
}

export type BattleTheme = 'catacombs' | 'crypt' | 'inferno' | 'void';

export const DUNGEONS: DungeonDefinition[] = [
  // --- 1. GOBLIN CATACOMBS ---
  {
    id: 'goblin_catacombs',
    name: 'Goblin Catacombs',
    subtitle: 'Underground tunnels infested with goblin thieves and shamans.',
    theme: 'catacombs',
    backgroundGradient: ['#1a2a1a', '#0a140a'],
    platformColor: '#2e4c2e',
    ambientParticles: '#81c784',
    waves: [
      {
        waveNumber: 1,
        enemies: [
          { name: 'Green Slime', type: 'mob', icon: '🟢', color: '#4caf50', maxHp: 120, atk: 15, def: 5, speed: 2.2, expReward: 30, goldReward: 15, width: 36, height: 32, count: 4 }
        ]
      },
      {
        waveNumber: 2,
        enemies: [
          { name: 'Goblin Rogue', type: 'mob', icon: '👺', color: '#689f38', maxHp: 180, atk: 22, def: 8, speed: 3.5, expReward: 50, goldReward: 25, width: 38, height: 48, count: 3 },
          { name: 'Goblin Shaman', type: 'mob', icon: '🧙‍♂️', color: '#33691e', maxHp: 150, atk: 28, def: 6, speed: 2.0, expReward: 60, goldReward: 35, width: 38, height: 48, count: 2 }
        ]
      },
      {
        waveNumber: 3,
        enemies: [
          { name: 'Orc Berserker', type: 'elite', icon: '👹', color: '#d84315', maxHp: 450, atk: 38, def: 18, speed: 2.8, expReward: 150, goldReward: 90, width: 52, height: 60, count: 1 },
          { name: 'Green Slime', type: 'mob', icon: '🟢', color: '#4caf50', maxHp: 140, atk: 18, def: 6, speed: 2.4, expReward: 35, goldReward: 20, width: 36, height: 32, count: 3 }
        ]
      },
      {
        waveNumber: 4,
        enemies: [
          { name: 'Chief Warlord Grimjaw', type: 'boss', icon: '👑', color: '#2e7d32', maxHp: 1400, atk: 52, def: 25, speed: 3.0, expReward: 500, goldReward: 350, width: 68, height: 80, count: 1, phases: 2 }
        ]
      }
    ]
  },

  // --- 2. CRYPT OF THE DAMNED ---
  {
    id: 'undead_crypt',
    name: 'Crypt of the Damned',
    subtitle: 'Ancient resting place of undead skeletons and spectral wraiths.',
    theme: 'crypt',
    backgroundGradient: ['#1c102a', '#080410'],
    platformColor: '#3c245c',
    ambientParticles: '#ba68c8',
    waves: [
      {
        waveNumber: 1,
        enemies: [
          { name: 'Skeleton Warrior', type: 'mob', icon: '💀', color: '#e0e0e0', maxHp: 220, atk: 28, def: 12, speed: 2.8, expReward: 65, goldReward: 35, width: 40, height: 50, count: 4 }
        ]
      },
      {
        waveNumber: 2,
        enemies: [
          { name: 'Crypt Wraith', type: 'mob', icon: '👻', color: '#9c27b0', maxHp: 200, atk: 35, def: 10, speed: 3.8, expReward: 80, goldReward: 45, width: 42, height: 52, count: 3 },
          { name: 'Vampire Bat', type: 'mob', icon: '🦇', color: '#4a148c', maxHp: 160, atk: 25, def: 8, speed: 4.2, expReward: 70, goldReward: 40, width: 36, height: 30, count: 3 }
        ]
      },
      {
        waveNumber: 3,
        enemies: [
          { name: 'Death Knight', type: 'elite', icon: '🛡️', color: '#311b92', maxHp: 650, atk: 48, def: 28, speed: 3.2, expReward: 240, goldReward: 160, width: 56, height: 65, count: 1 },
          { name: 'Skeleton Archer', type: 'mob', icon: '🏹', color: '#b0bec5', maxHp: 180, atk: 32, def: 10, speed: 2.5, expReward: 75, goldReward: 45, width: 38, height: 48, count: 2 }
        ]
      },
      {
        waveNumber: 4,
        enemies: [
          { name: 'Arch-Lich Malakar', type: 'boss', icon: '☠️', color: '#7b1fa2', maxHp: 2200, atk: 65, def: 30, speed: 3.4, expReward: 800, goldReward: 600, width: 72, height: 85, count: 1, phases: 3 }
        ]
      }
    ]
  },

  // --- 3. INFERNO DRAGON LAIR ---
  {
    id: 'dragon_lair',
    name: "Inferno Dragon's Lair",
    subtitle: 'Molten depths filled with fire imps, magma golems, and an ancient red dragon.',
    theme: 'inferno',
    backgroundGradient: ['#2e0c05', '#100302'],
    platformColor: '#5c1b0d',
    ambientParticles: '#ff7043',
    waves: [
      {
        waveNumber: 1,
        enemies: [
          { name: 'Fire Imp', type: 'mob', icon: '🔥', color: '#ff5722', maxHp: 280, atk: 36, def: 14, speed: 3.6, expReward: 90, goldReward: 55, width: 38, height: 42, count: 4 }
        ]
      },
      {
        waveNumber: 2,
        enemies: [
          { name: 'Hell Hound', type: 'mob', icon: '🐕', color: '#bf360c', maxHp: 320, atk: 44, def: 18, speed: 4.4, expReward: 120, goldReward: 75, width: 48, height: 38, count: 3 },
          { name: 'Magma Golem', type: 'elite', icon: '🗿', color: '#e64a19', maxHp: 850, atk: 55, def: 38, speed: 2.0, expReward: 300, goldReward: 200, width: 62, height: 72, count: 1 }
        ]
      },
      {
        waveNumber: 3,
        enemies: [
          { name: 'Inferno Titan', type: 'elite', icon: '🌋', color: '#b71c1c', maxHp: 1100, atk: 62, def: 42, speed: 2.6, expReward: 450, goldReward: 320, width: 65, height: 78, count: 1 },
          { name: 'Fire Imp', type: 'mob', icon: '🔥', color: '#ff5722', maxHp: 300, atk: 38, def: 15, speed: 3.8, expReward: 100, goldReward: 60, width: 38, height: 42, count: 3 }
        ]
      },
      {
        waveNumber: 4,
        enemies: [
          { name: 'Ancient Red Dragon Ignis', type: 'boss', icon: '🐉', color: '#d50000', maxHp: 3500, atk: 80, def: 45, speed: 3.8, expReward: 1500, goldReward: 1200, width: 95, height: 95, count: 1, phases: 3 }
        ]
      }
    ]
  },

  // --- 4. THE VOID NEXUS ---
  {
    id: 'void_nexus',
    name: 'The Void Nexus',
    subtitle: 'Cosmic rift where NightBorne channels the shattered runes into a total eclipse.',
    theme: 'void',
    backgroundGradient: ['#1a0b2e', '#06020c'],
    platformColor: '#3d1c5e',
    ambientParticles: '#c084fc',
    waves: [
      {
        waveNumber: 1,
        enemies: [
          { name: 'Nether Stalker', type: 'mob', icon: '👤', color: '#a855f7', maxHp: 380, atk: 46, def: 20, speed: 4.0, expReward: 140, goldReward: 85, width: 42, height: 50, count: 4 }
        ]
      },
      {
        waveNumber: 2,
        enemies: [
          { name: 'Void Imp', type: 'mob', icon: '🔮', color: '#7c3aed', maxHp: 340, atk: 50, def: 16, speed: 4.2, expReward: 160, goldReward: 95, width: 38, height: 44, count: 3 },
          { name: 'Crypt Wraith', type: 'mob', icon: '👻', color: '#9c27b0', maxHp: 320, atk: 48, def: 18, speed: 3.8, expReward: 150, goldReward: 90, width: 42, height: 52, count: 2 }
        ]
      },
      {
        waveNumber: 3,
        enemies: [
          { name: 'Void Colossus', type: 'elite', icon: '🌌', color: '#6d28d9', maxHp: 1500, atk: 72, def: 48, speed: 2.4, expReward: 600, goldReward: 400, width: 70, height: 80, count: 1 },
          { name: 'Nether Stalker', type: 'mob', icon: '👤', color: '#a855f7', maxHp: 400, atk: 48, def: 22, speed: 4.0, expReward: 150, goldReward: 90, width: 42, height: 50, count: 3 }
        ]
      },
      {
        waveNumber: 4,
        enemies: [
          { name: 'NightBorne Void Overlord', type: 'boss', icon: '👑', color: '#4c1d95', maxHp: 5200, atk: 95, def: 52, speed: 4.2, expReward: 3000, goldReward: 2500, width: 88, height: 96, count: 1, phases: 3 }
        ]
      }
    ]
  },

  // --- 5. ENDLESS CELESTIAL ARENA ---
  {
    id: 'endless_arena',
    name: 'Endless Celestial Arena',
    subtitle: 'Infinite trial against progressively empowered dimensional waves.',
    theme: 'void',
    backgroundGradient: ['#120c24', '#040208'],
    platformColor: '#2e1c4a',
    ambientParticles: '#facc15',
    waves: [
      {
        waveNumber: 1,
        enemies: [
          { name: 'Nether Stalker', type: 'mob', icon: '👤', color: '#a855f7', maxHp: 400, atk: 48, def: 20, speed: 4.0, expReward: 150, goldReward: 100, width: 42, height: 50, count: 5 }
        ]
      }
    ]
  }
];

export function spawnWaveEnemies(
  dungeon: DungeonDefinition,
  waveIndex: number,
  arenaWidth: number,
  playerX: number = 300
): EnemyInstance[] {
  const wave = dungeon.waves[waveIndex];
  if (!wave) return [];

  const instances: EnemyInstance[] = [];
  const safePadding = Math.min(260, Math.max(170, arenaWidth * 0.16));
  const lanes = Math.max(4, Math.min(9, Math.floor(arenaWidth / 280)));
  const laneWidth = Math.max(58, (arenaWidth - safePadding * 2) / lanes);
  let spawnOffsetIndex = 0;
  const seededValue = waveIndex + arenaWidth * 0.1 + playerX;

  wave.enemies.forEach((enemyTemplate) => {
    for (let i = 0; i < enemyTemplate.count; i++) {
      const spawnSide = ((spawnOffsetIndex + i + Math.floor(playerX)) + Math.floor(seededValue)) % 2 === 0 ? 1 : -1;
      const laneIndex = (spawnOffsetIndex + i) % lanes;
      const laneJitter = ((spawnOffsetIndex + i * 17) * 11) % laneWidth;
      let x = spawnSide === 1
        ? (arenaWidth - safePadding - laneWidth * 0.5 - laneIndex * laneWidth + laneJitter)
        : (safePadding + laneWidth * 0.5 + laneIndex * laneWidth - laneJitter);
      x = Math.max(safePadding, Math.min(arenaWidth - safePadding, x));

      if (spawnSide === 1 && x < playerX + 220) {
        x = Math.min(arenaWidth - safePadding, playerX + 240 + ((spawnOffsetIndex + i) * 24) % 110);
      }
      if (spawnSide === -1 && x > playerX - 220) {
        x = Math.max(safePadding, playerX - 240 - ((spawnOffsetIndex + i) * 24) % 110);
      }

      const baseDelay = enemyTemplate.type === 'boss'
        ? 0
        : 0.28 + (spawnOffsetIndex + i) * 0.16 + (enemyTemplate.type === 'elite' ? 0.15 : 0);
      const delayJitter = ((spawnOffsetIndex + i + enemyTemplate.name.length) % 8) * 0.06;
      const spawnDelay = Number((baseDelay + delayJitter).toFixed(2));

      const loot = enemyTemplate.type === 'boss'
        ? getRandomLoot('boss')
        : enemyTemplate.type === 'elite'
        ? getRandomLoot('mid')
        : (Math.random() > 0.4 ? getRandomLoot('low') : undefined);

      instances.push({
        id: `enemy_${waveIndex}_${enemyTemplate.name}_${i}_${Date.now()}`,
        name: enemyTemplate.name,
        type: enemyTemplate.type,
        icon: enemyTemplate.icon,
        color: enemyTemplate.color,
        maxHp: enemyTemplate.maxHp,
        hp: enemyTemplate.maxHp,
        atk: enemyTemplate.atk,
        def: enemyTemplate.def,
        speed: enemyTemplate.speed,
        expReward: enemyTemplate.expReward,
        goldReward: enemyTemplate.goldReward,
        width: enemyTemplate.width,
        height: enemyTemplate.height,
        attackRange: enemyTemplate.type === 'boss' ? 90 : 60,
        attackCooldown: enemyTemplate.type === 'boss' ? 1.8 : 2.2,
        attackTimer: Math.random() * 1.5,
        phases: enemyTemplate.phases,
        currentPhase: 1,
        specialAttackTimer: 0,
        isActive: spawnDelay <= 0,
        spawnDelay,
        x,
        y: 350,
        vx: 0,
        vy: 0,
        isGrounded: true,
        facing: spawnSide === 1 ? -1 : 1,
        isAttacking: false,
        hitStun: 0,
        isDead: false,
        lootDrop: loot
      });

      spawnOffsetIndex++;
    }
  });

  return instances;
}
