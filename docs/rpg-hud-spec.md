# RPG HUD and Interface Specification

The interface uses one dark fantasy frame language across HUD, cards, menus,
tooltips, and dialogs. Pixel assets decorate and clarify the interface; they do
not replace semantic HTML, readable text, or responsive layout.

## In-combat visual hierarchy

1. **Immediate survival:** player HP/resource, enemy telegraph, boss health/cast.
2. **Action choice:** six skills, cooldown, mana cost, input prompt, potion.
3. **Team state:** ally health, downed/revive, connection quality.
4. **Short feedback:** damage/heal/status, combo, loot, objective update.
5. **Persistent context:** zone/wave, tracked quest, gold/EXP.
6. **Menu actions:** collapsed behind one menu button during play.

The HUD steps back during calm moments but never becomes illegible or looks
disabled. Danger state changes contrast and emphasis rather than moving controls.

## Desktop layout

```text
+ player plate                                  zone / wave        menu +
| party rail                                                        |
|                                                                   |
|                         world canvas                              |
|                       boss / target frame                         |
|                                                                   |
| quest tracker                  feedback                 skill bar |
+-------------------------------------------------------------------+
```

- Player plate anchors top-left with portrait, class/level, HP, resource, EXP,
  status chips, and a compact footer for gold/power/player ID.
- Party rail stacks below; it never overlaps the zone banner or quest tracker.
- Boss frame is top-center and appears only for a boss; normal target frame is
  smaller and nearer the reticle/combat center.
- Skills form a stable horizontal/radial action cluster at bottom-right with a
  large basic attack, five secondary skills, and a separated potion.

## Touch landscape layout

- Left third: joystick and interaction context.
- Right third: basic attack centered under a five-skill arc; jump/dash/talk in a
  separate utility column.
- Top corners retain status and menu; party and boss frames compress to one line.
- Safe-area insets are applied on notched devices; buttons are at least 48 CSS px.
- Touch and desktop controls do not coexist unless Hybrid Controls is selected.

## Portrait fallback

Portrait is supported for menus and emergency play, not treated as the primary
combat layout. The camera letterboxes safely; player/boss status becomes compact;
skills form two rows above the bottom safe area; quest and non-critical feedback
collapse. A rotate hint is advisory and never blocks play.

## Component states

### Player and party frames

- HP and resource bars show exact values on hover/focus and percentage at rest.
- Low HP uses pulse plus icon—not red alone. Downed shows timer and revive progress.
- Buffs/debuffs are icon chips with remaining duration and accessible tooltip.
- Party cards expose class role, level, HP, downed state, distance, and connection.

### Skill slots

- Ready, casting, cooldown, insufficient resource, locked, disabled/downed, and
  ultimate-ready are visually distinct.
- Cooldown uses both radial sweep and numeric seconds.
- The actual active binding is shown using licensed pixel input prompts where
  available; text remains as the accessible fallback.
- Tooltip/card fields: name, rank, class tag, damage type, cost, cooldown, range,
  concise mechanic, scaling, status duration, and next-rank delta.
- Ultimate slots have a distinct frame but do not flash continuously.

### Boss and target frames

- Boss name, phase pips, HP, break/stagger state, cast name, cast timer, and status
  resistances share one centered frame.
- A telegraph never relies only on the boss frame; the world also shows shape,
  origin, destination, and impact timing.

### Cards, dialogs, and menus

- One reusable frame system defines panel, inset, title divider, tabs, button,
  tooltip, rarity edge, focus ring, and modal backdrop.
- Inventory uses responsive grid + inspector; no information is hidden behind
  hover on touch.
- Equipment has clear slots and before/after stat comparison.
- Skill book groups six skills by class, shows available points, and previews
  mechanics/VFX identity without playing heavyweight ultimate sheets at boot.
- Quest cards separate objective, location, progress, reward, and state.
- Settings groups controls, audio, video/performance, accessibility, and network.

## Typography and copy

- Display face is reserved for zone, boss, and panel titles.
- Body text uses a highly readable system or bundled pixel-compatible sans face.
- Minimum default body size is 15 CSS px; compact labels are at least 12 px.
- All text is valid UTF-8; mojibake glyphs and emoji placeholders are forbidden.
- Combat copy is short and actionable: `Not enough mana`, `Skill ready`,
  `Ally down`, `Hold to revive`, `Connection recovering`.

## Accessibility and preferences

- Full keyboard traversal and visible focus; Enter/Space activate buttons once.
- Remappable actions with conflict warnings and reset per device type.
- Reduced motion limits camera shake, hit stop, flashes, parallax drift, and large
  screen transitions while preserving hit timing.
- Flash intensity, screen shake, damage numbers, UI scale, text scale, contrast,
  color assistance, and vibration are independent settings.
- `aria-live` is polite for loot/objectives and assertive only for downed,
  disconnect, and destructive confirmation states.

## Performance rules

- HUD nodes are created once and patched only when their backing state changes.
- Bar transforms and opacity are preferred over layout-triggering width churn.
- Tooltip images and skill previews load on focus/hover, not at boot.
- Hidden screens stop timers and animation loops.
- UI texture atlases are core; class skill icons are selected-class preload;
  reward/rarity illustrations are on demand.

## Browser QA matrix

- Desktop: 1920×1080, 1366×768, 1280×800, keyboard/mouse and gamepad.
- Landscape touch: 1180×820, 1024×768, 812×375, 667×375, 568×320.
- Portrait: 430×932 and 360×800.
- Browser zoom: 80%, 100%, 125%, 200%; UI scale: 80%–150%.
- Keyboard-only, screen-reader landmark pass, coarse pointer, reduced motion,
  high contrast, offline/reconnect, and two-client party states.
