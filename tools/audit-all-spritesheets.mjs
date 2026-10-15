import fs from 'node:fs';
import path from 'node:path';

function walk(dir) {
  let results = [];
  try {
    const list = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of list) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        if (!['node_modules', '.git', 'dist', '.system_generated'].includes(item.name)) {
          results = results.concat(walk(full));
        }
      } else if (/\.(png|jpg|jpeg|webp|gif|json)$/i.test(item.name)) {
        // Exclude macOS metadata junk
        if (!item.name.startsWith('._') && !full.includes('__MACOSX')) {
          results.push(full.replace(/\\/g, '/'));
        }
      }
    }
  } catch (e) {}
  return results;
}

const allPublic = walk('public');
console.log('Total clean public files:', allPublic.length);

const categories = {
  heroes: [],
  enemies: [],
  environment: [],
  items_ui: [],
  vfx: [],
  other: [],
};

for (const file of allPublic) {
  const lower = file.toLowerCase();
  if (lower.includes('/fx/') || lower.includes('/effects/') || lower.includes('projectile') || lower.includes('slash') || lower.includes('impact') || lower.includes('spell') || lower.includes('shot')) {
    categories.vfx.push(file);
  } else if (lower.includes('warrior') || lower.includes('huntress') || lower.includes('wizard') || lower.includes('martial') || lower.includes('hero') || lower.includes('king') || lower.includes('knight') || lower.includes('priest') || lower.includes('paladin') || lower.includes('rogue') || lower.includes('assassin') || lower.includes('elementals') || lower.includes('female')) {
    categories.heroes.push(file);
  } else if (lower.includes('monster') || lower.includes('enemy') || lower.includes('mob') || lower.includes('boss') || lower.includes('goblin') || lower.includes('skeleton') || lower.includes('eye') || lower.includes('mushroom') || lower.includes('crab') || lower.includes('boar') || lower.includes('bee') || lower.includes('snail') || lower.includes('wolf') || lower.includes('shark') || lower.includes('star') || lower.includes('octopus') || lower.includes('jumper') || lower.includes('swamp') || lower.includes('slime') || lower.includes('demon') || lower.includes('drake') || lower.includes('golem') || lower.includes('harpy') || lower.includes('behemoth')) {
    categories.enemies.push(file);
  } else if (lower.includes('tile') || lower.includes('ground') || lower.includes('prop') || lower.includes('tree') || lower.includes('bush') || lower.includes('rock') || lower.includes('wood') || lower.includes('forest') || lower.includes('dungeon') || lower.includes('background') || lower.includes('parallax') || lower.includes('environment')) {
    categories.environment.push(file);
  } else if (lower.includes('ui') || lower.includes('icon') || lower.includes('item') || lower.includes('potion') || lower.includes('weapon') || lower.includes('armor') || lower.includes('loot') || lower.includes('button') || lower.includes('panel') || lower.includes('hud') || lower.includes('font') || lower.includes('window')) {
    categories.items_ui.push(file);
  } else {
    categories.other.push(file);
  }
}

for (const [cat, list] of Object.entries(categories)) {
  console.log(`\n=== Category: ${cat} (${list.length} files) ===`);
  const topDirs = {};
  for (const f of list) {
    const parts = f.split('/');
    const d = parts.slice(1, 3).join('/');
    topDirs[d] = (topDirs[d] || 0) + 1;
  }
  console.log(JSON.stringify(topDirs, null, 2));
}
