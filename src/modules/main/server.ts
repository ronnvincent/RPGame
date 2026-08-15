import { defineModule } from "@rpgjs/common";
import { RpgServer } from "@rpgjs/server";
import { player } from './player';
import { VillagerNPC } from './events/villager';
import { Potion } from './items/potion';

export default defineModule<RpgServer>({
  player,
  database: [
    Potion
  ],
  maps: [
    {
      id: 'simplemap',
      events: [
        {
          id: 'villager_npc',
          x: 350,
          y: 350,
          event: VillagerNPC()
        }
      ]
    }
  ]
});

