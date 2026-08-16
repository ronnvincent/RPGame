---
name: rpg-gui-visual-polish
description: Make an RPG or pixel-art game's GUI (HUD, dialogue box, inventory, shop, menus, item/skill icons, cursor, status effects, damage numbers) look and feel like a shipped, professional game instead of a plain-CSS web form — by (1) auditing every asset folder for GUI-specific art (window-skin/panel textures, icon atlases, cursor graphics, bitmap/pixel fonts, portraits, particle sheets) before writing any GUI code, since these are the files most often found-but-unused even on projects where character/tileset assets get used correctly, and (2) applying real game-UI techniques (9-slice/nine-patch panels via border-image or PixiJS NineSlicePlane, icon-sheet slicing, pixelated/nearest-neighbor image rendering, cursor-driven selection feedback, open/close motion, a palette pulled from the game's own art) instead of generic rounded-rectangle-with-drop-shadow styling. Use whenever the user asks to improve, polish, redesign, restyle, or "make better" a game's GUI/UI/HUD/menus/inventory/shop screen, says a GUI looks "plain", "default", "programmer art", "like a website", or "not as good as [another game]", or mentions having UI/icon/font assets that existing GUI code isn't using. Pairs with an engine-specific GUI-wiring skill (e.g. rpgjs-game-and-gui) when one is present — this file covers visual fidelity and asset utilization, not engine API wiring.
---

# RPG GUI: Visual Polish & Asset Maximization

This pairs with an engine/architecture GUI skill (e.g. `rpgjs-game-and-gui`) rather than
replacing it: that skill gets a GUI *working* — open/close, server data, interaction wiring.
This one makes it *look* like it belongs in a shipped RPG instead of a styled `<div>`, and makes
sure the art the user actually has sitting in their asset folders is the thing doing that work.

**In this file:** why GUI art specifically gets missed · the asset audit to run before writing
any GUI code · what actually reads as "professional RPG" vs "web form" · 9-slice panels (the
single highest-leverage fix) · icons, cursor & fonts · motion/feedback ("juice") · a worked
before/after · matching a named reference game · RPGJS quick-reference · common pitfalls.

## Why GUI art specifically gets missed

A project can have its character spritesheets and tilesets correctly inspected and wired in and
*still* end up with a GUI that looks like a generic admin panel. The reason is that GUI art
doesn't look like the asset type an agent is already primed to look for: a spritesheet is
obviously "a grid of animation frames," but a window-skin texture, an icon atlas, a cursor
strip, or a bitmap font file don't pattern-match to that the same way, so they don't trigger the
same "open it and inspect it" reflex. On top of that, a request like "improve the GUI" reads as
a styling task, and the fastest way to satisfy a styling task is to write more CSS — which never
requires opening the assets folder at all. The result is a GUI built entirely out of colors,
gradients, and border-radius, sitting right next to art files that were never opened. Treat any
GUI request as an asset-inventory question first and a styling question second.

## Before writing any GUI code: audit GUI assets

1. **List every folder that could hold GUI art**, not just the ones the current task happens to
   mention: `assets/gui/`, `assets/ui/`, `hud/`, `windowskin*`, `iconset*`, `icons/`, `cursor*`,
   `fonts/`, `panels/`, `frames/`, `portraits/`, `faces/`. Many RPGJS projects draw from
   RPG-Maker-adjacent asset packs, so also check for `Window.png`, `IconSet.png`, or a folder
   literally named `img/system/`.
2. **Open every image you find and actually look at it** — don't infer contents from the
   filename or a "typical" size. Note the real pixel dimensions and what's laid out inside: a
   border/corner pattern, a grid of icons, a single portrait, an animated cursor strip.
3. **Build a quick table** mapping file → what it contains → which GUI element it belongs to,
   before writing a single component. This is the same discipline as a sprite/skill audit table
   — cheap to build, and it's the difference between "I have assets" and "the assets are used."

   | File | Contains | Use for |
   |---|---|---|
   | `gui/windowskin.png` | 96×96, border+corner pattern, transparent center | 9-slice background for every panel (HUD, dialogue, shop, menu) |
   | `gui/iconset.png` | 512×512, 32px icons in a 16×16 grid | item/skill/status icons, sliced by index |
   | `gui/cursor.png` | 4 frames × 16×16, arrow | menu selection cursor |
   | `fonts/pixel-serif.ttf` | bitmap-style pixel font | all GUI text |
   | `gui/portraits/*.png` | one bust image per character | dialogue box portrait |

   (Illustrative — build the real table from whatever files actually turn up.)
4. **For every element about to be built, check the table first.** If a matching asset exists,
   use it — don't fall back to a flat CSS color because it's quicker to type. If nothing genuinely
   fits a specific element, say so explicitly instead of silently substituting a generic box, and
   either ask or derive the new element's palette/border style from the assets that *do* exist so
   it doesn't visually clash with everything around it.

## What actually reads as "professional RPG" vs "styled web form"

"Make the GUI better" almost never needs more elements — it needs a handful of specific,
well-known techniques that shipped RPG GUIs use by default and a quick CSS pass skips by default:

- **Panels built from a 9-sliced window-skin texture**, not `border-radius` + `box-shadow` on a
  flat color (see below — this is the single biggest tell either way).
- **Icons from a shared sheet, sliced by index** — not loose per-icon files at inconsistent
  sizes, and not emoji/Unicode glyphs standing in for real icons.
- **A real cursor/selector graphic** that moves between menu options, rather than only a
  `:hover` background-color swap.
- **The game's own font**, rendered pixel-crisp — not the browser default, and not blurry from
  default image smoothing.
- **Motion on open/close and on feedback moments** — a menu that slides or scales in, a damage
  number that floats and fades — instead of instant show/hide.
- **A palette pulled from the game's own tileset/spritesheet**, not default framework colors
  (Bootstrap blue, Material gray, pure-white panels) that visually fight hand-drawn pixel art.
- **Portraits in dialogue and small status-icon badges near HP**, if the assets exist, instead of
  plain text with no visual indicator.

## 9-slice panels: the single highest-leverage fix

A flat rectangle with `border-radius`/`box-shadow` is the #1 tell of an unstyled or
placeholder-feeling game panel. Real RPG panels stretch one small "window-skin" texture (a
border/corner pattern around a transparent or fillable center) to any size via **9-slice
scaling**, so the border stays crisp at any panel size instead of smearing like a scaled-up
photo.

For a Vue-overlay GUI, this needs no extra library — it's plain CSS:
```css
.window-panel {
  border-style: solid;
  border-width: 16px; /* measure this from the real file — don't guess */
  border-image: url('/assets/gui/windowskin.png') 16 fill repeat;
  image-rendering: pixelated; /* keep the border crisp, not smoothed */
}
```
`16` is the slice inset in source pixels — get it from the actual image, the same "measure, don't
guess" rule that applies to spritesheet frame counts. `fill` reuses the center slice as the
panel's background too, so a separate background layer usually isn't needed.

For `.ce`/CanvasEngine GUI: CanvasEngine renders on PixiJS, which has 9-slice support built in
(`NineSlicePlane`) for exactly this. Check the CanvasEngine docs
(`https://v5.rpgjs.dev/llms.txt`) for how it's exposed at the `.ce` component level rather than
assuming a specific wrapper API — the underlying technique is identical either way: one texture,
a measured slice inset, stretch instead of scale.

## Icons, cursor & fonts

**Icon sheet** — same slicing principle as a character spritesheet (grid from the real file, not
a guess), just simpler since it's usually a static grid rather than animation frames:
```css
.icon {
  width: 32px; height: 32px;
  background-image: url('/assets/gui/iconset.png');
  background-position: calc(var(--col, 0) * -32px) calc(var(--row, 0) * -32px);
  image-rendering: pixelated;
}
```
Set `--col`/`--row` per instance, e.g. in Vue: `:style="{ '--col': item.iconCol, '--row': item.iconRow }"`.

**Cursor** — if a cursor/selector graphic exists, move it (or swap its frame) to the focused
option on selection change, rather than relying on a background-color hover state alone.

**Fonts** — register the provided font and apply it to all GUI text; hand-drawn art next to
browser-default text reads as unfinished no matter how good the art is:
```css
@font-face { font-family: 'GameFont'; src: url('/assets/fonts/pixel-serif.ttf'); }
.window-panel { font-family: 'GameFont', monospace; }
```
For canvas-rendered (`.ce`) text, check whether the project already uses PixiJS `BitmapText`/a
bitmap font asset (crisper, more control) versus a loaded web font drawn with regular canvas
text, and match whichever pattern is already established rather than introducing a second one.

Don't skip `image-rendering: pixelated` (or the CanvasEngine/Pixi-level equivalent —
nearest-neighbor texture sampling instead of the default linear/bilinear filtering) on anything
pixel-art. Without it, browsers and Pixi both smooth-scale images by default, so even a correctly
wired-in asset ends up looking soft and slightly blurry instead of crisp.

## Motion & feedback ("juice")

- Menus/dialogue: ~100–200ms slide or scale-in on open, matching motion out on close.
- Damage/heal numbers: spawn, float up ~20–30px, fade out over ~600–800ms.
- HP/MP bars: an optional delayed "afterimage" segment that catches up a beat after the main bar
  drops makes a hit read as an event instead of a silent snap.
- Item/gold gained: a brief pop-in and settle on the icon/number, not just an entry appearing in
  a log.

These are cheap (CSS transitions/keyframes in Vue, tweens in `.ce`) — the point isn't elaborate
effects, it's that *something* visibly moves in response to *something happening*.

## Putting it together: before vs after

Same data, same component, built two ways — the difference is entirely about which files got
opened:
```html
<!-- Generic: technically correct, reads as a placeholder -->
<div class="slot" style="border: 2px solid #888; border-radius: 4px; background: #333;">
  <span>{{ item.name }}</span>
</div>
```
```html
<!-- Asset-driven: same props, built from what's actually in the assets folder -->
<div class="slot window-panel" @click="use(item)">
  <div class="icon" :style="{ '--col': item.iconCol, '--row': item.iconRow }" />
  <span class="game-font">{{ item.name }}</span>
</div>
```
```css
.slot { display: flex; align-items: center; gap: 6px; padding: 6px; }
.game-font { font-family: 'GameFont', monospace; }
/* .window-panel and .icon as defined above */
```

## Matching a specific reference RPG

If the user names a game they want to match ("make it look like X"), don't guess from memory
what that game's UI looks like — search for and look at real screenshots of its actual
menus/HUD/dialogue, and pull concrete specifics from what you see: border/corner treatment, font
weight, color palette, icon size and grid density, where portraits sit relative to text. Read
"identical to X" as *matching that quality bar and those conventions*, not as license to reuse
that game's actual art files — those are another studio's IP. Recreate the *style* with the
user's own assets (or newly made art in that style), don't import another commercial game's
textures.

## RPGJS quick-reference

- GUI-heavy screens (inventory, shop, menus) → Vue overlay, per the main RPGJS GUI skill; every
  CSS technique above applies directly with no extra plumbing.
- Tightly world-embedded GUI (floating tooltip, nameplate) → `.ce`; same concepts, via PixiJS —
  check exact API shape in the docs rather than assuming.
- Register icon/window-skin/font files the same way spritesheets get registered in
  `config.client.ts` — an asset nothing references doesn't render, no matter how good it is.
- Replacing a *prebuilt* GUI (dialog/shop/menu) with an asset-driven version → check
  `prebuilt-contracts.md` first so it still honors the expected data/close-value contract.

## Common pitfalls

- **Restyling with CSS colors/gradients instead of opening the assets folder** — the single
  biggest cause of "I have the assets but the GUI still looks plain." Run the audit table first.
- **Guessing a window-skin's border inset or an icon sheet's grid from a filename/typical size**
  instead of the real file's pixel dimensions — the same failure mode as spritesheet frame
  counts, applied to GUI art.
- **Flat rounded-rectangle-plus-shadow panels** sitting next to an unused 9-slice window skin —
  the most common single "looks generic/AI-made" tell in this domain.
- **Pixel art rendered without nearest-neighbor sampling** — even correctly-wired assets look
  soft/blurry without it, which still reads as "not quite right."
- **A provided font file left unregistered** while GUI text renders in the browser default next
  to hand-drawn art.
- **Instant show/hide with zero transition** on menus, dialogue, or damage numbers — technically
  correct, reads as unfinished.
- **Claiming "there's no asset for that" without actually listing the folder** — confirm absence,
  don't assume it from what the current task happened to mention.
- **Treating "identical to [game]" as license to reuse that game's actual art/textures** — match
  conventions and quality bar with the project's own assets, don't import another studio's files.
