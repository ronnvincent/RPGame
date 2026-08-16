---
name: rpgjs-game-and-gui
description: Build or extend RPGs with the RPGJS framework (@rpgjs/client, @rpgjs/server, npx degit rpgjs/starter) — GUI system (HUD, dialog, menus, inventories, sprite-attached tooltips) via CanvasEngine .ce or Vue overlays, prebuilt shops, loot/item drops, instanced dungeons, multiplayer parties, and character skills/abilities (@Skill entries, learnSkill/useSkill, @rpgjs/action-battle combat with BattleAi) — including a skill's animation/SFX not matching what it does, or missing sound, across a roster. Use whenever the user mentions RPGJS, RPG-JS, "rpgjs", @rpgjs packages, or is working in an RPGJS project (client.ts/server.ts/modules, RpgPlayer, RpgMap, RpgClientEngine, RpgWorld) — including "dungeon", "shop", "loot", "party", "co-op", "multiplayer", skill/ability VFX, combat sfx, or an attack/spell with the wrong animation or no sound. Do NOT use the plain-canvas pixel-game approach for RPGJS — it has its own architecture, GUI, and terminology instead of hand-rolled canvas code.
---

# RPGJS: Game Architecture & GUI System

RPGJS is a dedicated JS/TypeScript framework for building RPGs and MMORPGs (same codebase
for both) with a client/server split, map/event/player primitives, and a purpose-built GUI
system — this is **not** a "write raw canvas code" situation. Follow RPGJS's own patterns
instead of the general pixel-canvas-game approach.

**In this file:** versions & architecture · GUI system · shops · dungeons (instancing) ·
multiplayer parties · loot & drops · using provided assets (spritesheets/tilesets/SFX) ·
**skill abilities — animation & SFX wiring** · v4 legacy notes · common pitfalls.

## First: check for the official RPGJS skill

RPGJS ships and maintains its own skill for coding agents. If the project doesn't already
have it, the single best move is to install it rather than rely solely on this file:

```bash
npx skills add https://github.com/RSamaium/RPG-JS#v5
```

This file is a lighter orientation layer on top of that — useful for quick GUI decisions and
as a fallback if the official skill isn't installed, but the official skill (and the live docs
below) should win on any specific API detail, since RPGJS is under active development and this
file can go stale.

**Docs index (fetch this first when you need specifics):** `https://v5.rpgjs.dev/llms.txt`
— it lists every doc page (guides, GUI, hooks, full API reference). Fetch the specific page
you need rather than guessing at API shapes from memory.

## Which version?

- **v5** (current): CanvasEngine-based rendering (`.ce` files), Vite-based starter
  (`npx degit rpgjs/starter#v5`), dependency-injection style providers (`provideX()`),
  `defineModule`. Docs at `v5.rpgjs.dev`.
- **v4** (legacy, still common in older tutorials/existing projects): Vue-2-flavored DOM GUI
  components, `@RpgModule<RpgClient>({...})` decorators, `RpgGui` class. Docs at
  `docs.rpgjs.dev`.
- A `compatibilityV4Plugin()` exists in `@rpgjs/vite` to run v4-shaped modules on the v5
  runtime. If you're told the project is "RPGJS" with no version, check the project's
  `package.json` for `@rpgjs/client`'s version, or ask.

Everything below is v5 unless marked **[v4]**.

## Core architecture: client/server split

RPGJS always separates **server** (authoritative game state: HP, gold, inventory, map
position, event logic) from **client** (rendering, input capture, GUI). Don't put gameplay
logic that must be trustworthy (damage, loot, currency) in client-only code — do it in server
hooks so a modified client can't cheat.

```
client.ts / standalone.ts   entry point: startGame(...) with providers
server.ts                   createServer({ providers: [...] })
config/config.client.ts     shared client config: spritesheets, sounds, keyboardControls
modules/main/
  server/
    player.ts                RpgPlayerHooks: onConnected, onInput, onJoinMap...
    events/                  NPCs / interactive map objects (onAction, onTouch...)
  client/
    gui/                     .ce and/or .vue GUI components
    sprite.ts                 client-side sprite hooks (optional)
maps/                        Tiled maps (.tmx) via @rpgjs/tiledmap
```

Player state lives on `RpgPlayer` (server-side) — HP/SP/level via **Parameter Commands**,
gold via **Gold Commands**, items/equipment via **Item Commands**, `player.gui(id)` to talk to
GUI. Fetch `https://v5.rpgjs.dev/api/player/index.md` for the full command reference when
you need exact method names.

## GUI system — the part you asked about

RPGJS explicitly separates two layers; picking the right one matters:

| You need... | Use |
|---|---|
| A passive label/bar that just follows a sprite (nameplate, floating damage number) | **Sprite Components** / **Authoritative Sprite Components** (`/guide/components-overview`) |
| Something that opens/closes, takes input, and talks back to the server (HUD, dialog, shop, inventory, menu, tooltip) | **GUI** (`/gui/index`) |

Rule of thumb: if it can be *opened*, *hidden*, or *sends interactions back to the server*,
it's a GUI, not a component.

### Two ways to render a GUI

1. **CanvasEngine `.ce` components** — render inside the canvas itself, share the game's
   render loop. RPGJS's own prebuilt GUIs (dialog, shop, main menu, save, title screen,
   game over) are built this way by default.
2. **Vue 3 overlay** (`@rpgjs/vue`) — renders as a DOM layer above the canvas
   (`#vue-gui-overlay`). Easier for anyone who wants normal HTML/CSS/Vue tooling (devtools,
   familiar styling, easy layout) instead of drawing inside the canvas. You can even replace a
   *prebuilt* GUI (dialog, shop, etc.) with a Vue component while keeping the same server API
   calls — register a Vue GUI under the same `PrebuiltGui.*` id.

For a GUI-heavy project (inventories, shops, complex menus), reach for the Vue path — it's
dramatically less fiddly than hand-drawing UI inside `.ce` canvas components. Reserve `.ce`
for GUI that must feel embedded in the world (floating tooltips tightly synced to a sprite).

### The core GUI flow (same for both render styles)

```ts
// Server: open a GUI and pass it data
await player.gui('inventory').open({ items: player.getItems(), gold: player.gold })

// Server: listen for an action the GUI sends back
player.gui('inventory').on('use-item', ({ itemId }) => {
  player.useItem(itemId)
})
```

```vue
<!-- Client (Vue): receive data as props, send actions back, close itself -->
<script setup>
import { inject } from 'vue'
defineProps({ items: Array, gold: Number })
const rpgGuiClose = inject('rpgGuiClose')
const rpgGuiInteraction = inject('rpgGuiInteraction')
function useItem(item) { rpgGuiInteraction('inventory', 'use-item', { itemId: item.id }) }
</script>
<template>
  <div class="inventory" v-propagate>
    <button @click="rpgGuiClose('inventory')">Close</button>
    <p>Gold: {{ gold }}</p>
    <button v-for="i in items" :key="i.id" @click="useItem(i)">{{ i.name }}</button>
  </div>
</template>
```

Register it on the client:
```ts
provideVueGui({ selector: '#vue-gui-overlay', createIfNotFound: true }),
provideClientModules([{ gui: [{ id: 'inventory', component: Inventory }] }])
```

Key injections available inside a Vue GUI component: `rpgGuiClose`, `rpgGuiInteraction`,
`rpgCurrentPlayer` (Observable of the current player's live state — subscribe to it for a
reactive HP/gold display), `rpgEngine`, `rpgSocket`, `rpgKeypress`, `rpgSound`. Use
`v-propagate` on any element that should still forward mouse/wheel events to the game canvas
underneath (e.g. a translucent HUD you can click through).

### Built-in HUD

RPGJS already ships an HP/SP/level HUD component (`HudComponent`) — don't rebuild one from
scratch for the common case:
```ts
gui: [{
  id: 'hud',
  component: HudComponent,
  autoDisplay: true,
  dependencies: () => { const engine = inject(RpgClientEngine); return [engine.scene.currentPlayer] }
}]
```
It optionally renders a faceset portrait when you pass `data: { faceset: { id, expression } }`.
Only build a custom HUD component when you need fields the built-in one doesn't show (e.g. a
custom stamina bar) — subscribe to `rpgCurrentPlayer` and read the relevant param.

### Attached GUI (tooltips / contextual widgets that follow a sprite)

```ts
{ gui: [{ id: 'player-tooltip', component: Tooltip, attachToSprite: true }] }
```
```ts
// server
player.showAttachedGui()
player.hideAttachedGui()
```
The component receives `object` (live player/event data) and `spriteData` (snapshot at open
time — don't use it for anything that must stay live) as props.

### Replacing a prebuilt GUI (dialog, shop, menu, save, title screen, game over)

Register your own component under the matching `PrebuiltGui.*` id — the server side
(`player.showText()`, `player.showChoices()`, `player.gui('rpg-shop').open(...)`, etc.) keeps
working unchanged; only the rendered component changes. Check
`https://v5.rpgjs.dev/gui/prebuilt-contracts.md` for the exact data/interaction contract of
each prebuilt GUI (what data it receives, what close-value it expects) before replacing one —
mismatching the contract is the most common bug here.

## Shops

RPGJS ships a **prebuilt shop GUI** — don't build a buy/sell screen from scratch. The flow:

1. **Define items in the database.** Items are registered with an `@Item` decorator (v4
   syntax shown; check `https://v5.rpgjs.dev/guide/create-database.md` and
   `https://v5.rpgjs.dev/guide/items.md` for the exact v5 registration shape, which may use
   `defineModule`/`createModule` instead of the decorator like GUI registration does):
   ```ts
   import { Item } from '@rpgjs/database'
   @Item({ name: 'Potion', description: 'Gives 100 HP', price: 200, hpValue: 100, consumable: true })
   export class Potion {
     onUse(player) { /* optional extra effect on use */ }
   }
   ```
   `price` is what makes an item buyable/sellable — an item with no `price` can't appear in a
   shop.
2. **Open the shop GUI from an event** (an NPC's `onAction`, or a map trigger), passing which
   items it stocks:
   ```ts
   await player.showShop({ items: [Potion, /* ...other item classes/ids */] })
   // or, depending on version: player.gui('rpg-shop').open({ items: [...] })
   ```
3. **Customize the look** by registering your own component (Vue or `.ce`) under the shop's
   prebuilt GUI id, same pattern as replacing any other prebuilt GUI — see "Replacing a
   prebuilt GUI" above. Check `prebuilt-contracts.md` for the shop's exact data/interaction
   contract (item list shape, buy/sell event names, close behavior) before replacing it.

Keep price/stock authority server-side: the shop GUI should only ever display what the server
sends it and send back item ids/quantities to buy — never trust a client-submitted price.

## Dungeons (instanced maps)

RPGJS has no single "dungeon" primitive — a dungeon is just a **map** (or a small set of
linked maps), and the interesting part is how you *instance* it so each group gets their own
copy instead of everyone sharing one dungeon map. RPGJS's building blocks for this:

- **Every map is already a multiplayer room** — players on the same map id are automatically
  in the same synchronized space; players on a different map id are isolated from each other,
  which is exactly what an instance needs.
- **`canChangeMap(player, nextMap)`** (a `RpgPlayerHooks` method) — gate entry: check the
  player is in a valid group/has the key/meets the level requirement before letting them into
  the dungeon map, `showText()` a reason and return `false` to block it otherwise.
- **`RpgWorld`** (`getPlayersOfMap(mapId)`, `getPlayer(id)`, `.changes` observable) — server-
  side visibility into who's currently in a given map/instance, useful for "party wipe" or
  "all party members reached the exit" checks.
- **`syncSchema`** on a `RpgMap`/map class — attach custom synchronized state to a map
  instance itself (e.g. `bossHp`, `doorsOpen`, `clearTime`), not just to individual players.
- **World maps** (`worldMaps`, `@rpgjs/tiledmap`, `https://v5.rpgjs.dev/guide/create-world.md`
  / `world-maps.md`) — useful for stitching multiple dungeon *rooms* together into one
  explorable world, as opposed to a single map.

### The instancing pattern

Give each group's copy of the dungeon a **unique map id** (e.g. `dungeon-goblin-cave-<groupId>`)
instead of routing everyone to a shared `dungeon-goblin-cave` id:

```ts
// server: when a group is ready to enter
async function enterDungeon(groupPlayers: RpgPlayer[], groupId: string) {
  const instanceMapId = `goblin-cave-${groupId}`
  for (const player of groupPlayers) {
    await player.changeMap(instanceMapId, { x: 64, y: 64 })
  }
}
```

If the map id hasn't been used yet, RPGJS creates a fresh instance of that map from its
definition (empty of other players, monsters reset); reusing the same `groupId` for the same
party sends them back into their still-in-progress instance rather than a new one. Tear the
instance down (or just let it idle empty) once the last player leaves — check
`RpgWorld.getPlayersOfMap(instanceMapId).length === 0` on `onLeave` in the map class.

For loot/boss state that must be consistent for the whole party (not per-player), keep it on
the map instance's `syncSchema` state or in a small server-side struct keyed by `groupId`, and
have the exit/boss-death event check "did every member of this group reach here" via
`RpgWorld.getPlayersOfMap(instanceMapId)` before completing the dungeon.

## Multiplayer: parties/groups clearing a dungeon together

RPGJS also has no built-in "party" class — you build grouping on top of `RpgPlayer` +
server-side bookkeeping. A workable pattern:

1. **A server-side party registry** (plain object/Map keyed by `groupId`, or a small class if
   you prefer): tracks which player ids belong to which group, a leader, and an invite/ready
   state. This lives in your own server module, not in RPGJS core.
2. **Party UI as a GUI**, not a component — it opens, shows members (subscribe to each
   member's `rpgCurrentPlayer`-equivalent server-side state), and sends "invite"/"accept"/
   "leave" interactions back to the server the same way the inventory example above does.
3. **Forming up before the dungeon**: gate the dungeon's entrance event/`canChangeMap` on
   "is this player in a ready, sufficiently-sized party" rather than letting solo players in
   directly (unless you want solo dungeon runs too).
4. **Entering together**: once the party is ready, loop over party member ids and
   `changeMap()` all of them into the same instanced map id from the pattern above (e.g.
   `dungeon-${groupId}`) so they land in the same room.
5. **Shared consequences**: use the map instance's `syncSchema` (or a per-group struct) for
   anything that should be shared — boss HP, doors, a shared kill counter, "3 of 4 members
   reached the exit" — and read individual player state (`player.hp`, `player.gold`, XP) off
   each `RpgPlayer` for anything that's personal.
6. **Handling disconnects/leaves mid-dungeon**: hook `onLeave` on the player or map to decide
   policy — pause the encounter, let remaining members continue, or eject the whole party — this
   is a design decision RPGJS won't make for you.

This is a composition of existing RPGJS primitives (maps-as-rooms, `RpgWorld`, GUI, player
hooks, `syncSchema`), not a single documented "party system" API — if the official docs (or
the `npx skills add` RPGJS skill, which is more likely to be current) describe a newer
built-in party/group primitive by the time you're reading this, prefer that over hand-rolling
the registry described here.

## Loot & item drops

A shaky loot system is almost always one of a few specific problems — worth diagnosing before
rewriting from scratch. Ask (or check) which of these the current implementation is missing:

- **Not weighted / feels random in a bad way** — a flat "each item has an independent X%
  chance" table produces streaks (nothing for 10 kills, then 3 drops in a row) and doesn't let
  you tune rarity cleanly. Prefer a **weighted table with guaranteed total**: give every
  possible drop (including "nothing") a weight, sum the weights, roll one random number in
  that range, and walk the table to find which bucket it lands in. This gives you one roll per
  kill instead of N independent rolls, and rarity tuning is just "change one number."
  ```ts
  type Drop = { item: ItemClass | null; weight: number; min?: number; max?: number }
  function rollDrop(table: Drop[]): Drop {
    const total = table.reduce((s, d) => s + d.weight, 0)
    let r = Math.random() * total
    for (const d of table) { if ((r -= d.weight) <= 0) return d }
    return table[table.length - 1]
  }
  ```
  Keep the table itself as data (per enemy type / per chest), not inline `if` chains — makes
  balancing loot painless and is the difference between "tweak a number" and "hunt through code."

- **Roll and grant server-side, on the authoritative death event, exactly once.** A common bug
  source is rolling loot in a place that can run twice (e.g. both a damage-death check and a
  cleanup pass) or rolling it client-side where a modified client could roll favorably or
  duplicate items. Use `player.addItem(ItemClass, nb)` (see v4/v5 Item Commands docs) from the
  server-side enemy-death hook, guarded by a `dead`/`looted` flag on the enemy so a second call
  is a no-op.

- **Ground-dropped items in multiplayer need their own synced entity, not a per-player
  illusion.** If loot drops as a pickup on the map (rather than going straight to inventory),
  it has to be a real map object other players can also see and race for — not something each
  client renders independently, or players will see different things and duplicate/lose items.
  Represent it as a lightweight server-tracked object on the map (position, item id, claimed
  flag) and remove/sync it for everyone the instant one player picks it up.

- **Decide loot ownership explicitly in a party.** "First to click wins," "round-robin," and
  "everyone gets a roll, highest wins" are all valid, but pick one on purpose — the usual
  "not that good" complaint in co-op is unclear or unfair ownership (loot invisible to
  everyone but whoever tagged the enemy, ninja-looting, etc.). If you want per-player drops
  instead of shared ground loot (simplest to get right in multiplayer), roll and grant loot to
  each eligible party member independently rather than spawning one shared pickup.

- **No rarity/visual feedback** — even a good drop table feels bad with zero signal. Cheap
  wins: a distinct pickup color/icon per rarity tier, a brief flash/text ("+1 Potion", "Rare
  drop!") via the GUI or a client visual, and a slightly longer despawn timer for rarer drops
  so players have time to notice and grab them.

- **Nothing ever expires.** Ground loot with no despawn timer accumulates and clutters
  long-running maps/instances (especially inside a dungeon instance from the section above).
  Give pickups a lifetime and sweep them on a timer or on instance teardown.

Relevant references: `https://v5.rpgjs.dev/api/player/item-commands.md` (add/remove/use/has
item on the server-side player), `https://v5.rpgjs.dev/guide/create-database.md` and
`.../items.md` (defining the droppable items themselves), `https://v5.rpgjs.dev/guide/projectiles.md`
as a pattern reference for *any* server-authoritative object that needs to exist on the map and
sync to clients (ground loot has the same shape: server spawns it, clients render it, server
resolves the pickup).

## Use the assets the user already provided — don't reinvent placeholders

If the user has supplied real map files (`.tmx`/`.tsx`), spritesheets, VFX sheets, animations,
or SFX/music files, **use those** — inspect them and wire them into RPGJS's asset config
rather than falling back to generic placeholder art, silently dropping files that don't get
referenced anywhere, or improvising new assets that duplicate what was already given. A common
failure mode is treating provided files as inert and just not looking at them closely enough to
use correctly. Before writing any spritesheet/tileset/animation code:

1. **Actually open and inspect the asset files** — pixel dimensions of the image, how many
   distinct frames/tiles it visually contains, whether it's one image (a combined sheet — this
   is normal and expected, see below) or several. Don't guess frame counts/sizes from a
   filename or from memory of "typical" RPG Maker dimensions; check the real file.
2. **Register every relevant file** in the client config (`spritesheets: [...]`, `sounds:
   [...]` in `config.client.ts` / module config) so it's actually loadable — an asset that's
   never registered is an asset that's never used, no matter how good it is.
3. **Match config to the file, not the other way around.** Get the frame grid, tile size, and
   margin/spacing values from what the image actually contains; don't paste a config from a
   different sheet/tutorial and expect it to line up.

## Combined sheets are normal — RPGJS slices them via config, not via separate files

If the complaint is "the map/VFX files are one combined image instead of sliced into individual
per-frame files, and that's causing bugs" — the combined single-file format is actually the
*correct* and expected format for both spritesheets and Tiled tilesets in RPGJS. You almost
never want to pre-slice a sheet into hundreds of individual PNGs; RPGJS (like every Tiled/PixiJS-
based engine) slices a combined image at runtime by reading a **grid config** (frame width,
frame height, and for tilesets, margin/spacing) and computing `frameX`/`frameY` offsets into it.
The actual bug is almost always that the grid config doesn't match the real file, not that the
file needs to be pre-sliced. Symptoms of a mismatched config: wrong/partial frames showing,
animations that glitch or show adjacent frames, tiles that render shifted or show the wrong
graphic on a map.

**Character/VFX spritesheets** — the `@Spritesheet` decorator (or the `Presets.RMSpritesheet(cols, rows)`
shortcut for RPG-Maker-style sheets) needs the frame grid to match the real image:
```ts
import { Spritesheet, Presets } from '@rpgjs/client'
// Shortcut for a standard RPG-Maker-style character sheet (3 cols x 4 rows of frames)
@Spritesheet({ ...Presets.RMSpritesheet(3, 4) })
export class HeroCharacter {}

// Or full manual control when the sheet isn't RM-standard shaped:
@Spritesheet({
  framesWidth: 4,   // number of frame columns in the image
  framesHeight: 4,  // number of frame rows in the image
  textures: {
    walk: { animations: (direction) => [[
      { time: 0,  frameX: 0, frameY: direction },
      { time: 10, frameX: 1, frameY: direction },
      { time: 20, frameX: 2, frameY: direction },
      { time: 40 } // total animation duration
    ]] }
  }
})
export class Hero {}
```
`framesWidth`/`framesHeight` are *frame counts*, not pixel sizes — RPGJS derives per-frame
pixel size by dividing the actual image dimensions by these counts. So: get the real image's
pixel width/height, count how many frames are actually laid out across and down (inspect the
image, don't assume), and set `framesWidth`/`framesHeight` to those counts exactly. An off-by-
one here is the single most common cause of "wrong frame shows" / "animation looks glitchy" bugs.

**Tilesets on maps** — Tiled (`.tmx`) references a tileset (`.tsx` or inline) that points at one
combined tileset image plus `tilewidth`/`tileheight`/`margin`/`spacing`. If the map has visual
bugs (wrong tile appears, tiles offset, seams), the fix is almost always correcting those four
numbers to match the actual tileset image — not slicing the tileset into separate tile files.
RPGJS consumes this via `@rpgjs/tiledmap` (`provideTiledMap()`); if the user authored/exported
the map in Tiled itself, trust the `.tsx`'s existing values first and check they match the PNG
before changing anything on the RPGJS side.

**Non-uniform VFX (frames of different sizes, not a clean grid)** — if a provided VFX/animation
sheet genuinely isn't laid out as a uniform grid (varying frame sizes, packed irregularly),
that's the one case where a real slicing/atlas step helps: use an image library (`sharp` in
Node, or `Pillow` in Python via `bash_tool`) to crop it into a JSON atlas (frame name → {x, y,
w, h}) or into individual frame files, and reference that atlas instead of forcing it through
the uniform-grid `@Spritesheet` config. Don't reach for this for ordinary uniform character/tile
sheets — it's unnecessary work and extra files to keep in sync for the common case.

**SFX/music** — same registration principle: every provided sound file needs to be declared in
`sounds: [...]` (with the id gameplay code will reference) or it's dead weight the game never
plays; check `https://v5.rpgjs.dev/guide/create-sounds.md` / `sounds.md` for exact registration
shape if unsure.

## Skill abilities: when animation or SFX doesn't match what the skill does

"The skill's description says one thing, the animation shows another, and nothing plays for
sound" is almost never an engine bug — it's a wiring gap. A skill's `name`/`description` are
just display text; RPGJS never derives what plays visually or audibly from them. Animation and
sound are separate fields/calls that have to be pointed at the right asset by hand, once per
skill. With a whole roster (e.g. 8 characters), the near-universal cause is that character #2
onward were duplicated from character #1's definition and only the flavor text — and maybe
`power`/`spCost` — got updated afterward, while the animation/sound references stayed pointed at
the original. Where that wiring actually lives depends on how the project uses skills:

**Plain skills** (`player.learnSkill()` / `player.useSkill()`, no Action Battle module) — the
skill's own `onUse(player, target?)` hook is the *only* place feedback gets triggered. If it's
missing, or calls a leftover animation id, that's the whole bug:

```ts
@Skill({ name: 'Frost Nova', description: 'Freezes nearby foes' })
export class FrostNova {
  onUse(player, target) {
    player.showAnimation('fireball-explosion') // leftover from copy-pasting Fireball
    // no player.playSound(...) call anywhere -> silent
  }
}
```

Fix by pointing `showAnimation()`/`showComponentAnimation()` at the graphic that actually matches
the skill, and adding a `playSound()` call — see `https://v5.rpgjs.dev/guide/display-animations.md`
and `https://v5.rpgjs.dev/guide/create-sounds.md` for exact signatures. For a skill that should
flash, play a sound, and show a hit number together, group them behind one **Client Visual**
(`clientVisuals: { skillName(ctx, helpers) { helpers.animation(...); helpers.sound(...) } }`,
triggered with `player.clientVisual('skillName', {...})` — see
`https://v5.rpgjs.dev/guide/client-visuals.md`) instead of separate calls, so duplicating the
skill later carries the whole bundle instead of leaving pieces behind.

**`@rpgjs/action-battle` skills** (`BattleAi.attackSkill`, player action bar) have three places
that all have to agree — across a whole roster, that's three chances per character for one to
drift out of sync:

1. **The skill's own `sound` / `impactSound` fields.** Action Battle resolves cast/impact audio
   in this order: the skill's field, then the source enemy, then a project default, then a
   built-in default. No value at *any* of those levels plays nothing — with no error — which
   reads exactly like "no sfx."
2. **The `animations` map** — set globally via `provideActionBattle({ animations: { attack, hurt,
   die, castSkill } })`, or per-character via `new BattleAi(event, { animations: {...} })`. **A
   per-character block completely overrides the global one for that character**, so a duplicated
   character whose block still says `castSkill: 'warrior_slash'` will swing a sword for a spell no
   matter what the skill's `name` says. If the animation graphics come from RPGJS Studio, note the
   field is spelled `castSpell` there (via `createStudioActionBattleAnimations()`) — mixing a
   Studio-driven character with one manually configured under the plain `castSkill` key is a
   subtle way to get a silently-ignored animation.
3. **A custom `onUse(user, target, ctx)`**, if the skill needs bespoke behavior beyond the default
   effect — a hardcoded projectile `type` or `ctx.component()` id here is a third place a stale
   reference can hide.

```ts
// character-4-mage.ts, duplicated from character-1-warrior.ts
new BattleAi(this, {
  attackSkill: ArcaneBolt,        // updated
  animations: {
    attack: 'warrior_slash',      // not updated — mage still swings a sword
    castSkill: 'warrior_slash',   // not updated — no spell VFX plays
  }
})
```

**Diagnostic pass for "the roster's skills don't line up":** for each character, line up its
skill's `name`/`description` against the actual graphic id in `animations`/`onUse` and the actual
id in `sound`/`impactSound` — a quick table (character, skill name, animation id used, sound id
used) surfaces stale copy-paste in seconds where reading through each file separately won't. Then
confirm every sound id in that table is actually registered in the client's `sounds: [...]` array
(see assets above) — an unregistered id also fails silently instead of erroring. Full API shapes:
`https://v5.rpgjs.dev/guide/battle-ai.md` (skills/animations/BattleAi),
`https://v5.rpgjs.dev/api/player/skill-commands.md` (plain `SkillObject` shape).

## [v4] If the project is legacy v4

- GUI components are Vue-2-style options objects, registered via `@RpgModule<RpgClient>({ gui: [...] })`.
- `player.gui('my-gui').open(data)` / `.on('event', cb)` server-side API is the same idea as v5.
- Inject helpers inside a v4 Vue GUI: `inject: ['rpgCurrentPlayer', 'rpgGuiInteraction', 'rpgKeypress', 'rpgSocket', 'rpgResource', 'rpgEngine']` — same names carried forward into v5's injection list above.
- Don't prefix your own GUI ids with `rpg-` — that prefix is reserved for RPGJS's prebuilt GUIs.
- Attaching to a sprite: add `rpgAttachToSprite: true` on the component (v5 equivalent:
  `attachToSprite: true` in the module config).
- React is also supported for v4 GUIs (`@rpgjs/react`-style pattern) if the project already
  uses React elsewhere — same `player.gui(id).open(data)` server contract either way.

## Common pitfalls

- **Building UI logic in the client that should be authoritative** (loot, damage, currency) —
  compute it server-side and push results to the GUI via `.open(data)`, don't let the client
  decide.
- **Confusing Components and GUI** — a passive nameplate doesn't need open/close/interaction
  semantics; forcing it through the GUI system is more ceremony than it needs. Conversely, an
  inventory built as a "component" instead of a GUI won't get input/interaction wiring for free.
- **Replacing a prebuilt GUI without matching its contract** — check `prebuilt-contracts.md`
  first; a mismatched prop shape or wrong close-value silently breaks the flow it's replacing
  (e.g. `player.showChoices()` expects the dialog to close with a numeric choice index).
- **Forgetting `v-propagate`** on Vue GUI elements that need to pass clicks/scroll through to
  the game canvas underneath (common with translucent overlays).
- **Mixing v4 and v5 patterns** in the same file (e.g. `@RpgModule` decorators inside a v5
  `defineModule` project) — check which version's docs you're pattern-matching against.
- **Guessing at exact method names instead of checking the API reference** — RPGJS's player
  API is large (parameters, gold, items, skills, states, elements, hotbar, moves, GUI,
  effects, battle each have their own command reference page under `/api/player/`). Fetch the
  relevant page rather than assuming a method exists.
- **Routing every party into the same shared dungeon map id** — that puts every group in one
  room instead of instancing; give each group's dungeon run its own map id (see Dungeons above).
- **Letting the client compute shop prices, loot, or dungeon completion state** — keep those
  server-side and only send the GUI what it should display; treat any client-submitted
  gold/price/item value as untrusted.
- **Inventing a "party" or "dungeon" API that doesn't exist** — RPGJS doesn't ship named
  primitives for these; they're patterns built from maps-as-rooms, `RpgWorld`, GUI, and player
  hooks. Don't assume a `player.party` or `Rpg.Dungeon` class exists without checking docs.
- **Loot rolled or granted more than once** — no idempotency guard on the enemy-death hook, so
  a double-fired event (or a client retry) duplicates the drop. Guard with a `looted` flag.
- **Ground loot that's only correct for one client** — rendering a drop locally instead of as
  a real server-tracked, synced map object causes players to see different loot states or
  duplicate/lose items in multiplayer.
- **Ignoring provided assets and generating placeholder art/sound instead** — if the user
  supplied real maps/spritesheets/VFX/SFX, inspect and wire those in; don't invent new assets
  or leave provided files unregistered.
- **Spritesheet/tileset config that doesn't match the real file** — `framesWidth`/
  `framesHeight` (or a tileset's `tilewidth`/`tileheight`/`margin`/`spacing`) pasted from a
  different sheet/tutorial instead of measured from the actual asset is the most common cause
  of glitchy animations and visually broken maps — check the real file's dimensions first.
- **A skill's animation/SFX doesn't match its name/description** — nothing links flavor text to
  what plays; it's always a stale reference in `onUse`, a per-character `animations` override, or
  a missing `sound`/`impactSound`/`playSound()` call, most often left over from duplicating one
  character's skill into another's. See "Skill abilities" above for the diagnostic pass.
