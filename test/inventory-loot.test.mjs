/**
 * Tests for Mythical loot drops, inventory selling (gold), and Best Equip system.
 */
import { readFileSync } from 'node:fs';

const itemDbSrc = readFileSync('src/sideview/items/ItemDatabase.ts', 'utf8');
const raritiesSrc = readFileSync('src/sideview/items/darkrise/rarities.ts', 'utf8');
const dungeonSrc = readFileSync('src/sideview/dungeons/DungeonManager.ts', 'utf8');
const engineSrc = readFileSync('src/sideview/engine/SideViewEngine.ts', 'utf8');
const hudSrc = readFileSync('src/sideview/ui/GameHUD.ts', 'utf8');

let failures = 0;
function check(name, pass) {
  if (pass) {
    console.log(`  PASS  ${name}`);
  } else {
    console.log(`  FAIL  ${name}`);
    failures++;
  }
}

console.log('\n=== MYTHICAL LOOT & INVENTORY SYSTEMS ===\n');

// 1. Mythical items in ItemDatabase
const requiredSlots = ['weapon', 'helmet', 'armor', 'boots', 'wings', 'shield', 'ring', 'amulet'];
requiredSlots.forEach(slot => {
  const hasMythicalSlot = new RegExp(`type:\\s*'${slot}'[\\s\\S]{1,250}rarity:\\s*'mythical'|rarity:\\s*'mythical'[\\s\\S]{1,250}type:\\s*'${slot}'`).test(itemDbSrc);
  check(`mythical equipment defined for slot: ${slot}`, hasMythicalSlot);
});

// 2. Drop weight tables
check('low-tier loot includes mythical drop weight', /low:\s*\{[^}]*mythical:\s*0\.[1-9]/.test(raritiesSrc));
check('mid-tier loot includes mythical drop weight', /mid:\s*\{[^}]*mythical:\s*[1-9]/.test(raritiesSrc));
check('boss loot features prominent mythical drop weight', /boss:\s*\{[^}]*mythical:\s*(1[0-9]|[2-9][0-9])/.test(raritiesSrc));

// 3. Drop chances in DungeonManager
check('mob drop chance is boosted', /MOB_DROP_CHANCE\s*=\s*0\.(3[5-9]|[4-9]\d)/.test(dungeonSrc));
check('elite drop chance is boosted', /ELITE_DROP_CHANCE\s*=\s*0\.(7[5-9]|[8-9]\d)/.test(dungeonSrc));

// 4. SideViewEngine sell and auto-equip methods
check('engine has getItemSellPrice', /public getItemSellPrice\(/.test(engineSrc));
check('engine has sellItem with persistence', /public sellItem\([^)]*\)[\s\S]{1,500}this\.triggerSave\(\)/.test(engineSrc));
check('engine has sellJunkItems with persistence', /public sellJunkItems\([^)]*\)[\s\S]{1,800}this\.triggerSave\(\)/.test(engineSrc));
check('engine has autoEquipBest using computeGearScore', /public autoEquipBest\([^)]*\)[\s\S]{1,1500}computeGearScore/.test(engineSrc));

// 5. GameHUD UI controls
check('HUD includes BEST EQUIP action button', /id="inv-best-equip-btn"/.test(hudSrc));
check('HUD includes SELL JUNK action button', /id="inv-sell-junk-btn"/.test(hudSrc));
check('HUD inspector pane includes SELL button', /id="inspector-sell-btn"/.test(hudSrc));
check('HUD binds best equip click handler', /bestEquipBtn\?\.addEventListener\('click'/.test(hudSrc));
check('HUD binds sell junk click handler', /sellJunkBtn\?\.addEventListener\('click'/.test(hudSrc));

console.log('');
console.log(failures === 0 ? 'INVENTORY & LOOT SYSTEMS OK' : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
