/**
 * 10 Character Classes and 60 Unique Skills Definition
 * Complete stats, skills, scaling, animations, Kyrise 32x32 icon paths, and lore.
 */

export interface SkillDefinition {
  id: string;
  name: string;
  key: string;
  icon: string;
  iconImage: string;
  description: string;
  ultimateQuote: string;
  cooldown: number; // seconds
  manaCost: number;
  damageMultiplier: number;
  damageType: 'physical' | 'magical' | 'fire' | 'ice' | 'lightning' | 'holy' | 'dark';
  range: number;
  aoeRadius: number;
  castTime: number; // seconds
  vfx: 'slash' | 'whirlwind' | 'fireball' | 'frost_nova' | 'lightning' | 'holy_light' | 'dark_burst' | 'arrow_rain' | 'blade_dash' | 'ground_slam' | 'meteor' | 'heal' | 'shield';
  sfx: 'light_slash' | 'heavy_slash' | 'fire' | 'ice' | 'lightning' | 'holy' | 'dark' | 'heal' | 'dash';
  isUltimate?: boolean;
  buff?: {
    stat: 'atk' | 'def' | 'speed' | 'crit';
    multiplier: number;
    duration: number;
  };
}

export interface CharacterClass {
  id: string;
  name: string;
  title: string;
  icon: string;
  themeColor: string;
  accentColor: string;
  description: string;
  ultimateQuote: string;
  role: 'DPS' | 'Tank' | 'Burst' | 'Mage' | 'Support';
  stats: {
    maxHp: number;
    maxMp: number;
    atk: number;
    def: number;
    critChance: number; // 0.05 = 5%
    speed: number;
    jumpPower: number;
  };
  skills: SkillDefinition[];
}

export const CHARACTER_CLASSES: CharacterClass[] = [
  // 1. WARRIOR
  {
    id: 'warrior',
    name: 'Warrior',
    title: 'The Unyielding Vanguard',
    icon: '⚔️',
    themeColor: '#e53935',
    accentColor: '#ff8a80',
    description: 'Master of heavy blades and physical dominance. High health, reliable cleaves, and ground-shattering crowd control.',
    ultimateQuote: "SHATTER... THE HEAVENS!",
    role: 'DPS',
    stats: { maxHp: 650, maxMp: 120, atk: 55, def: 40, critChance: 0.12, speed: 5.5, jumpPower: 12.5 },
    skills: [
      { id: 'w_1', name: 'Basic Slash', key: '1', icon: '🗡️', iconImage: '/assets/rpg-icons/32x32/sword_03a.png', description: 'Continuous basic frontal blade slash dealing 75% physical damage.', cooldown: 0, manaCost: 0, damageMultiplier: 0.75, damageType: 'physical', range: 80, aoeRadius: 40, castTime: 0.05, vfx: 'slash', sfx: 'heavy_slash' },
      { id: 'w_2', name: 'Whirlwind', key: '2', icon: '🌪️', iconImage: '/assets/rpg-icons/32x32/sword_02a.png', description: 'Spin rapidly, hitting all nearby enemies 3 times for 80% damage.', cooldown: 4.5, manaCost: 0, damageMultiplier: 2.4, damageType: 'physical', range: 90, aoeRadius: 90, castTime: 0.3, vfx: 'whirlwind', sfx: 'heavy_slash' },
      { id: 'w_3', name: 'Shield Bash', key: '3', icon: '🛡️', iconImage: '/assets/rpg-icons/32x32/shield_01a.png', description: 'Smash enemy with shield for 110% damage in a short-range shock wave.', cooldown: 6.0, manaCost: 0, damageMultiplier: 1.1, damageType: 'physical', range: 60, aoeRadius: 30, castTime: 0.1, vfx: 'ground_slam', sfx: 'heavy_slash' },
      { id: 'w_4', name: 'War Cry', key: '4', icon: '🗣️', iconImage: '/assets/rpg-icons/32x32/scroll_01a.png', description: 'Empower yourself, increasing ATK by 35% and DEF by 20% for 8 seconds.', cooldown: 14.0, manaCost: 0, damageMultiplier: 0, damageType: 'physical', range: 0, aoeRadius: 0, castTime: 0.2, vfx: 'holy_light', sfx: 'holy', buff: { stat: 'atk', multiplier: 1.35, duration: 8 } },
      { id: 'w_5', name: 'Blade Dash', key: '5', icon: '⚡', iconImage: '/assets/rpg-icons/32x32/sword_01c.png', description: 'Dash forward with blinding speed, slicing through enemies for 180% damage.', cooldown: 7.0, manaCost: 0, damageMultiplier: 1.8, damageType: 'physical', range: 220, aoeRadius: 50, castTime: 0.05, vfx: 'blade_dash', sfx: 'dash' },
      { id: 'w_6', name: 'Earth Shatter', key: '6', icon: '🌋', iconImage: '/assets/rpg-icons/32x32/gem_01b.png', description: 'Leap and slam your greatsword into the ground, causing a devastating 380% fissure explosion.', cooldown: 20.0, manaCost: 0, damageMultiplier: 3.8, damageType: 'physical', range: 160, aoeRadius: 140, castTime: 0.4, vfx: 'ground_slam', sfx: 'heavy_slash', isUltimate: true }
    ]
  },

  // 2. ASSASSIN
  {
    id: 'assassin',
    name: 'Assassin',
    title: 'The Shadow Stalker',
    icon: '🗡️',
    themeColor: '#7b1fa2',
    accentColor: '#e1bee7',
    description: 'Lethal agility, poison blades, and unmatched critical burst damage. Strikes from shadows with venomous precision.',
    role: 'Burst',
    stats: { maxHp: 440, maxMp: 160, atk: 72, def: 20, critChance: 0.35, speed: 7.2, jumpPower: 14.0 },
    skills: [
      { id: 'as_1', name: 'Dagger Slice', key: '1', icon: '🔪', iconImage: '/assets/rpg-icons/32x32/sword_01d.png', description: 'Continuous rapid twin dagger slash dealing 70% physical damage.', cooldown: 0, manaCost: 0, damageMultiplier: 0.70, damageType: 'physical', range: 65, aoeRadius: 30, castTime: 0.05, vfx: 'slash', sfx: 'light_slash' },
      { id: 'as_2', name: 'Poison Dagger', key: '2', icon: '🧪', iconImage: '/assets/rpg-icons/32x32/potion_03c.png', description: 'Hurl a venom-coated blade dealing a fast 120% burst, favored for sudden burst pressure.', cooldown: 3.5, manaCost: 0, damageMultiplier: 1.2, damageType: 'dark', range: 250, aoeRadius: 20, castTime: 0.1, vfx: 'blade_dash', sfx: 'light_slash' },
      { id: 'as_3', name: 'Smoke Bomb', key: '3', icon: '💨', iconImage: '/assets/rpg-icons/32x32/hat_01a.png', description: 'Detonate a dense cloud of dark smoke, granting stealth translucency and +40% movement speed for 4s.', cooldown: 9.0, manaCost: 0, damageMultiplier: 0, damageType: 'dark', range: 0, aoeRadius: 60, castTime: 0.1, vfx: 'dark_burst', sfx: 'dark', buff: { stat: 'speed', multiplier: 1.4, duration: 4 } },
      { id: 'as_4', name: 'Fan of Knives', key: '4', icon: '✨', iconImage: '/assets/rpg-icons/32x32/shard_01d.png', description: 'Throw 8 spinning daggers radially in 360 degrees outward, piercing surrounding enemies.', cooldown: 6.0, manaCost: 0, damageMultiplier: 1.6, damageType: 'physical', range: 120, aoeRadius: 120, castTime: 0.15, vfx: 'slash', sfx: 'light_slash' },
      { id: 'as_5', name: 'Backstab Rush', key: '5', icon: '👤', iconImage: '/assets/rpg-icons/32x32/ring_01d.png', description: 'Teleport behind target enemy and deliver a brutal 240% critical puncture.', cooldown: 8.0, manaCost: 0, damageMultiplier: 2.4, damageType: 'dark', range: 280, aoeRadius: 40, castTime: 0.1, vfx: 'blade_dash', sfx: 'dash' },
      { id: 'as_6', name: 'Shadow Tempest', key: '6', icon: '☠️', iconImage: '/assets/rpg-icons/32x32/gem_01c.png', description: 'Unleash a flurry of 8 fatal shadow strikes across the entire room for 450% damage.', cooldown: 22.0, manaCost: 0, damageMultiplier: 4.5, damageType: 'dark', range: 200, aoeRadius: 180, castTime: 0.3, vfx: 'dark_burst', sfx: 'dark', isUltimate: true }
    ]
  },

  // 3. MAGE (ELEMENTALIST)
  {
    id: 'mage',
    name: 'Mage',
    title: 'The Grand Elementalist',
    icon: '🔮',
    themeColor: '#1976d2',
    accentColor: '#90caf9',
    description: 'Wielder of arcane fires, frozen blizzards, and celestial storms. Unrivaled destructive AoE magical firepower.',
    ultimateQuote: "I AM... ATOMIC!",
    role: 'Mage',
    stats: { maxHp: 380, maxMp: 300, atk: 85, def: 18, critChance: 0.18, speed: 5.0, jumpPower: 11.5 },
    skills: [
      { id: 'm_1', name: 'Fire Bolt', key: '1', icon: '🔥', iconImage: '/assets/rpg-icons/32x32/staff_03a.png', description: 'Continuous rapid fire bolt projectile dealing 75% fire damage.', cooldown: 0, manaCost: 0, damageMultiplier: 0.75, damageType: 'fire', range: 350, aoeRadius: 50, castTime: 0.05, vfx: 'fireball', sfx: 'fire' },
      { id: 'm_2', name: 'Frost Nova', key: '2', icon: '❄️', iconImage: '/assets/rpg-icons/32x32/crystal_01f.png', description: 'Freeze the ground around you, dealing 130% ice damage and slowing enemies by 50%.', cooldown: 5.0, manaCost: 0, damageMultiplier: 1.3, damageType: 'ice', range: 100, aoeRadius: 100, castTime: 0.15, vfx: 'frost_nova', sfx: 'ice' },
      { id: 'm_3', name: 'Lightning Chain', key: '3', icon: '⚡', iconImage: '/assets/rpg-icons/32x32/ring_03a.png', description: 'Discharge an electric bolt bouncing across up to 4 enemies for 180% lightning damage.', cooldown: 6.5, manaCost: 0, damageMultiplier: 1.8, damageType: 'lightning', range: 300, aoeRadius: 120, castTime: 0.25, vfx: 'lightning', sfx: 'lightning' },
      { id: 'm_4', name: 'Arcane Shield', key: '4', icon: '🛡️', iconImage: '/assets/rpg-icons/32x32/spellbook_03a.png', description: 'Conjure a mana barrier absorbing up to 250 incoming damage for 10 seconds.', cooldown: 15.0, manaCost: 0, damageMultiplier: 0, damageType: 'magical', range: 0, aoeRadius: 0, castTime: 0.1, vfx: 'shield', sfx: 'holy', buff: { stat: 'def', multiplier: 2.0, duration: 10 } },
      { id: 'm_5', name: 'Blizzard Tempest', key: '5', icon: '🌨️', iconImage: '/assets/rpg-icons/32x32/potion_02a.png', description: 'Summon an icy storm overhead, showering continuous hail for 220% ice damage.', cooldown: 10.0, manaCost: 0, damageMultiplier: 2.2, damageType: 'ice', range: 250, aoeRadius: 140, castTime: 0.3, vfx: 'frost_nova', sfx: 'ice' },
      { id: 'm_6', name: 'Meteor Storm', key: '6', icon: '☄️', iconImage: '/assets/rpg-icons/32x32/gem_01d.png', description: 'Call down a colossal burning meteor from the heavens, annihilating everything for 520% damage.', cooldown: 25.0, manaCost: 0, damageMultiplier: 5.2, damageType: 'fire', range: 300, aoeRadius: 200, castTime: 0.5, vfx: 'meteor', sfx: 'fire', isUltimate: true }
    ]
  },

  // 4. PALADIN (TANK)
  {
    id: 'paladin',
    name: 'Paladin',
    title: 'The Divine Protector',
    icon: '🛡️',
    themeColor: '#fbc02d',
    accentColor: '#fff59d',
    description: 'Impenetrable fortress blessed by divine light. Boasts the highest defense, sacred heals, and holy counterattacks.',
    role: 'Tank',
    stats: { maxHp: 800, maxMp: 180, atk: 45, def: 60, critChance: 0.08, speed: 4.8, jumpPower: 11.0 },
    skills: [
      { id: 'p_1', name: 'Holy Strike', key: '1', icon: '🔨', iconImage: '/assets/rpg-icons/32x32/sword_03a.png', description: 'Continuous holy warhammer strike dealing 80% holy damage.', cooldown: 0, manaCost: 0, damageMultiplier: 0.80, damageType: 'holy', range: 75, aoeRadius: 40, castTime: 0.05, vfx: 'slash', sfx: 'holy' },
      { id: 'p_2', name: 'Divine Aegis', key: '2', icon: '✨', iconImage: '/assets/rpg-icons/32x32/shield_03a.png', description: 'Raise your holy shield, reducing all damage taken by 60% for 6 seconds.', cooldown: 12.0, manaCost: 0, damageMultiplier: 0, damageType: 'holy', range: 0, aoeRadius: 0, castTime: 0.1, vfx: 'shield', sfx: 'holy', buff: { stat: 'def', multiplier: 1.6, duration: 6 } },
      { id: 'p_3', name: 'Taunt Roar', key: '3', icon: '📢', iconImage: '/assets/rpg-icons/32x32/helmet_02a.png', description: 'Release a forceful shockwave that disrupts nearby enemies while adding 60% base physical burst.', cooldown: 7.0, manaCost: 0, damageMultiplier: 0.6, damageType: 'physical', range: 150, aoeRadius: 150, castTime: 0.15, vfx: 'ground_slam', sfx: 'heavy_slash' },
      { id: 'p_4', name: 'Consecration', key: '4', icon: '🔆', iconImage: '/assets/rpg-icons/32x32/crystal_01j.png', description: 'Bless the floor with holy fire, burning enemies inside for 180% continuous holy damage.', cooldown: 9.0, manaCost: 0, damageMultiplier: 1.8, damageType: 'holy', range: 0, aoeRadius: 120, castTime: 0.2, vfx: 'holy_light', sfx: 'holy' },
      { id: 'p_5', name: 'Lay on Hands', key: '5', icon: '💖', iconImage: '/assets/rpg-icons/32x32/potion_01a.png', description: 'Channel pure celestial light to restore a large amount of HP instantly.', cooldown: 18.0, manaCost: 0, damageMultiplier: 0, damageType: 'holy', range: 0, aoeRadius: 0, castTime: 0.2, vfx: 'heal', sfx: 'heal' },
      { id: 'p_6', name: 'Judgement of Light', key: '6', icon: '⚡', iconImage: '/assets/rpg-icons/32x32/gem_01e.png', description: 'Summon a giant radiant hammer of the gods from the clouds, crushing foes for 400% damage.', cooldown: 24.0, manaCost: 0, damageMultiplier: 4.0, damageType: 'holy', range: 180, aoeRadius: 160, castTime: 0.4, vfx: 'ground_slam', sfx: 'holy', isUltimate: true }
    ]
  },

  // 5. ARCHER (RANGER)
  {
    id: 'archer',
    name: 'Archer',
    title: 'The Wind Marksman',
    icon: '🏹',
    themeColor: '#43a047',
    accentColor: '#a5d6a7',
    description: 'Supreme sniper with unmatched range, piercing arrow volleys, and explosive projectile traps.',
    role: 'DPS',
    stats: { maxHp: 480, maxMp: 200, atk: 68, def: 24, critChance: 0.28, speed: 6.8, jumpPower: 13.0 },
    skills: [
      { id: 'ar_1', name: 'Quick Arrow', key: '1', icon: '🏹', iconImage: '/assets/rpg-icons/32x32/bow_03a.png', description: 'Continuous rapid arrow shot dealing 75% physical damage.', cooldown: 0, manaCost: 0, damageMultiplier: 0.75, damageType: 'physical', range: 420, aoeRadius: 20, castTime: 0.05, vfx: 'arrow_rain', sfx: 'light_slash' },
      { id: 'ar_2', name: 'Rain of Arrows', key: '2', icon: '🌧️', iconImage: '/assets/rpg-icons/32x32/arrow_03a.png', description: 'Fire a volley into the sky, raining 10 arrows in target area for 220% damage.', cooldown: 5.5, manaCost: 0, damageMultiplier: 2.2, damageType: 'physical', range: 300, aoeRadius: 110, castTime: 0.25, vfx: 'arrow_rain', sfx: 'light_slash' },
      { id: 'ar_3', name: 'Poison Trap', key: '3', icon: '🕸️', iconImage: '/assets/rpg-icons/32x32/spellbook_02a.png', description: 'Deploy a physical floor trap that detonates into a lingering toxic cloud when an enemy steps on it.', cooldown: 8.0, manaCost: 0, damageMultiplier: 1.5, damageType: 'dark', range: 100, aoeRadius: 70, castTime: 0.1, vfx: 'dark_burst', sfx: 'dark' },
      { id: 'ar_4', name: 'Explosive Shot', key: '4', icon: '💥', iconImage: '/assets/rpg-icons/32x32/bow_02a.png', description: 'Fire an enchanted blast arrow causing a fiery 200% burst explosion on hit.', cooldown: 6.0, manaCost: 0, damageMultiplier: 2.0, damageType: 'fire', range: 360, aoeRadius: 80, castTime: 0.2, vfx: 'fireball', sfx: 'fire' },
      { id: 'ar_5', name: 'Eagle Eye', key: '5', icon: '👁️', iconImage: '/assets/rpg-icons/32x32/boots_01c.png', description: 'Focus your sight, boosting Critical Hit Rate by 40% and Attack Speed for 8 seconds.', cooldown: 16.0, manaCost: 0, damageMultiplier: 0, damageType: 'physical', range: 0, aoeRadius: 0, castTime: 0.1, vfx: 'holy_light', sfx: 'holy', buff: { stat: 'crit', multiplier: 1.4, duration: 8 } },
      { id: 'ar_6', name: 'Dragon Piercer', key: '6', icon: '🌪️', iconImage: '/assets/rpg-icons/32x32/gem_01f.png', description: 'Channel a relentless hurricane of 30 rapid-fire spectral arrows dealing 480% total damage.', cooldown: 22.0, manaCost: 0, damageMultiplier: 4.8, damageType: 'physical', range: 450, aoeRadius: 150, castTime: 0.4, vfx: 'arrow_rain', sfx: 'light_slash', isUltimate: true }
    ]
  },

  // 6. NECROMANCER
  {
    id: 'necromancer',
    name: 'Necromancer',
    title: 'The Death Monarch',
    icon: '💀',
    themeColor: '#5c6bc0',
    accentColor: '#c5cae9',
    description: 'Commander of the underworld. Drains the life force of foes, raises skeletal warriors, and triggers dark corpse explosions.',
    ultimateQuote: "ARISE... FROM THE ABYSS!",
    role: 'Mage',
    stats: { maxHp: 420, maxMp: 280, atk: 78, def: 22, critChance: 0.15, speed: 5.2, jumpPower: 11.5 },
    skills: [
      { id: 'n_1', name: 'Soul Bolt', key: '1', icon: '👻', iconImage: '/assets/rpg-icons/32x32/skull_01a.png', description: 'Continuous ghostly soul projectile dealing 75% dark magic damage.', cooldown: 0, manaCost: 0, damageMultiplier: 0.75, damageType: 'dark', range: 320, aoeRadius: 30, castTime: 0.05, vfx: 'dark_burst', sfx: 'dark' },
      { id: 'n_2', name: 'Life Drain', key: '2', icon: '🩸', iconImage: '/assets/rpg-icons/32x32/potion_03e.png', description: 'Siphon vital energy from target, dealing 160% dark burst damage.', cooldown: 5.0, manaCost: 0, damageMultiplier: 1.6, damageType: 'dark', range: 240, aoeRadius: 30, castTime: 0.2, vfx: 'dark_burst', sfx: 'dark' },
      { id: 'n_3', name: 'Summon Skeleton', key: '3', icon: '🦴', iconImage: '/assets/rpg-icons/32x32/bone01a.png', description: 'Summon an animated friendly Skeleton minion to the battlefield that advances and auto-attacks nearby enemies.', cooldown: 10.0, manaCost: 0, damageMultiplier: 1.2, damageType: 'dark', range: 100, aoeRadius: 80, castTime: 0.3, vfx: 'dark_burst', sfx: 'dark' },
      { id: 'n_4', name: 'Curse of Frailty', key: '4', icon: '🕯️', iconImage: '/assets/rpg-icons/32x32/spellbook_01a.png', description: 'Cast a dark hex on all enemies, reducing their defense by 40% for 7 seconds.', cooldown: 12.0, manaCost: 0, damageMultiplier: 0.8, damageType: 'dark', range: 200, aoeRadius: 130, castTime: 0.2, vfx: 'dark_burst', sfx: 'dark' },
      { id: 'n_5', name: 'Corpse Explosion', key: '5', icon: '💥', iconImage: '/assets/rpg-icons/32x32/crystal_01d.png', description: 'Detonate dark energy beneath defeated enemies, dealing 240% catastrophic area damage.', cooldown: 7.5, manaCost: 0, damageMultiplier: 2.4, damageType: 'dark', range: 220, aoeRadius: 100, castTime: 0.25, vfx: 'dark_burst', sfx: 'fire' },
      { id: 'n_6', name: 'Death Nova', key: '6', icon: '☠️', iconImage: '/assets/rpg-icons/32x32/gem_01g.png', description: 'Rip open the gates of hell, summoning a legion of spectral reapers that sweep across the field for 500% damage.', cooldown: 26.0, manaCost: 0, damageMultiplier: 5.0, damageType: 'dark', range: 350, aoeRadius: 220, castTime: 0.5, vfx: 'dark_burst', sfx: 'dark', isUltimate: true }
    ]
  },

  // 7. BERSERKER
  {
    id: 'berserker',
    name: 'Berserker',
    title: 'The Bloodthirsty Juggernaut',
    icon: '🪓',
    themeColor: '#d84315',
    accentColor: '#ffab91',
    description: 'Thrives on the brink of death. Gains colossal attack power as health drops, swinging dual axes with brutal ferocity.',
    ultimateQuote: "BLOOD... FOR THE BLOOD GOD!",
    role: 'DPS',
    stats: { maxHp: 700, maxMp: 100, atk: 75, def: 28, critChance: 0.22, speed: 6.0, jumpPower: 13.0 },
    skills: [
      { id: 'b_1', name: 'Axe Hack', key: '1', icon: '🪓', iconImage: '/assets/rpg-icons/32x32/sword_02a.png', description: 'Continuous fast dual axe slash dealing 80% raw physical damage.', cooldown: 0, manaCost: 0, damageMultiplier: 0.80, damageType: 'physical', range: 85, aoeRadius: 50, castTime: 0.05, vfx: 'slash', sfx: 'heavy_slash' },
      { id: 'b_2', name: 'Blood Rage', key: '2', icon: '🩸', iconImage: '/assets/rpg-icons/32x32/potion_03a.png', description: 'Unleash a berserk state, increasing ATK by 50% and Attack Speed for 6 seconds.', cooldown: 10.0, manaCost: 0, damageMultiplier: 0, damageType: 'physical', range: 0, aoeRadius: 0, castTime: 0.1, vfx: 'dark_burst', sfx: 'heavy_slash', buff: { stat: 'atk', multiplier: 1.5, duration: 6 } },
      { id: 'b_3', name: 'Reckless Leap', key: '3', icon: '🦘', iconImage: '/assets/rpg-icons/32x32/boots_01e.png', description: 'Leap high into the air and crash down on enemies, dealing 190% crushing damage.', cooldown: 6.5, manaCost: 0, damageMultiplier: 1.9, damageType: 'physical', range: 240, aoeRadius: 80, castTime: 0.2, vfx: 'ground_slam', sfx: 'heavy_slash' },
      { id: 'b_4', name: 'Executioner', key: '4', icon: '💀', iconImage: '/assets/rpg-icons/32x32/sword_03a.png', description: 'Deliver a lethal execution strike for 260% burst damage.', cooldown: 8.0, manaCost: 0, damageMultiplier: 2.6, damageType: 'physical', range: 75, aoeRadius: 40, castTime: 0.15, vfx: 'slash', sfx: 'heavy_slash' },
      { id: 'b_5', name: 'Rampage Flurry', key: '5', icon: '🌪️', iconImage: '/assets/rpg-icons/32x32/ring_01a.png', description: 'Go wild with 5 consecutive axe swings in 1.5s, shredding targets for 280% damage.', cooldown: 9.0, manaCost: 0, damageMultiplier: 2.8, damageType: 'physical', range: 90, aoeRadius: 70, castTime: 0.2, vfx: 'whirlwind', sfx: 'heavy_slash' },
      { id: 'b_6', name: 'Wrath of the Juggernaut', key: '6', icon: '🔥', iconImage: '/assets/rpg-icons/32x32/gem_01h.png', description: 'Enter a reckless fury mode and deliver 420% physical burst damage.', cooldown: 28.0, manaCost: 0, damageMultiplier: 4.2, damageType: 'physical', range: 120, aoeRadius: 100, castTime: 0.3, vfx: 'fireball', sfx: 'heavy_slash', isUltimate: true }
    ]
  },

  // 8. PRIEST (CLERIC)
  {
    id: 'priest',
    name: 'Priest',
    title: 'The High Inquisitor',
    icon: '✨',
    themeColor: '#00acc1',
    accentColor: '#b2ebf2',
    description: 'Channeler of radiant starlight and sacred judgment. Sustains allies with powerful heals and smites wickedness.',
    ultimateQuote: "DIVINE JUDGMENT... DESCEND!",
    role: 'Support',
    stats: { maxHp: 500, maxMp: 320, atk: 58, def: 32, critChance: 0.14, speed: 5.3, jumpPower: 12.0 },
    skills: [
      { id: 'pr_1', name: 'Light Spark', key: '1', icon: '🌟', iconImage: '/assets/rpg-icons/32x32/necklace_01a.png', description: 'Continuous beam of sacred light dealing 75% holy damage.', cooldown: 0, manaCost: 0, damageMultiplier: 0.75, damageType: 'holy', range: 340, aoeRadius: 35, castTime: 0.05, vfx: 'holy_light', sfx: 'holy' },
      { id: 'pr_2', name: 'Radiant Heal', key: '2', icon: '💖', iconImage: '/assets/rpg-icons/32x32/potion_01a.png', description: 'Channel holy blessing to heal yourself for 200 HP and boost DEF by 25%.', cooldown: 6.0, manaCost: 0, damageMultiplier: 0, damageType: 'holy', range: 0, aoeRadius: 0, castTime: 0.2, vfx: 'heal', sfx: 'heal', buff: { stat: 'def', multiplier: 1.25, duration: 6 } },
      { id: 'pr_3', name: 'Purge Flame', key: '3', icon: '🔥', iconImage: '/assets/rpg-icons/32x32/spellbook_02a.png', description: 'Engulf targets in sacred holy fire, dealing 170% holy damage to nearby enemies.', cooldown: 5.5, manaCost: 0, damageMultiplier: 1.7, damageType: 'holy', range: 220, aoeRadius: 70, castTime: 0.2, vfx: 'fireball', sfx: 'holy' },
      { id: 'pr_4', name: 'Sanctuary Ward', key: '4', icon: '🛡️', iconImage: '/assets/rpg-icons/32x32/ring_02a.png', description: 'Erect a protective holy ward while sustaining a defensive buff for nearby enemies.', cooldown: 14.0, manaCost: 0, damageMultiplier: 0, damageType: 'holy', range: 0, aoeRadius: 100, castTime: 0.25, vfx: 'shield', sfx: 'holy' },
      { id: 'pr_5', name: 'Radiance Wave', key: '5', icon: '🌊', iconImage: '/assets/rpg-icons/32x32/crystal_01j.png', description: 'Unleash a wide expanding shockwave of light dealing 230% damage to all enemies.', cooldown: 8.0, manaCost: 0, damageMultiplier: 2.3, damageType: 'holy', range: 280, aoeRadius: 140, castTime: 0.3, vfx: 'holy_light', sfx: 'holy' },
      { id: 'pr_6', name: 'Resurrection Blessing', key: '6', icon: '⚡', iconImage: '/assets/rpg-icons/32x32/gem_01i.png', description: 'Unleash a divine wave for 460% holy damage over a wide area.', cooldown: 24.0, manaCost: 0, damageMultiplier: 4.6, damageType: 'holy', range: 320, aoeRadius: 200, castTime: 0.4, vfx: 'holy_light', sfx: 'holy', isUltimate: true }
    ]
  },

  // 9. NINJA (SHADOWBLADE)
  {
    id: 'ninja',
    name: 'Ninja',
    title: 'The Shinobi Master',
    icon: '🥷',
    themeColor: '#2e7d32',
    accentColor: '#a5d6a7',
    description: 'Acrobatic master of shurikens, substitution jutsu, and lightning-fast multi-blade assassination combos.',
    ultimateQuote: "SHADOWS... CONSUME YOU!",
    role: 'Burst',
    stats: { maxHp: 460, maxMp: 190, atk: 70, def: 22, critChance: 0.32, speed: 7.5, jumpPower: 14.5 },
    skills: [
      { id: 'ni_1', name: 'Katana Slash', key: '1', icon: '🗡️', iconImage: '/assets/rpg-icons/32x32/shard_01a.png', description: 'Continuous rapid katana strike dealing 75% physical damage.', cooldown: 0, manaCost: 0, damageMultiplier: 0.75, damageType: 'physical', range: 100, aoeRadius: 40, castTime: 0.05, vfx: 'slash', sfx: 'light_slash' },
      { id: 'ni_2', name: 'Shadow Clone', key: '2', icon: '👥', iconImage: '/assets/rpg-icons/32x32/scroll_01a.png', description: 'Spawn 2 real shadow clone illusions flanking the target that perform synchronized Katana slashes before vanishing.', cooldown: 12.0, manaCost: 0, damageMultiplier: 1.5, damageType: 'physical', range: 80, aoeRadius: 60, castTime: 0.15, vfx: 'blade_dash', sfx: 'dash', buff: { stat: 'atk', multiplier: 1.3, duration: 6 } },
      { id: 'ni_3', name: 'Substitution Dash', key: '3', icon: '🪵', iconImage: '/assets/rpg-icons/32x32/boots_01e.png', description: 'Dash rapidly 200px forward to reposition and follow with a quick counter strike.', cooldown: 6.0, manaCost: 0, damageMultiplier: 0.5, damageType: 'physical', range: 200, aoeRadius: 40, castTime: 0.05, vfx: 'blade_dash', sfx: 'dash' },
      { id: 'ni_4', name: 'Dragon Blade', key: '4', icon: '🐉', iconImage: '/assets/rpg-icons/32x32/sword_01a.png', description: 'Draw your ancient katana and slash forward in an elemental flame arc for 210% damage.', cooldown: 5.5, manaCost: 0, damageMultiplier: 2.1, damageType: 'fire', range: 140, aoeRadius: 70, castTime: 0.15, vfx: 'slash', sfx: 'light_slash' },
      { id: 'ni_5', name: 'Tempest Slash', key: '5', icon: '⚡', iconImage: '/assets/rpg-icons/32x32/sword_02c.png', description: 'Zip across multiple enemies 4 times at lightning speed, dealing 250% total damage.', cooldown: 8.5, manaCost: 0, damageMultiplier: 2.5, damageType: 'lightning', range: 240, aoeRadius: 100, castTime: 0.2, vfx: 'lightning', sfx: 'lightning' },
      { id: 'ni_6', name: 'Omnislash', key: '6', icon: '🌌', iconImage: '/assets/rpg-icons/32x32/gem_01j.png', description: 'Stop time momentarily and perform 12 dimension-cleaving slashes across the screen for 490% damage.', cooldown: 24.0, manaCost: 0, damageMultiplier: 4.9, damageType: 'dark', range: 300, aoeRadius: 200, castTime: 0.35, vfx: 'blade_dash', sfx: 'light_slash', isUltimate: true }
    ]
  },

  // 10. DRAGOON (LANCER)
  {
    id: 'dragoon',
    name: 'Dragoon',
    title: 'The Sky Dragon Lancer',
    icon: '🐉',
    themeColor: '#00838f',
    accentColor: '#80deea',
    description: 'Sovereign of the skies. Wields long lances, executes soaring jump dives, and channels ancient dragon breath.',
    ultimateQuote: "DRAGON'S... WRATH!",
    role: 'DPS',
    stats: { maxHp: 580, maxMp: 170, atk: 66, def: 36, critChance: 0.20, speed: 6.2, jumpPower: 15.5 },
    skills: [
      { id: 'd_1', name: 'Spear Thrust', key: '1', icon: '🔱', iconImage: '/assets/rpg-icons/32x32/sword_01c.png', description: 'Continuous rapid lance thrust dealing 80% physical damage.', cooldown: 0, manaCost: 0, damageMultiplier: 0.80, damageType: 'physical', range: 130, aoeRadius: 35, castTime: 0.05, vfx: 'slash', sfx: 'light_slash' },
      { id: 'd_2', name: 'Dragon Dive', key: '2', icon: '🦅', iconImage: '/assets/rpg-icons/32x32/armor_01c.png', description: 'Soar high into the sky and dive down with spear tip, dealing 220% impact damage.', cooldown: 6.0, manaCost: 0, damageMultiplier: 2.2, damageType: 'physical', range: 220, aoeRadius: 90, castTime: 0.2, vfx: 'ground_slam', sfx: 'heavy_slash' },
      { id: 'd_3', name: 'Flame Breath', key: '3', icon: '🔥', iconImage: '/assets/rpg-icons/32x32/crystal_01g.png', description: 'Channel draconic flame in a cone, incinerating foes for 190% fire damage.', cooldown: 5.0, manaCost: 0, damageMultiplier: 1.9, damageType: 'fire', range: 180, aoeRadius: 80, castTime: 0.2, vfx: 'fireball', sfx: 'fire' },
      { id: 'd_4', name: 'Spiral Lance', key: '4', icon: '🌀', iconImage: '/assets/rpg-icons/32x32/staff_02ab.png', description: 'Spin your spear forward like a drill, piercing all enemies in path for 240% damage.', cooldown: 7.5, manaCost: 0, damageMultiplier: 2.4, damageType: 'physical', range: 250, aoeRadius: 60, castTime: 0.2, vfx: 'whirlwind', sfx: 'light_slash' },
      { id: 'd_5', name: 'Dragon Wings Buff', key: '5', icon: '🪽', iconImage: '/assets/rpg-icons/32x32/boots_01c.png', description: 'Unfurl spectral dragon wings, granting +30% SPEED and +25% ATK for 8s.', cooldown: 15.0, manaCost: 0, damageMultiplier: 0, damageType: 'fire', range: 0, aoeRadius: 0, castTime: 0.1, vfx: 'holy_light', sfx: 'holy', buff: { stat: 'speed', multiplier: 1.3, duration: 8 } },
      { id: 'd_6', name: 'Dragon Descent', key: '6', icon: '🐲', iconImage: '/assets/rpg-icons/32x32/crystal_01h.png', description: 'Transform into an avatar of the Elder Dragon, breathing a cataclysmic flame beam for 510% damage.', cooldown: 25.0, manaCost: 0, damageMultiplier: 5.1, damageType: 'fire', range: 350, aoeRadius: 180, castTime: 0.45, vfx: 'fireball', sfx: 'fire', isUltimate: true }
    ]
  }
];

