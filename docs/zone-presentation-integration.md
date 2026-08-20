# Original painterly side-view presentation layer

This layer borrows broad presentation goals from polished exploration-focused
2D action RPGs: readable silhouettes, layered depth, biome-specific ambient
motion, restrained light shafts, and foreground framing. It does not use or
recreate Afterimage art, characters, logos, UI, map layouts, or trade dress.
All rendered atmosphere is made from Canvas primitives over the project's
existing locally licensed map art.

## Integration contract

`drawZonePresentation` is intentionally independent of `SpriteManager` and
does not allocate an `Image` or touch the asset cache. Integrate its two stages
inside `SideViewEngine.render` while the context is scaled to virtual pixels:

```ts
import { drawZonePresentation } from '../maps/ZonePresentation';

const presentationOptions = {
  elapsedSeconds: this.zoneHazardClock,
  reducedMotion: this.getVisualPreferences().reducedMotion,
  quality: 'balanced' as const,
};

// Screen-space: after the base environment, before the world translation.
drawZonePresentation(
  ctx, currentTheme, 'behind-entities', camX,
  virtualWidth, virtualHeight, this.groundY, presentationOptions,
);

// Screen-space: after restoring the world translation, before final scale restore.
drawZonePresentation(
  ctx, currentTheme, 'above-entities', camX,
  virtualWidth, virtualHeight, this.groundY, presentationOptions,
);
```

The background pass must stay outside the `translate(-camX, -camY)` block. The
foreground pass should run after entities/VFX and after that translation is
restored. This preserves stable screen-space vignette edges.

## Performance and readability guarantees

- Default `balanced` quality draws at most 20 conceptual background primitives
  and five foreground framing primitives. `high` remains capped at 27 + 5.
- Motes are batched into one path; there is no per-mote save/restore, gradient,
  shadow blur, filter, texture lookup, or image decode.
- Coordinates are generated from stable biome seeds. No `Math.random()` means
  no frame-to-frame flicker and no ambient state allocation.
- `reducedMotion` freezes autonomous drift while leaving the static atmosphere.
- Background effects stop at least 52 virtual pixels above the ground line.
  Foreground framing keeps the central 72% clear, stays at or below 18% alpha,
  and starts its floor vignette below the feet/hazard line.
- `low`, `balanced`, and `high` quality tiers adjust counts without changing
  gameplay, collision, map geometry, or asset preloading.

The executable contract is covered by `test/zone-presentation.test.mjs`.
