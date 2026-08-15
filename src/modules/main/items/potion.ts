import { RpgPlayer } from '@rpgjs/server';

/**
 * Health Potion Item Definition for RPGJS
 * Compatible with RPGJS v5 database and inventory systems.
 */
export const Potion = {
    id: 'potion',
    name: 'Health Potion',
    description: 'Restores 50 HP when consumed.',
    price: 20,
    hpValue: 50,
    onUse(player: RpgPlayer) {
        player.hp += 50;
    }
};
