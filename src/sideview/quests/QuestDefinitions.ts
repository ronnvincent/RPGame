/**
 * Quest Definitions for The Shattered Runes of Aethelgard
 * Covers Main Storyline (Acts I-IV), Side Quests, Bounties, and Mastery Trials.
 */

import { ItemData, ITEM_DATABASE } from '../items/ItemDatabase';

export type QuestCategory = 'main' | 'side' | 'bounty' | 'trial';
export type QuestState = 'not_started' | 'in_progress' | 'ready_to_turn_in' | 'completed';

export interface QuestObjective {
  id: string;
  description: string;
  type: 'kill_enemy' | 'kill_boss' | 'clear_dungeon' | 'collect_item' | 'reach_combo' | 'talk_npc';
  target: string; // Enemy name, Boss name, Dungeon id, NPC id, or combo number
  requiredCount: number;
  currentCount: number;
  isCompleted: boolean;
}

export interface QuestReward {
  exp: number;
  gold: number;
  items?: ItemData[];
  unlockDungeonId?: string;
  runeUnlocked?: 'verdant' | 'shadow' | 'flame' | 'void';
}

export interface QuestDialogue {
  intro: string[];
  inProgress: string[];
  turnIn: string[];
  completed: string[];
}

export interface QuestDefinition {
  id: string;
  title: string;
  act: number; // 0 = prologue/town, 1-4 = acts
  category: QuestCategory;
  giverNpcId: string; // 'elder_justinian' | 'captain_valerie' | 'blacksmith_keith' | 'alchemist_morwenna' | 'portal_donald'
  giverName: string;
  description: string;
  recommendedLevel: number;
  objectives: QuestObjective[];
  rewards: QuestReward;
  dialogue: QuestDialogue;
  prerequisiteQuestId?: string;
}

export const QUEST_DEFINITIONS: QuestDefinition[] = [
  // ==========================================
  // ACT I: THE STOLEN SEAL (Goblin Catacombs)
  // ==========================================
  {
    id: 'quest_act1_keystone',
    title: 'Act I: The Stolen Keystone',
    act: 1,
    category: 'main',
    giverNpcId: 'elder_justinian',
    giverName: 'Elder Justinian',
    description: 'Goblin raiders have plundered the Verdant Keystone from our sanctuary. Enter the Goblin Catacombs and slay the vermin to reclaim it.',
    recommendedLevel: 1,
    objectives: [
      {
        id: 'obj_slimes',
        description: 'Slay Green Slimes in the Catacombs',
        type: 'kill_enemy',
        target: 'Green Slime',
        requiredCount: 4,
        currentCount: 0,
        isCompleted: false
      },
      {
        id: 'obj_goblin_rogues',
        description: 'Slay Goblin Rogues',
        type: 'kill_enemy',
        target: 'Goblin Rogue',
        requiredCount: 3,
        currentCount: 0,
        isCompleted: false
      }
    ],
    rewards: {
      exp: 250,
      gold: 150,
      items: [
        ITEM_DATABASE.find(i => i.id === 'pot_hp_large') || ITEM_DATABASE[0],
        ITEM_DATABASE.find(i => i.id === 'armor_paladin_chest') || ITEM_DATABASE[2]
      ]
    },
    dialogue: {
      intro: [
        "Elder Justinian: Ah, hero of prophesy! Darkness stirs across Aethelgard.",
        "Elder Justinian: The goblins of the subterranean catacombs have breached our perimeter and stolen the Verdant Keystone!",
        "Elder Justinian: Without it, the sacred ward protecting Eldermoor will collapse. Travel through the Portal Arch to the Goblin Catacombs and purge the raiders!"
      ],
      inProgress: [
        "Elder Justinian: Have you dealt with those thieving goblins yet?",
        "Elder Justinian: Enter the Portal Arch on the right side of town to reach the Goblin Catacombs."
      ],
      turnIn: [
        "Elder Justinian: You have returned! The air feels lighter already.",
        "Elder Justinian: But alas, our scouts report their supreme warlord Grimjaw holds the deep sanctum. We must strike before he weaponizes the rune!"
      ],
      completed: [
        "Elder Justinian: You proved your valor in the catacombs. Eldermoor honors you!"
      ]
    }
  },
  {
    id: 'quest_act1_grimjaw',
    title: "Act I: Grimjaw's Reckoning",
    act: 1,
    category: 'main',
    giverNpcId: 'elder_justinian',
    giverName: 'Elder Justinian',
    description: 'Chief Warlord Grimjaw is channeling the stolen Verdant Rune. Delve deep into the Catacombs and destroy him to recover the rune.',
    recommendedLevel: 3,
    prerequisiteQuestId: 'quest_act1_keystone',
    objectives: [
      {
        id: 'obj_grimjaw_boss',
        description: 'Defeat Chief Warlord Grimjaw',
        type: 'kill_boss',
        target: 'Chief Warlord Grimjaw',
        requiredCount: 1,
        currentCount: 0,
        isCompleted: false
      }
    ],
    rewards: {
      exp: 600,
      gold: 400,
      runeUnlocked: 'verdant',
      unlockDungeonId: 'undead_crypt',
      items: [
        ITEM_DATABASE.find(i => i.id === 'wep_muramasa') || ITEM_DATABASE[1],
        ITEM_DATABASE.find(i => i.id === 'amulet_dragons_heart') || ITEM_DATABASE[6]
      ]
    },
    dialogue: {
      intro: [
        "Elder Justinian: Chief Warlord Grimjaw has fortified himself in the lower cavern.",
        "Elder Justinian: Slay Grimjaw and seize back the Verdant Rune. Be cautious—he enters a savage berserk rage when wounded!"
      ],
      inProgress: [
        "Elder Justinian: Grimjaw still rules the catacombs. Do not let his dark power grow!"
      ],
      turnIn: [
        "Elder Justinian: Splendid victory! You hold the Verdant Rune in your hands!",
        "Elder Justinian: But look to the north... dark mist rises from the ancient mausoleums. The Crypt of the Damned has awakened!"
      ],
      completed: [
        "Elder Justinian: With Grimjaw fallen, the Verdant Rune pulses with restored tranquility."
      ]
    }
  },

  // ==========================================
  // ACT II: THE CRYPT OF THE DAMNED
  // ==========================================
  {
    id: 'quest_act2_undead',
    title: 'Act II: Whispers of the Tombs',
    act: 2,
    category: 'main',
    giverNpcId: 'captain_valerie',
    giverName: 'Captain Valerie',
    description: 'Undead legions are pouring out of the ancient crypts. Enter the Crypt of the Damned and destroy the Skeleton Warriors and Crypt Wraiths.',
    recommendedLevel: 5,
    prerequisiteQuestId: 'quest_act1_grimjaw',
    objectives: [
      {
        id: 'obj_skeletons',
        description: 'Destroy Skeleton Warriors in the Crypt',
        type: 'kill_enemy',
        target: 'Skeleton Warrior',
        requiredCount: 4,
        currentCount: 0,
        isCompleted: false
      },
      {
        id: 'obj_wraiths',
        description: 'Banish Crypt Wraiths',
        type: 'kill_enemy',
        target: 'Crypt Wraith',
        requiredCount: 3,
        currentCount: 0,
        isCompleted: false
      }
    ],
    rewards: {
      exp: 900,
      gold: 550,
      items: [
        ITEM_DATABASE.find(i => i.id === 'helm_archmage_cowl') || ITEM_DATABASE[3],
        ITEM_DATABASE.find(i => i.id === 'pot_elixir') || ITEM_DATABASE[12]
      ]
    },
    dialogue: {
      intro: [
        "Captain Valerie: Salute, champion! Our northern vanguard was overrun by risen corpses!",
        "Captain Valerie: The ancient tombs are stirring. We need you to carve a path through the Crypt of the Damned and shatter their ranks!"
      ],
      inProgress: [
        "Captain Valerie: The undead still march. Cut down their warriors and wraiths so our scouts can advance!"
      ],
      turnIn: [
        "Captain Valerie: Outstanding work, soldier! You shattered their vanguard!",
        "Captain Valerie: But the dark necromancy stems from deeper within—Arch-Lich Malakar himself orchestrates the dead!"
      ],
      completed: [
        "Captain Valerie: Eldermoor's perimeter is secured against the wandering skeletons."
      ]
    }
  },
  {
    id: 'quest_act2_malakar',
    title: 'Act II: Fall of the Arch-Lich',
    act: 2,
    category: 'main',
    giverNpcId: 'elder_justinian',
    giverName: 'Elder Justinian',
    description: 'Arch-Lich Malakar is channeling the Shadow Rune to raise a boundless army of the damned. Vanquish him and purify the Shadow Rune.',
    recommendedLevel: 7,
    prerequisiteQuestId: 'quest_act2_undead',
    objectives: [
      {
        id: 'obj_malakar_boss',
        description: 'Vanquish Arch-Lich Malakar in the Crypt',
        type: 'kill_boss',
        target: 'Arch-Lich Malakar',
        requiredCount: 1,
        currentCount: 0,
        isCompleted: false
      }
    ],
    rewards: {
      exp: 1500,
      gold: 900,
      runeUnlocked: 'shadow',
      unlockDungeonId: 'dragon_lair',
      items: [
        ITEM_DATABASE.find(i => i.id === 'wep_void_daggers') || ITEM_DATABASE[0],
        ITEM_DATABASE.find(i => i.id === 'wings_valkyrie') || ITEM_DATABASE[5]
      ]
    },
    dialogue: {
      intro: [
        "Elder Justinian: Malakar was once the grand high priest of the old empire before he surrendered his soul to the void.",
        "Elder Justinian: He guards the Shadow Rune within the heart of the sepulcher. Slay him and break his phylactery!"
      ],
      inProgress: [
        "Elder Justinian: Malakar chants his blasphemous incantations. Quench his unholy flame!"
      ],
      turnIn: [
        "Elder Justinian: The Lich is shattered! You have recovered the Shadow Rune!",
        "Elder Justinian: But beware... as Malakar died, his soul shriek echoed into the volcanic caldera. The Ancient Red Dragon Ignis has awakened in fury!"
      ],
      completed: [
        "Elder Justinian: The Crypt is at peace once more. The Shadow Rune shines in dark majesty."
      ]
    }
  },

  // ==========================================
  // ACT III: INFERNO SUMMIT (Dragon's Lair)
  // ==========================================
  {
    id: 'quest_act3_inferno',
    title: 'Act III: Trial of Molten Fury',
    act: 3,
    category: 'main',
    giverNpcId: 'blacksmith_keith',
    giverName: 'Blacksmith Keith',
    description: 'The Inferno Dragon Lair is ablaze with Fire Imps and Hell Hounds. Subdue the volcanic beasts and gather magma essence.',
    recommendedLevel: 9,
    prerequisiteQuestId: 'quest_act2_malakar',
    objectives: [
      {
        id: 'obj_fire_imps',
        description: 'Extinguish Fire Imps in the Dragon Lair',
        type: 'kill_enemy',
        target: 'Fire Imp',
        requiredCount: 4,
        currentCount: 0,
        isCompleted: false
      },
      {
        id: 'obj_hell_hounds',
        description: 'Slay Hell Hounds',
        type: 'kill_enemy',
        target: 'Hell Hound',
        requiredCount: 3,
        currentCount: 0,
        isCompleted: false
      }
    ],
    rewards: {
      exp: 2200,
      gold: 1200,
      items: [
        ITEM_DATABASE.find(i => i.id === 'ring_celestial_band') || ITEM_DATABASE[7],
        ITEM_DATABASE.find(i => i.id === 'pot_atk_flask') || ITEM_DATABASE[13]
      ]
    },
    dialogue: {
      intro: [
        "Blacksmith Keith: Ho there, warrior! My forge is hot, but the volcano's heat is unmatched!",
        "Blacksmith Keith: The caldera beasts are erupting onto the surface. Quench their fire imps and hounds so we can forge draconic armor for you!"
      ],
      inProgress: [
        "Blacksmith Keith: Still scorching out there? Keep slashing through those flame demons!"
      ],
      turnIn: [
        "Blacksmith Keith: Ha! That's the spirit! You cooled their tempers good!",
        "Blacksmith Keith: Now the true beast awaits at the peak—Ancient Red Dragon Ignis!"
      ],
      completed: [
        "Blacksmith Keith: The magma imps won't be bothering Eldermoor anytime soon!"
      ]
    }
  },
  {
    id: 'quest_act3_ignis',
    title: 'Act III: Slayer of Ignis',
    act: 3,
    category: 'main',
    giverNpcId: 'elder_justinian',
    giverName: 'Elder Justinian',
    description: 'Ascend to the caldera peak and slay the colossal Ancient Red Dragon Ignis to claim the Flame Rune.',
    recommendedLevel: 12,
    prerequisiteQuestId: 'quest_act3_inferno',
    objectives: [
      {
        id: 'obj_dragon_boss',
        description: 'Slay Ancient Red Dragon Ignis',
        type: 'kill_boss',
        target: 'Ancient Red Dragon Ignis',
        requiredCount: 1,
        currentCount: 0,
        isCompleted: false
      }
    ],
    rewards: {
      exp: 3500,
      gold: 2000,
      runeUnlocked: 'flame',
      unlockDungeonId: 'void_nexus',
      items: [
        ITEM_DATABASE.find(i => i.id === 'wep_excalibur') || ITEM_DATABASE[0],
        ITEM_DATABASE.find(i => i.id === 'wings_valkyrie') || ITEM_DATABASE[5]
      ]
    },
    dialogue: {
      intro: [
        "Elder Justinian: Ignis possesses fire so hot it melts enchanted steel. The Flame Rune is embedded in his chest.",
        "Elder Justinian: Dodge his sweeping fire breath, strike when he descends, and extinguish the primordial wyrm!"
      ],
      inProgress: [
        "Elder Justinian: The sky burns red with dragon fire. Bring down Ignis!"
      ],
      turnIn: [
        "Elder Justinian: ASTONISHING! The colossal wyrm has been felled by your hand!",
        "Elder Justinian: Three runes are restored! But look... the cosmic fabric is tearing apart above the mountains!",
        "Elder Justinian: The Void Overlord NightBorne is opening the Nether Rift in The Void Nexus!"
      ],
      completed: [
        "Elder Justinian: You are the Dragon Slayer of Aethelgard! The Flame Rune burns proudly."
      ]
    }
  },

  // ==========================================
  // ACT IV: THE VOID NEXUS (NightBorne Overlord)
  // ==========================================
  {
    id: 'quest_act4_void',
    title: 'Act IV: The Void Breach',
    act: 4,
    category: 'main',
    giverNpcId: 'portal_donald',
    giverName: 'Portal Master Donald',
    description: 'Nether rifts have opened in The Void Nexus. Step through the celestial gateway and cleanse the void entities.',
    recommendedLevel: 14,
    prerequisiteQuestId: 'quest_act3_ignis',
    objectives: [
      {
        id: 'obj_void_spire_mobs',
        description: 'Slay Nether Stalkers & Void Wraiths',
        type: 'kill_enemy',
        target: 'Nether Stalker',
        requiredCount: 4,
        currentCount: 0,
        isCompleted: false
      }
    ],
    rewards: {
      exp: 4500,
      gold: 2500,
      items: [
        ITEM_DATABASE.find(i => i.id === 'shield_aegis') || ITEM_DATABASE[4],
        ITEM_DATABASE.find(i => i.id === 'pot_revive_feather') || ITEM_DATABASE[14]
      ]
    },
    dialogue: {
      intro: [
        "Portal Master Donald: The dimensional continuum is vibrating! The Void Spire is tearing through reality!",
        "Portal Master Donald: I have attuned the Gateway to The Void Nexus. Enter the astral realm and destroy the Nether Stalkers!"
      ],
      inProgress: [
        "Portal Master Donald: The Void energies are turbulent! Cleanse the outer perimeter so we can breach the core!"
      ],
      turnIn: [
        "Portal Master Donald: You survived the astral vacuum! The barrier to the Overlord's throne room is shattered!"
      ],
      completed: [
        "Portal Master Donald: The dimensional gateway to the Void Nexus is fully stable!"
      ]
    }
  },
  {
    id: 'quest_act4_nightborne',
    title: 'Act IV: Eclipse of NightBorne',
    act: 4,
    category: 'main',
    giverNpcId: 'elder_justinian',
    giverName: 'Elder Justinian',
    description: 'Confront and destroy the supreme Void Overlord NightBorne in the depths of The Void Nexus to save Aethelgard.',
    recommendedLevel: 16,
    prerequisiteQuestId: 'quest_act4_void',
    objectives: [
      {
        id: 'obj_nightborne_boss',
        description: 'Destroy Void Overlord NightBorne',
        type: 'kill_boss',
        target: 'NightBorne Void Overlord',
        requiredCount: 1,
        currentCount: 0,
        isCompleted: false
      }
    ],
    rewards: {
      exp: 8000,
      gold: 5000,
      runeUnlocked: 'void',
      unlockDungeonId: 'endless_arena',
      items: [
        ITEM_DATABASE.find(i => i.id === 'wep_excalibur') || ITEM_DATABASE[0],
        ITEM_DATABASE.find(i => i.id === 'wep_void_daggers') || ITEM_DATABASE[1]
      ]
    },
    dialogue: {
      intro: [
        "Elder Justinian: This is the final trial, hero. NightBorne commands void blades, teleportation sorcery, and eclipse novas.",
        "Elder Justinian: Channel the power of the Verdant, Shadow, and Flame Runes. Restore the Void Rune and banish darkness forever!"
      ],
      inProgress: [
        "Elder Justinian: The fate of all living souls rests in your hands. Strike down NightBorne!"
      ],
      turnIn: [
        "Elder Justinian: 🌟 YOU HAVE SAVED AETHELGARD! 🌟",
        "Elder Justinian: NightBorne is vanquished, the Five Primordial Runes are reunited, and eternal dawn returns!",
        "Elder Justinian: As the Supreme Champion, you have unlocked the Endless Celestial Arena for infinite trials and glory!"
      ],
      completed: [
        "Elder Justinian: The legend of your triumph will echo across the heavens for all eternity!"
      ]
    }
  },

  // ==========================================
  // SIDE QUESTS & BOUNTIES
  // ==========================================
  {
    id: 'quest_side_herbs',
    title: "Morwenna's Herbal Brew",
    act: 1,
    category: 'side',
    giverNpcId: 'alchemist_morwenna',
    giverName: 'Alchemist Morwenna',
    description: 'Alchemist Morwenna needs slime gelatin and forest herbs to brew potent rejuvenation potions.',
    recommendedLevel: 2,
    objectives: [
      {
        id: 'obj_slime_gel',
        description: 'Collect Slime Residue (Defeat Green Slimes)',
        type: 'kill_enemy',
        target: 'Green Slime',
        requiredCount: 6,
        currentCount: 0,
        isCompleted: false
      }
    ],
    rewards: {
      exp: 300,
      gold: 200,
      items: [
        ITEM_DATABASE.find(i => i.id === 'pot_hp_large') || ITEM_DATABASE[8],
        ITEM_DATABASE.find(i => i.id === 'pot_mp_large') || ITEM_DATABASE[9]
      ]
    },
    dialogue: {
      intro: [
        "Alchemist Morwenna: Greetings, dear adventurer! My cauldron is boiling, but I lack fresh slime residue.",
        "Alchemist Morwenna: Squash 6 Green Slimes in the catacombs and bring me their essence. I will reward you with pure rejuvenation draughts!"
      ],
      inProgress: [
        "Alchemist Morwenna: How goes the harvest? Green Slimes love dark, damp places like the catacombs!"
      ],
      turnIn: [
        "Alchemist Morwenna: Perfect! Look at that bubbling emerald luster! Take these freshly brewed potions with my blessings!"
      ],
      completed: [
        "Alchemist Morwenna: Come back anytime you need restorative potions, dear!"
      ]
    }
  },
  {
    id: 'quest_bounty_berserkers',
    title: 'Bounty: Berserker Purge',
    act: 2,
    category: 'bounty',
    giverNpcId: 'captain_valerie',
    giverName: 'Captain Valerie',
    description: 'Elite Orc Berserkers and Death Knights pose a lethal hazard to town patrols. Eliminate them.',
    recommendedLevel: 6,
    objectives: [
      {
        id: 'obj_elites_bounty',
        description: 'Slay Orc Berserkers or Death Knights',
        type: 'kill_enemy',
        target: 'Orc Berserker',
        requiredCount: 2,
        currentCount: 0,
        isCompleted: false
      }
    ],
    rewards: {
      exp: 800,
      gold: 600,
      items: [
        ITEM_DATABASE.find(i => i.id === 'pot_atk_flask') || ITEM_DATABASE[13]
      ]
    },
    dialogue: {
      intro: [
        "Captain Valerie: Those hulking berserkers are tearing through our barricades!",
        "Captain Valerie: Hunt down 2 Orc Berserkers and put an end to their rampage. The guard guild will pay you handsomely!"
      ],
      inProgress: [
        "Captain Valerie: Keep your guard up. When a berserker roars, roll behind him and strike!"
      ],
      turnIn: [
        "Captain Valerie: Great kill! The barracks salute your prowess! Here is your bounty payment!"
      ],
      completed: [
        "Captain Valerie: Keep an eye out for more bounty posters at the guard post!"
      ]
    }
  },
  {
    id: 'quest_mastery_combo',
    title: 'Trial: 40x Blade Combo',
    act: 1,
    category: 'trial',
    giverNpcId: 'captain_valerie',
    giverName: 'Captain Valerie',
    description: 'Demonstrate your combat mastery by sustaining a 40-hit combo streak in any battle.',
    recommendedLevel: 4,
    objectives: [
      {
        id: 'obj_combo_streak',
        description: 'Reach a 40x Attack Combo in Combat',
        type: 'reach_combo',
        target: '40',
        requiredCount: 40,
        currentCount: 0,
        isCompleted: false
      }
    ],
    rewards: {
      exp: 1000,
      gold: 800,
      items: [
        ITEM_DATABASE.find(i => i.id === 'ring_celestial_band') || ITEM_DATABASE[7]
      ]
    },
    dialogue: {
      intro: [
        "Captain Valerie: True combat mastery is not merely brute strength—it is continuous fluid momentum.",
        "Captain Valerie: Chain your basic slashes and class skills together to maintain a 40-hit combo on enemy groups!"
      ],
      inProgress: [
        "Captain Valerie: Keep attacking without pause! Use dashes and area-of-effect spells to keep the combo counter blazing!"
      ],
      turnIn: [
        "Captain Valerie: Magnificent technique! You danced through their ranks like a whirlwind! Accept this Ring of Celestial Might!"
      ],
      completed: [
        "Captain Valerie: Your combat fluidity is unmatched across Eldermoor!"
      ]
    }
  }
];
