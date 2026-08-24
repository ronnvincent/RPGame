/**
 * Darkrise-style town services shared by the Jeweler and the Blacksmith:
 * socket carving, gem socketing/removal/combining, enchanting, melting,
 * Mythical Unification fusion, card slotting, and the mission board.
 *
 * Everything here mutates real PlayerState/ItemData and ends with a recompute +
 * save, so co-op hosts and local saves stay consistent.
 */

import type { SideViewEngine } from '../engine/SideViewEngine';
import type { ItemData } from '../items/ItemDatabase';
import { RARITY_CONFIGS } from '../items/ItemDatabase';
import { audio } from '../engine/AudioManager';
import {
  countOpenSockets,
  ensureSockets,
  findCombineTarget,
  getGemById,
  insertGem,
  isSocketable,
  nextSocketUnlockCost,
  removeGemAt,
} from '../items/darkrise/gems';
import {
  MAX_ENCHANT_LEVEL,
  applyEnchant,
  canEnchant,
  enchantCost,
  fuseResult,
  meltYield,
  unificationStoneCost,
} from '../items/darkrise/services';
import { MONSTER_CARDS, cardFitsSlot, getCardById } from '../items/darkrise/cards';
import { CURRENCY_ICONS } from '../items/darkrise/currencies';
import { claimMission, getMissionViews } from '../quests/DailyMissions';

const PANEL_BG = "url('/assets/kenney-rpg-ui/panelInset_brown.png') repeat; background-size: 100% 100%";

interface ModalHandle {
  overlay: HTMLDivElement;
  modal: HTMLDivElement;
}

function createServiceModal(width: string): ModalHandle {
  const overlay = document.createElement('div');
  overlay.className = 'dialogue-modal-backdrop';
  const modal = document.createElement('div');
  modal.className = 'dialogue-box-frame';
  modal.style.maxWidth = width;
  return { overlay, modal };
}

function mountModal(handle: ModalHandle): void {
  handle.overlay.appendChild(handle.modal);
  document.body.appendChild(handle.overlay);
}

function walletRow(engine: SideViewEngine): string {
  const p = engine.player;
  return `<div style="display:flex; gap:10px; font-size:12px; font-weight:900; color:#fef08a; background:rgba(0,0,0,0.5); padding:4px 10px; border-radius:4px; border:1px solid #ffd700;">
    <span>${CURRENCY_ICONS.gold} ${p.gold}</span>
    <span>${CURRENCY_ICONS.diamonds} ${p.diamonds ?? 0}</span>
    <span>${CURRENCY_ICONS.magicSubstance} ${p.magicSubstance ?? 0}</span>
    <span>${CURRENCY_ICONS.unificationStones} ${p.unificationStones ?? 0}</span>
    <span>${CURRENCY_ICONS.keysOfPower} ${p.keysOfPower ?? 0}</span>
  </div>`;
}

function itemOptionLabel(item: ItemData): string {
  return `${item.name} (${RARITY_CONFIGS[item.rarity]?.name || item.rarity})`;
}

/** Every gear candidate for services: equipped pieces first, then the bag. */
function gatherGear(engine: SideViewEngine): Array<{ location: 'equip' | 'bag'; index: number; slot?: string; item: ItemData }> {
  const out: Array<{ location: 'equip' | 'bag'; index: number; slot?: string; item: ItemData }> = [];
  const slots = Object.keys(engine.player.equipment) as Array<keyof typeof engine.player.equipment>;
  slots.forEach(slot => {
    const item = engine.player.equipment[slot];
    if (item && isSocketable(item)) out.push({ location: 'equip', index: -1, slot, item });
  });
  engine.player.inventory.forEach((item, index) => {
    if (isSocketable(item)) out.push({ location: 'bag', index, item });
  });
  return out;
}

function resolveGear(
  engine: SideViewEngine,
  ref: { location: 'equip' | 'bag'; index: number; slot?: string },
): ItemData | null {
  if (ref.location === 'equip' && ref.slot) {
    return engine.player.equipment[ref.slot as keyof typeof engine.player.equipment] || null;
  }
  return engine.player.inventory[ref.index] || null;
}

function playOk(): void {
  audio.playCoin();
}
function playFail(): void {
  audio.playTone(200, 0.15);
}

// ---------------------------------------------------------------------------
// JEWELER
// ---------------------------------------------------------------------------

export function openJewelerModal(engine: SideViewEngine): void {
  audio.playPageTurn();
  const handle = createServiceModal('720px');
  let selectedRef: { location: 'equip' | 'bag'; index: number; slot?: string } | null = null;

  const renderContent = () => {
    const gear = gatherGear(engine);
    const selected = selectedRef ? resolveGear(engine, selectedRef) : null;
    const bagGems = engine.player.inventory.filter(i => i.type === 'gem');
    const combineTarget = findCombineTarget(engine.player.inventory);

    let socketsHtml = '';
    if (selected) {
      const sockets = ensureSockets(selected);
      const openCount = countOpenSockets(selected);
      const unlockCost = nextSocketUnlockCost(selected);
      const totalSockets = sockets.length;
      const canCarve = totalSockets < 4;
      socketsHtml = `
        <div style="margin-top:8px;">
          <div style="font-size:13px; font-weight:900; color:#fbbf24;">${selected.name} — Sockets</div>
          <div style="display:flex; gap:6px; margin:6px 0;">
            ${sockets.map((gemId, i) => {
              const gem = gemId ? getGemById(gemId) : null;
              return `<button class="js-socket" data-i="${i}" style="width:52px; height:52px; border:2px dashed ${gem ? '#facc15' : '#57534e'}; border-radius:6px; background:rgba(0,0,0,0.4); cursor:pointer;" title="${gem ? `${gem.name} - click to remove` : 'empty socket'}">
                ${gem ? `<img src="${gem.image}" width="30" height="30" style="image-rendering:pixelated;" />` : '<span style="color:#57534e; font-size:20px;">◇</span>'}
              </button>`;
            }).join('')}
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            ${canCarve ? `<button id="js-carve" class="dialogue-btn dialogue-btn-quest">Carve Socket — ${unlockCost}G</button>` : ''}
            ${openCount > 0 && bagGems.length > 0 ? `
              <select id="js-gem-pick" class="dialogue-btn" style="padding:6px;">
                ${bagGems.map((g, i) => `<option value="${i}">${g.name} (+${g.stats?.atk ?? g.stats?.hp ?? g.stats?.def ?? Math.round((g.stats?.crit || 0) * 100) + '% crit'})</option>`).join('')}
              </select>
              <button id="js-insert" class="dialogue-btn dialogue-btn-quest">Insert Gem</button>` : ''}
          </div>
        </div>`;
    }

    handle.modal.innerHTML = `
      <div class="dialogue-header-row">
        <div style="font-size:18px; font-weight:900; color:#ffd700;">💎 JEWELER SABLE — GEMS & SOCKETS</div>
        ${walletRow(engine)}
      </div>
      <div style="font-size:12px; color:#cbd5e1; margin:4px 0 8px; font-style:italic;">
        Carve up to four sockets into a piece of gear, seat gems for permanent stats, or fuse three equal gems into one of the next tier.
      </div>
      <div style="display:flex; flex-direction:column; gap:6px; max-height:220px; overflow-y:auto;">
        ${gear.length === 0 ? '<div style="color:#94a3b8; font-size:12px;">No gear available.</div>' : gear.map((entry, i) => `
          <button class="js-gear dialogue-btn" data-ref="${entry.location}:${entry.index}:${entry.slot || ''}" style="text-align:left; padding:6px 10px; ${selectedRef && selectedRef.location === entry.location && selectedRef.index === entry.index && selectedRef.slot === entry.slot ? 'border-color:#fbbf24;' : ''}">
            ${itemOptionLabel(entry.item)} — ${(entry.item.sockets || []).filter(Boolean).length}/${Math.max(entry.item.sockets?.length || 0, 1)} gems seated
          </button>`).join('')}
      </div>
      ${socketsHtml}
      <div style="margin-top:10px; border-top:1px solid rgba(255,255,255,0.1); padding-top:8px;">
        <div style="font-size:13px; font-weight:900; color:#c084fc;">Gem Fusion</div>
        ${combineTarget ? `
          <div style="font-size:12px; color:#cbd5e1;">3 × ${getGemById(engine.player.inventory[combineTarget.input[0]].id)?.name} → 1 × ${combineTarget.result.name}</div>
          <button id="js-combine" class="dialogue-btn dialogue-btn-quest" style="margin-top:4px;">Combine Gems</button>`
          : '<div style="font-size:12px; color:#94a3b8;">Collect three identical gems to fuse them into a higher tier.</div>'}
      </div>
      <div class="dialogue-actions-row" style="margin-top:12px;">
        <button id="js-close" class="dialogue-btn">Done ✕</button>
      </div>
    `;

    handle.modal.querySelectorAll('.js-gear').forEach(btn => {
      btn.addEventListener('click', () => {
        const [location, index, slot] = ((btn as HTMLElement).dataset.ref || '').split(':');
        selectedRef = { location: location as 'equip' | 'bag', index: Number(index), slot: slot || undefined };
        renderContent();
      });
    });

    handle.modal.querySelector('#js-carve')?.addEventListener('click', () => {
      if (!selectedRef) return;
      const item = resolveGear(engine, selectedRef);
      if (!item) return;
      const cost = nextSocketUnlockCost(item);
      if ((engine.player.gold ?? 0) >= cost) {
        engine.player.gold -= cost;
        ensureSockets(item);
        playOk();
        engine.recomputeStats();
        engine.triggerSave();
      } else {
        playFail();
      }
      renderContent();
    });

    handle.modal.querySelector('#js-insert')?.addEventListener('click', () => {
      if (!selectedRef) return;
      const item = resolveGear(engine, selectedRef);
      const picker = handle.modal.querySelector('#js-gem-pick') as HTMLSelectElement | null;
      if (!item || !picker) return;
      const bagIndex = Number(picker.value);
      const gem = engine.player.inventory[bagIndex];
      if (!gem || gem.type !== 'gem') { playFail(); return; }
      if (insertGem(item, gem)) {
        engine.player.inventory.splice(bagIndex, 1);
        playOk();
        engine.recomputeStats();
        engine.triggerSave();
      } else {
        playFail();
      }
      renderContent();
    });

    handle.modal.querySelectorAll('.js-socket').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!selectedRef) return;
        const item = resolveGear(engine, selectedRef);
        if (!item) return;
        const idx = Number((btn as HTMLElement).dataset.i);
        const removedId = removeGemAt(item, idx);
        if (removedId) {
          const gem = getGemById(removedId);
          if (gem) engine.player.inventory.push({ ...gem });
          playOk();
          engine.recomputeStats();
          engine.triggerSave();
        }
        renderContent();
      });
    });

    handle.modal.querySelector('#js-combine')?.addEventListener('click', () => {
      const target = findCombineTarget(engine.player.inventory);
      if (!target) { playFail(); return; }
      // Remove highest indices first so earlier removals do not shift later ones.
      [...target.input].sort((a, b) => b - a).forEach(i => engine.player.inventory.splice(i, 1));
      engine.player.inventory.push({ ...target.result });
      playOk();
      engine.triggerSave();
      renderContent();
    });

    handle.modal.querySelector('#js-close')?.addEventListener('click', () => {
      if (handle.overlay.parentNode) handle.overlay.parentNode.removeChild(handle.overlay);
    });
  };

  renderContent();
  mountModal(handle);
}

// ---------------------------------------------------------------------------
// BLACKSMITH ANVIL SERVICES (enchant / melt / fusion / cards)
// ---------------------------------------------------------------------------

export function openAnvilServicesModal(engine: SideViewEngine): void {
  audio.playPageTurn();
  const handle = createServiceModal('760px');
  let selectedRef: { location: 'equip' | 'bag'; index: number; slot?: string } | null = null;

  const renderContent = () => {
    const gear = gatherGear(engine);
    const selected = selectedRef ? resolveGear(engine, selectedRef) : null;
    const bagCards = engine.player.inventory.filter(i => i.type === 'card');
    const enchant = selected ? enchantCost(selected) : null;
    const stoneCost = selected ? unificationStoneCost(selected.rarity) : Infinity;
    const fittingCards = selected ? bagCards.filter(c => {
      const def = MONSTER_CARDS.find(mc => `item_${mc.id}` === c.id);
      return def ? cardFitsSlot(def, selected.type) : false;
    }) : [];

    handle.modal.innerHTML = `
      <div class="dialogue-header-row">
        <div style="font-size:18px; font-weight:900; color:#ffd700;">⚒️ KEITH'S ANVIL — ENCHANT · MELT · UNIFY</div>
        ${walletRow(engine)}
      </div>
      <div style="font-size:12px; color:#cbd5e1; margin:4px 0 8px; font-style:italic;">
        Enchant with Magic Substance (+8% stats per level), melt trash into fuel, unify with stones to climb the rarity ladder, or press a boss card into its slot.
      </div>
      <div style="display:flex; flex-direction:column; gap:6px; max-height:180px; overflow-y:auto;">
        ${gear.map((entry) => `
          <button class="av-gear dialogue-btn" data-ref="${entry.location}:${entry.index}:${entry.slot || ''}" style="text-align:left; padding:6px 10px; ${selectedRef && selectedRef.location === entry.location && selectedRef.index === entry.index && selectedRef.slot === entry.slot ? 'border-color:#fbbf24;' : ''}">
            ${itemOptionLabel(entry.item)}${entry.item.enchantLevel ? ` +${entry.item.enchantLevel}` : ''}${entry.item.cardId ? ` 🃏` : ''} — GS ${entry.item.gearScore ?? '?'}
          </button>`).join('')}
      </div>
      ${selected ? `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:10px;">
          <div style="background:${PANEL_BG}; padding:8px 10px; border-radius:4px;">
            <div style="font-size:12px; font-weight:900; color:#f87171;">Enchant (+8%/lvl)</div>
            <div style="font-size:11px; color:#cbd5e1;">Level ${selected.enchantLevel || 0}/${MAX_ENCHANT_LEVEL} — Cost: ${enchant!.gold}G + ${enchant!.magicSubstance} ${CURRENCY_ICONS.magicSubstance}</div>
            ${canEnchant(selected) ? `<button id="av-enchant" class="dialogue-btn dialogue-btn-quest" style="margin-top:4px;">Enchant</button>` : '<div style="font-size:11px; color:#94a3b8;">Max level.</div>'}
          </div>
          <div style="background:${PANEL_BG}; padding:8px 10px; border-radius:4px;">
            <div style="font-size:12px; font-weight:900; color:#fbbf24;">Mythical Unification</div>
            <div style="font-size:11px; color:#cbd5e1;">Promote rarity & reroll affixes — Cost: ${Number.isFinite(stoneCost) ? `${stoneCost} ${CURRENCY_ICONS.unificationStones} + 500G` : 'max tier reached'}</div>
            ${Number.isFinite(stoneCost) ? `<button id="av-fuse" class="dialogue-btn dialogue-btn-quest" style="margin-top:4px;">Unify</button>` : ''}
          </div>
          <div style="background:${PANEL_BG}; padding:8px 10px; border-radius:4px;">
            <div style="font-size:12px; font-weight:900; color:#22d3ee;">Melt</div>
            <div style="font-size:11px; color:#cbd5e1;">Destroy for substance (bag items only).</div>
            ${selectedRef?.location === 'bag' ? `<button id="av-melt" class="dialogue-btn inspector-btn-danger" style="margin-top:4px;">Melt Item</button>` : '<div style="font-size:11px; color:#94a3b8;">Unequipped items only.</div>'}
          </div>
          <div style="background:${PANEL_BG}; padding:8px 10px; border-radius:4px;">
            <div style="font-size:12px; font-weight:900; color:#c084fc;">Slot a Card 🃏</div>
            ${fittingCards.length ? `
              <select id="av-card-pick" class="dialogue-btn" style="padding:4px; width:100%;">
                ${fittingCards.map(c => `<option value="${engine.player.inventory.indexOf(c)}">${c.name}</option>`).join('')}
              </select>
              <button id="av-card" class="dialogue-btn dialogue-btn-quest" style="margin-top:4px;">Press Card In</button>`
              : `<div style="font-size:11px; color:#94a3b8;">No fitting card in bag.${selected.cardId ? ' (card seated)' : ''}</div>`}
          </div>
        </div>` : '<div style="font-size:12px; color:#94a3b8; margin-top:10px;">Select a piece of gear to work the anvil.</div>'}
      <div class="dialogue-actions-row" style="margin-top:12px;">
        <button id="av-close" class="dialogue-btn">Done ✕</button>
      </div>
    `;

    handle.modal.querySelectorAll('.av-gear').forEach(btn => {
      btn.addEventListener('click', () => {
        const [location, index, slot] = ((btn as HTMLElement).dataset.ref || '').split(':');
        selectedRef = { location: location as 'equip' | 'bag', index: Number(index), slot: slot || undefined };
        renderContent();
      });
    });

    handle.modal.querySelector('#av-enchant')?.addEventListener('click', () => {
      if (!selectedRef) return;
      const item = resolveGear(engine, selectedRef);
      if (!item) return;
      const cost = enchantCost(item);
      if ((engine.player.gold ?? 0) >= cost.gold && (engine.player.magicSubstance ?? 0) >= cost.magicSubstance && applyEnchant(item)) {
        engine.player.gold -= cost.gold;
        engine.player.magicSubstance = (engine.player.magicSubstance ?? 0) - cost.magicSubstance;
        audio.playSlash('heavy');
        engine.recomputeStats();
        engine.triggerSave();
      } else {
        playFail();
      }
      renderContent();
    });

    handle.modal.querySelector('#av-fuse')?.addEventListener('click', () => {
      if (!selectedRef) return;
      const item = resolveGear(engine, selectedRef);
      if (!item) return;
      const stones = unificationStoneCost(item.rarity);
      if (!Number.isFinite(stones)) { playFail(); return; }
      if ((engine.player.unificationStones ?? 0) < stones || (engine.player.gold ?? 0) < 500) { playFail(); return; }
      const fused = fuseResult(item);
      if (!fused) { playFail(); return; }
      engine.player.unificationStones = (engine.player.unificationStones ?? 0) - stones;
      engine.player.gold -= 500;
      if (selectedRef.location === 'bag') {
        engine.player.inventory[selectedRef.index] = fused;
      } else if (selectedRef.slot) {
        engine.player.equipment[selectedRef.slot as keyof typeof engine.player.equipment] = fused;
      }
      engine.particles.addFloatingText(engine.player.x, engine.player.y - 40, `UNIFIED → ${RARITY_CONFIGS[fused.rarity].name}!`, '#22d3ee', true, 18);
      audio.playLevelUp();
      engine.recomputeStats();
      engine.triggerSave();
      renderContent();
    });

    handle.modal.querySelector('#av-melt')?.addEventListener('click', () => {
      if (selectedRef?.location !== 'bag') { playFail(); return; }
      const item = engine.player.inventory[selectedRef.index];
      if (!item) return;
      const yield_ = meltYield(item);
      engine.player.inventory.splice(selectedRef.index, 1);
      engine.player.magicSubstance = (engine.player.magicSubstance ?? 0) + yield_.magicSubstance;
      engine.player.gold += yield_.gold;
      engine.player.diamonds = (engine.player.diamonds ?? 0) + yield_.diamonds;
      playOk();
      selectedRef = null;
      engine.triggerSave();
      renderContent();
    });

    handle.modal.querySelector('#av-card')?.addEventListener('click', () => {
      if (!selectedRef) return;
      const item = resolveGear(engine, selectedRef);
      const picker = handle.modal.querySelector('#av-card-pick') as HTMLSelectElement | null;
      if (!item || !picker) return;
      const cardIdx = Number(picker.value);
      const cardItem = engine.player.inventory[cardIdx];
      if (!cardItem || cardItem.type !== 'card') { playFail(); return; }
      const def = getCardById(cardItem.id.replace(/^item_/, ''));
      if (!def || !cardFitsSlot(def, item.type)) { playFail(); return; }
      item.cardId = def.id;
      engine.player.inventory.splice(cardIdx, 1);
      playOk();
      engine.recomputeStats();
      engine.triggerSave();
      renderContent();
    });

    handle.modal.querySelector('#av-close')?.addEventListener('click', () => {
      if (handle.overlay.parentNode) handle.overlay.parentNode.removeChild(handle.overlay);
    });
  };

  renderContent();
  mountModal(handle);
}

// ---------------------------------------------------------------------------
// MISSION BOARD (dailies/hourlies -> unification stones)
// ---------------------------------------------------------------------------

export function openMissionBoardModal(engine: SideViewEngine): void {
  audio.playPageTurn();
  const handle = createServiceModal('640px');

  const renderContent = () => {
    const views = getMissionViews();
    handle.modal.innerHTML = `
      <div class="dialogue-header-row">
        <div style="font-size:18px; font-weight:900; color:#ffd700;">📜 TOWN MISSION BOARD</div>
        ${walletRow(engine)}
      </div>
      <div style="font-size:12px; color:#cbd5e1; margin:4px 0 10px; font-style:italic;">
        Dailies pay Unification Stones for the anvil's fusion loop. The hourly hunt pays Keys of Power for Fatal runs.
      </div>
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${views.map(mission => `
          <div style="background:${PANEL_BG}; padding:8px 12px; border-radius:4px; display:flex; justify-content:space-between; align-items:center; gap:10px;">
            <div>
              <div style="font-size:12.5px; font-weight:900; color:#fef08a;">${mission.title}</div>
              <div style="font-size:11px; color:#cbd5e1;">${mission.description} (${mission.progress}/${mission.goal})</div>
              <div style="font-size:11px; color:#94a3b8;">
                Reward: ${mission.reward.gold ? `${mission.reward.gold}G ` : ''}${mission.reward.diamonds ? `💎${mission.reward.diamonds} ` : ''}${mission.reward.keysOfPower ? `🔑${mission.reward.keysOfPower} ` : ''}${mission.reward.unificationStones ? `⬥${mission.reward.unificationStones}` : ''}
              </div>
            </div>
            ${mission.claimed
              ? '<span style="font-size:11px; color:#4ade80; font-weight:900;">CLAIMED</span>'
              : mission.complete
                ? `<button class="ms-claim dialogue-btn dialogue-btn-quest" data-id="${mission.id}">Claim</button>`
                : `<span class="ms-progress">${Math.round((mission.progress / mission.goal) * 100)}%</span>`}
          </div>`).join('')}
      </div>
      <div class="dialogue-actions-row" style="margin-top:12px;">
        <button id="ms-close" class="dialogue-btn">Done ✕</button>
      </div>
    `;

    handle.modal.querySelectorAll('.ms-claim').forEach(btn => {
      btn.addEventListener('click', () => {
        const reward = claimMission((btn as HTMLElement).dataset.id || '');
        if (!reward) { playFail(); return; }
        const p = engine.player;
        if (reward.gold) p.gold += reward.gold;
        if (reward.diamonds) p.diamonds = (p.diamonds ?? 0) + reward.diamonds;
        if (reward.keysOfPower) p.keysOfPower = (p.keysOfPower ?? 0) + reward.keysOfPower;
        if (reward.unificationStones) p.unificationStones = (p.unificationStones ?? 0) + reward.unificationStones;
        audio.playFanfare();
        engine.triggerSave();
        renderContent();
      });
    });

    handle.modal.querySelector('#ms-close')?.addEventListener('click', () => {
      if (handle.overlay.parentNode) handle.overlay.parentNode.removeChild(handle.overlay);
    });
  };

  renderContent();
  mountModal(handle);
}
