# Zone, Map, and Monster Content Matrix

All combat zones remain side-view arenas. The castle/village reference image is
used for composition—clear districts, vertical landmarks, roads, water, farms,
and a destination silhouette—not for an isometric camera or 3D conversion.

| Zone | Visual story and landmark | Traversal/platform rhythm | Hazard/encounter identity | Preferred enemy silhouettes |
| --- | --- | --- | --- | --- |
| Town | Mountain valley settlement, keep in distance, forge, well, market, farms, gateway | Mostly grounded street with short porch/bridge elevations | Safe hub; readable NPC districts and portal destination | NPCs only |
| Goblin Catacombs | Ancient overgrown tunnel mouth and stolen supply camp | Low ruins, two drop-through ledges, open boss clearing | Falling debris telegraphs and shaman totems | Slime, goblin melee/ranged, heavy orc |
| Crypt of the Damned | Moonlit cemetery/crypt arches and chained sarcophagi | Narrow tomb shelves framing a central lane | Bone spikes, curse pools, ranged skeleton crossfire | Skeleton warrior/archer, floating wraith, armored lich |
| Inferno Dragon Lair | Volcanic keep silhouette, lava vents and dragon bones | Sparse safe stone islands; wide boss floor | Timed lava vents and falling embers | Hound, imp, golem, drake, large dragon |
| Void Nexus | Broken celestial observatory and central rift | Symmetric floating ruins with safe center lane | Rift zones, teleporting elites, arena edge pressure | Phantom, astral knight, sorcerer, void overlord |
| Venomous Swamp | Twisted deadwood, huts, hanging moss and drowned shrine | Sinking-looking low platforms without ambiguous ground | Poison pools, webs, obscuring mist | Spider, ghost, bog brute, broodmother |
| Twilight Peaks | Blood moon, distant ridges, ruined watchtower | Ascending ledges then broad summit arena | Gust pushes and marked falling boulders | Wolf, harpy, stone golem, behemoth |
| Sunken Abyss | Submerged temple columns, coral gate and leviathan bones | Gentle stepped temple slabs; readable sand floor | Current pushes, bubble vents, delayed tidal lines | Crab, siren, armored titan, leviathan |
| Gallet Depths | Forge cavern, waterfalls/lava channels and giant furnace | Industrial stone bridges and two forge platforms | Steam/lava jets and forge hammer telegraphs | Bat, molten sentry, forge construct |
| Sunlit Vale | Bright cliffs, bandit camp, windmill/farm edge | Open running lane with fences and one overlook | Archer volleys and destructible supply totems | Raider, archer, warband chief |
| Emerald Ridge | Green ridge road, waterfall ravine and druid stones | Alternating low rocks and broad beast arena | Pack flanks and shaman healing stones | Prowler/wolf, shaman, alpha beast |
| Castle Approach | Long road, siege wreckage, walls and closed gate | Defensive barricades leading to flat gate arena | Ballista lanes and shield formations | Sentinel, siege adept, castellan |
| Endless Arena | Celestial rings, shifting constellations and central dais | Stable competitive floor; layout changes between rounds | Rotating modifiers announced before each wave | Curated cross-zone roster with readable elites |

## Composition rules

- The first camera view shows the zone goal or a strong landmark, not a repeated
  wallpaper seam.
- Every arena has foreground, gameplay, near-background, middle, far, and sky
  separation, but foreground art may never conceal the player's feet or hazards.
- Platform tops share the ground material and have a high-contrast lip. Nothing
  should look like an unsupported bar.
- Decorative placement uses a deterministic zone seed and authored slots; no
  per-frame randomness.
- Props within attack space are short or transparent enough to preserve enemy
  silhouettes. Tall props remain behind the gameplay plane.
- Boss arenas reserve clear telegraph space and keep the boss visible at both
  edges of the camera.
- Enemy families use real animation sheets when licensed; color tint is an
  elite modifier, not a substitute for a missing species sprite.

## Minimum content gate per battle zone

- Three or more parallax depths plus a registered ground/floor.
- One named landmark, six or more authored decoration slots, and two foreground
  accents with camera culling.
- Two traversal platforms or an explicit `flatArena` rationale.
- One environmental hazard with a visual telegraph and damage cooldown.
- Three normal encounter silhouettes plus a distinct boss silhouette.
- One deterministic spawn layout per wave, plus safe player/party spawn points.
- Zone-specific color grading, ambient particles, and a size-bounded preload group.
