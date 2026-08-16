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
  minLevel?: number;
  waves: DungeonWave[];
}

export type BattleTheme = 'catacombs' | 'crypt' | 'inferno' | 'void' | 'town' | 'swamp' | 'mountain' | 'underwater' | 'caves';

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
          { name: 'Green Slime', type: 'mob', icon: '/assets/ui_sprites/icons/I_Crystal01.png', color: '#4caf50', maxHp: 80, atk: 12, def: 5, speed: 2.2, expReward: 42, goldReward: 19, width: 36, height: 32, count: 4 }
        ]
      },
      {
        waveNumber: 2,
        enemies: [
          { name: 'Goblin Rogue', type: 'mob', icon: '👺', color: '#689f38', maxHp: 130, atk: 18, def: 8, speed: 3.5, expReward: 70, goldReward: 32, width: 38, height: 48, count: 3 },
          { name: 'Goblin Shaman', type: 'mob', icon: '🧙‍♂️', color: '#33691e', maxHp: 110, atk: 22, def: 6, speed: 2.0, expReward: 84, goldReward: 45, width: 38, height: 48, count: 2 }
        ]
      },
      {
        waveNumber: 3,
        enemies: [
          { name: 'Orc Berserker', type: 'elite', icon: '/assets/ui_sprites/icons/E_Bones03.png', color: '#d84315', maxHp: 350, atk: 30, def: 18, speed: 2.8, expReward: 210, goldReward: 117, width: 52, height: 60, count: 1 },
          { name: 'Green Slime', type: 'mob', icon: '/assets/ui_sprites/icons/I_Crystal01.png', color: '#4caf50', maxHp: 95, atk: 14, def: 6, speed: 2.4, expReward: 49, goldReward: 26, width: 36, height: 32, count: 3 }
        ]
      },
      {
        waveNumber: 4,
        enemies: [
          { name: 'Chief Warlord Grimjaw', type: 'boss', icon: '👑', color: '#2e7d32', maxHp: 1000, atk: 42, def: 25, speed: 3.0, expReward: 700, goldReward: 455, width: 68, height: 80, count: 1, phases: 2 }
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
          { name: 'Skeleton Warrior', type: 'mob', icon: '/assets/ui_sprites/icons/I_Bone.png', color: '#e0e0e0', maxHp: 180, atk: 22, def: 12, speed: 2.6, expReward: 77, goldReward: 39, width: 40, height: 52, count: 4 }
        ]
      },
      {
        waveNumber: 2,
        enemies: [
          { name: 'Skeleton Archer', type: 'mob', icon: '🏹', color: '#b0bec5', maxHp: 150, atk: 26, def: 8, speed: 2.3, expReward: 91, goldReward: 52, width: 38, height: 50, count: 3 },
          { name: 'Cursed Wraith', type: 'mob', icon: '👻', color: '#7e57c2', maxHp: 170, atk: 28, def: 10, speed: 3.2, expReward: 105, goldReward: 58, width: 44, height: 54, count: 2 }
        ]
      },
      {
        waveNumber: 3,
        enemies: [
          { name: 'Death Knight', type: 'elite', icon: '🛡️', color: '#4527a0', maxHp: 600, atk: 40, def: 28, speed: 2.5, expReward: 364, goldReward: 208, width: 56, height: 68, count: 1 },
          { name: 'Skeleton Warrior', type: 'mob', icon: '/assets/ui_sprites/icons/I_Bone.png', color: '#e0e0e0', maxHp: 195, atk: 24, def: 14, speed: 2.6, expReward: 84, goldReward: 45, width: 40, height: 52, count: 3 }
        ]
      },
      {
        waveNumber: 4,
        enemies: [
          { name: 'Arch-Lich Malakar', type: 'boss', icon: '👑', color: '#6a1b9a', maxHp: 2400, atk: 68, def: 32, speed: 3.2, expReward: 1400, goldReward: 975, width: 72, height: 86, count: 1, phases: 2 }
        ]
      }
    ]
  },

  // --- 3. INFERNO DRAGON'S LAIR ---
  {
    id: 'dragon_lair',
    name: "Inferno Dragon's Lair",
    subtitle: 'Volcanic magma caldera erupting with fire drakes and molten beasts.',
    theme: 'inferno',
    backgroundGradient: ['#2d0e0e', '#110303'],
    platformColor: '#5c1d1d',
    ambientParticles: '#ff7043',
    waves: [
      {
        waveNumber: 1,
        enemies: [
          { name: 'Magma Hound', type: 'mob', icon: '🐕', color: '#ff5722', maxHp: 320, atk: 40, def: 16, speed: 3.8, expReward: 125, goldReward: 78, width: 46, height: 40, count: 4 }
        ]
      },
      {
        waveNumber: 2,
        enemies: [
          { name: 'Fire Imp', type: 'mob', icon: '😈', color: '#f44336', maxHp: 260, atk: 48, def: 12, speed: 3.0, expReward: 154, goldReward: 97, width: 36, height: 44, count: 4 },
          { name: 'Lava Golem', type: 'elite', icon: '🗿', color: '#bf360c', maxHp: 950, atk: 60, def: 35, speed: 1.8, expReward: 489, goldReward: 286, width: 62, height: 72, count: 1 }
        ]
      },
      {
        waveNumber: 3,
        enemies: [
          { name: 'Magma Drake', type: 'elite', icon: '🦎', color: '#d84315', maxHp: 1100, atk: 66, def: 38, speed: 3.4, expReward: 630, goldReward: 364, width: 66, height: 60, count: 2 }
        ]
      },
      {
        waveNumber: 4,
        enemies: [
          { name: 'Ancient Red Dragon Ignis', type: 'boss', icon: '👑', color: '#b71c1c', maxHp: 4200, atk: 88, def: 45, speed: 3.6, expReward: 2800, goldReward: 1950, width: 92, height: 90, count: 1, phases: 3 }
        ]
      }
    ]
  },

  // --- 4. THE VOID NEXUS ---
  {
    id: 'void_nexus',
    name: 'The Void Nexus',
    subtitle: 'Cosmic rift where NightBorne commands the void shadows.',
    theme: 'void',
    backgroundGradient: ['#120c24', '#040208'],
    platformColor: '#2e1c4a',
    ambientParticles: '#c084fc',
    waves: [
      {
        waveNumber: 1,
        enemies: [
          { name: 'Void Phantom', type: 'mob', icon: '👁️', color: '#9333ea', maxHp: 380, atk: 52, def: 22, speed: 3.5, expReward: 196, goldReward: 117, width: 44, height: 50, count: 4 }
        ]
      },
      {
        waveNumber: 2,
        enemies: [
          { name: 'Astral Slayer', type: 'mob', icon: '/assets/ui_sprites/icons/W_Sword001.png', color: '#7c3aed', maxHp: 420, atk: 58, def: 25, speed: 3.8, expReward: 224, goldReward: 143, width: 46, height: 54, count: 3 },
          { name: 'Eclipse Sorcerer', type: 'elite', icon: '🔮', color: '#6d28d9', maxHp: 1200, atk: 72, def: 30, speed: 2.5, expReward: 700, goldReward: 455, width: 58, height: 68, count: 1 }
        ]
      },
      {
        waveNumber: 3,
        enemies: [
          { name: 'NightBorne Void Overlord', type: 'boss', icon: '👑', color: '#4c1d95', maxHp: 5200, atk: 95, def: 52, speed: 4.2, expReward: 4200, goldReward: 3250, width: 88, height: 96, count: 1, phases: 3 }
        ]
      }
    ]
  },

  // --- 5. VENOMOUS SWAMP (Gothicvania Swamp) ---
  {
    id: 'venomous_swamp',
    name: 'Venomous Swamp',
    subtitle: 'Murky poison marsh draped in moss, ancient deadwood, and toxic creatures.',
    theme: 'swamp',
    backgroundGradient: ['#0f291e', '#05130d'],
    platformColor: '#1b4332',
    ambientParticles: '#4ade80',
    waves: [
      {
        waveNumber: 1,
        enemies: [
          { name: 'Swamp Spider', type: 'mob', icon: '/assets/ui_sprites/icons/I_Eye.png', color: '#166534', maxHp: 280, atk: 34, def: 14, speed: 3.6, expReward: 112, goldReward: 58, width: 44, height: 36, count: 4 }
        ]
      },
      {
        waveNumber: 2,
        enemies: [
          { name: 'Bog Ghost', type: 'mob', icon: '👻', color: '#86efac', maxHp: 240, atk: 42, def: 10, speed: 3.0, expReward: 140, goldReward: 78, width: 40, height: 48, count: 3 },
          { name: 'Swamp Thing', type: 'elite', icon: '🐙', color: '#14532d', maxHp: 850, atk: 55, def: 28, speed: 2.2, expReward: 448, goldReward: 234, width: 58, height: 64, count: 1 }
        ]
      },
      {
        waveNumber: 3,
        enemies: [
          { name: 'Broodmother Queen', type: 'boss', icon: '👑', color: '#15803d', maxHp: 3200, atk: 75, def: 38, speed: 3.2, expReward: 2240, goldReward: 1560, width: 80, height: 80, count: 1, phases: 2 }
        ]
      }
    ]
  },

  // --- 6. TWILIGHT PEAKS (Mountain Dusk) ---
  {
    id: 'twilight_peaks',
    name: 'Twilight Peaks',
    subtitle: 'High alpine crags bathed in the crimson radiance of the blood moon.',
    theme: 'mountain',
    backgroundGradient: ['#2e1022', '#0f040d'],
    platformColor: '#4a1d35',
    ambientParticles: '#f43f5e',
    waves: [
      {
        waveNumber: 1,
        enemies: [
          { name: 'Dusk Wolf', type: 'mob', icon: '🐺', color: '#9f1239', maxHp: 340, atk: 44, def: 18, speed: 4.2, expReward: 154, goldReward: 91, width: 48, height: 38, count: 4 }
        ]
      },
      {
        waveNumber: 2,
        enemies: [
          { name: 'Mountain Harpy', type: 'mob', icon: '🦅', color: '#e11d48', maxHp: 300, atk: 50, def: 15, speed: 3.8, expReward: 182, goldReward: 110, width: 44, height: 52, count: 3 },
          { name: 'Bloodstone Golem', type: 'elite', icon: '🗿', color: '#881337', maxHp: 1100, atk: 68, def: 42, speed: 2.0, expReward: 588, goldReward: 338, width: 64, height: 76, count: 1 }
        ]
      },
      {
        waveNumber: 3,
        enemies: [
          { name: 'Blood Moon Behemoth', type: 'boss', icon: '👑', color: '#be123c', maxHp: 4400, atk: 88, def: 48, speed: 3.5, expReward: 3080, goldReward: 2340, width: 88, height: 92, count: 1, phases: 3 }
        ]
      }
    ]
  },

  // --- 7. SUNKEN ABYSS (Underwater Fantasy) ---
  {
    id: 'sunken_abyss',
    name: 'Sunken Abyss',
    subtitle: 'Submerged ancient temple ruins inhabited by abyssal horrors and sirens.',
    theme: 'underwater',
    backgroundGradient: ['#042f2e', '#021312'],
    platformColor: '#0f766e',
    ambientParticles: '#2dd4bf',
    waves: [
      {
        waveNumber: 1,
        enemies: [
          { name: 'Deep Coral Crab', type: 'mob', icon: '🦀', color: '#0d9488', maxHp: 360, atk: 38, def: 30, speed: 2.4, expReward: 168, goldReward: 104, width: 46, height: 36, count: 4 }
        ]
      },
      {
        waveNumber: 2,
        enemies: [
          { name: 'Abyssal Siren', type: 'mob', icon: '🧜‍♀️', color: '#14b8a6', maxHp: 320, atk: 54, def: 16, speed: 3.4, expReward: 210, goldReward: 123, width: 42, height: 56, count: 3 },
          { name: 'Sunken Titan', type: 'elite', icon: '🔱', color: '#115e59', maxHp: 1300, atk: 72, def: 45, speed: 2.2, expReward: 672, goldReward: 390, width: 68, height: 80, count: 1 }
        ]
      },
      {
        waveNumber: 3,
        enemies: [
          { name: 'Leviathan of the Deep', type: 'boss', icon: '👑', color: '#0f766e', maxHp: 4800, atk: 92, def: 50, speed: 3.6, expReward: 3639, goldReward: 2600, width: 96, height: 94, count: 1, phases: 3 }
        ]
      }
    ]
  },

  // --- 8. GALLET DEPTHS (Caves of Gallet) ---
  {
    id: 'gallet_depths',
    name: 'Gallet Depths',
    subtitle: 'Subterranean lava forge carved with stone channels and cascading waterfalls.',
    theme: 'caves',
    backgroundGradient: ['#1f1610', '#0a0705'],
    platformColor: '#43281c',
    ambientParticles: '#fb923c',
    waves: [
      {
        waveNumber: 1,
        enemies: [
          { name: 'Cave Bat Swarm', type: 'mob', icon: '/assets/ui_sprites/icons/I_BatWing.png', color: '#78350f', maxHp: 290, atk: 40, def: 14, speed: 4.4, expReward: 140, goldReward: 84, width: 42, height: 34, count: 4 }
        ]
      },
      {
        waveNumber: 2,
        enemies: [
          { name: 'Molten Sentry', type: 'elite', icon: '🛡️', color: '#ea580c', maxHp: 1200, atk: 70, def: 40, speed: 2.4, expReward: 616, goldReward: 351, width: 60, height: 70, count: 2 }
        ]
      },
      {
        waveNumber: 3,
        enemies: [
          { name: 'Gallet Forge Overlord', type: 'boss', icon: '👑', color: '#c2410c', maxHp: 4600, atk: 90, def: 48, speed: 3.4, expReward: 3500, goldReward: 2470, width: 88, height: 90, count: 1, phases: 3 }
        ]
      }
    ]
  },

  // --- 9. ENDLESS CELESTIAL ARENA ---
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
          { name: 'Nether Stalker', type: 'mob', icon: '👤', color: '#a855f7', maxHp: 400, atk: 48, def: 20, speed: 4.0, expReward: 210, goldReward: 130, width: 42, height: 50, count: 5 }
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
