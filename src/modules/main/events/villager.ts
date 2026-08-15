import { type EventDefinition, RpgPlayer } from '@rpgjs/server';
import { Potion } from '../items/potion';

/**
 * Villager NPC Event
 * When the player interacts with this NPC:
 * 1. Gives a welcome message.
 * 2. Rewards 5 Potions (simulating a simple quest reward).
 * 3. Remembers if the quest was completed so potions aren't given infinitely.
 */
export function VillagerNPC(): EventDefinition {
    return {
        onInit() {
            // Set graphic sprite for the NPC (uses sprite key registered in client assets)
            this.setGraphic('female');
        },
        async onAction(player: RpgPlayer) {
            // Check if player has already completed this basic quest
            const hasReceivedReward = player.getVariable('QUEST_VILLAGER_POTION_GIVEN');

            if (hasReceivedReward) {
                // Dialogue for returning players after quest completion
                await player.showText('Villager: Welcome back, brave adventurer!');
                await player.showText('Villager: Make good use of those potions on your journey.');
                return;
            }

            // Step 1: Welcome message
            await player.showText('Villager: Welcome to our peaceful town, traveler!');
            await player.showText('Villager: The world outside can be dangerous. Here, take these to help you out!');

            // Step 2: Grant 5 Potions to the player's inventory
            player.addItem(Potion, 5);

            // Step 3: Mark quest state in player variables
            player.setVariable('QUEST_VILLAGER_POTION_GIVEN', true);

            // Step 4: Confirmation dialog
            await player.showText('System: You received 5x Health Potion!');
            await player.showText('Villager: Safe travels!');
        }
    };
}
