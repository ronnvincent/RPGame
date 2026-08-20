# Afterimage-inspired 2D RPG direction

Afterimage is a quality benchmark for atmosphere, combat readability, and RPG
depth. It is not an asset source. The game keeps its own characters, maps,
ornaments, iconography, animation timing, and interface composition. Runtime
art must come from the local licensed manifest, existing verified packs, or
original Canvas effects.

## Play-screen target

- Keep the character at roughly 11–15% of viewport height and provide facing
  look-ahead so the next enemy or traversal choice is visible.
- Compose every zone around one recognizable landmark. The first screen should
  communicate a destination instead of exposing a repeating wallpaper seam.
- Use at least five readable depths: sky, far silhouette/landmark, middle
  environment, grounded gameplay-back props, gameplay, and a sparse foreground.
- Foreground framing may never hide feet, attack telegraphs, revive markers, or
  hazards. Near-camera pieces fade or move aside around combatants.
- Platforms inherit the biome material, with a bright top lip, supported
  underside, contact shadow, and biome wear such as moss, cracks, coral, or ash.

## Combat target

- Player intent is visible before spectacle: startup pose, attack direction,
  active hit shape, impact, then recovery.
- Light hits use short feedback; heavy and ultimate impacts receive progressively
  stronger hit-stop within the accessibility setting. Telegraph anticipation is
  stable and never shaken by unrelated effects.
- The 60-skill identity matrix is the contract. Every class has a distinct trail
  shape, impact silhouette, cadence, palette, sound family, status marker, and
  ultimate staging. A tint change by itself is not a distinct skill.
- Boss arenas reserve world-space for telegraphs and phase changes. Boss attacks
  must affect host and guest players under the same host-owned encounter rules.

## Interface target

- Calm exploration shows only survival, location, and immediately usable
  actions. Quest and loot detail return on change, focus, or menu open.
- Alert state promotes target/status information. Boss state promotes a wide
  named health, phase, stagger, and cast frame without obscuring the arena.
- Inventory, equipment, skills, map, quests, party, and settings share one dark
  fantasy shell with grid-plus-inspector layouts and visible input prompts.
- Desktop, gamepad, landscape touch, portrait fallback, keyboard-only, reduced
  motion, contrast, text scale, and safe-area layouts remain first-class.

## Browser performance contract

- Target 60 FPS on desktop and preserve a 30 FPS floor on low-mobile quality.
- Visual quality adapts to frame time; gameplay projectiles, telegraphs, hit
  shapes, status markers, and revive cues never disappear.
- Cosmetic particles, trails, shadows, distortion, foreground accents, and
  secondary flashes reduce first. Ultimate silhouettes and impact timing remain.
- Prewarm the selected class's small core VFX set during the town/menu transition,
  not every class at boot. Stream large ultimate sheets before a run or during a
  safe idle window, with a lightweight first-use fallback.
- Pool transient objects, cap concurrent decoded images and effects, cull
  off-screen work, suspend disposable visuals in hidden tabs, and avoid creating
  gradients, filter strings, arrays, or DOM nodes repeatedly in hot loops.

## Vertical-slice acceptance gate

Emerald Ridge is the reference slice before declaring the whole direction done:

1. Five or more distinct depths, druid landmark, wind/leaf atmosphere, natural
   platforms, readable ground, a hidden route, and a clear checkpoint.
2. Three normal silhouettes and Alpha Greymane with multiple telegraphed patterns
   and a phase transition.
3. Warrior and Mage attacks are identifiable with the HUD hidden and with color
   reduced, including movement, trail, impact, status, sound, and ultimate.
4. Calm, alert, and boss HUD states work with keyboard, gamepad, touch, and party.
5. Automated gameplay contracts pass, the browser frame-time trace stays inside
   the selected quality budget, and an isolated two-client run proves both host
   and guest can be targeted, damaged, downed, and revived.
