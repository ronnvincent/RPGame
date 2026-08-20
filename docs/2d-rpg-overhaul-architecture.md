# 2D RPG Overhaul Architecture

This document is the implementation contract for the browser-only side-scroller.
It keeps the current TypeScript/canvas client and Socket.IO/PostgreSQL server,
while separating combat rules, presentation, maps, input, and networking so new
content is data-driven instead of being added as more one-off branches.

## Product pillars

1. **Readable action combat** — clear anticipation, active frames, impact,
   recovery, hit feedback, and class-specific mechanics.
2. **RPG identity** — every class, enemy family, map, card, and HUD element has
   a recognizable role and visual language.
3. **Fair co-op** — the server owns rooms and authoritative combat transitions;
   clients predict presentation without being trusted for rewards or health.
4. **Browser performance** — core boot assets stay small; zone, character, and
   ultimate assets load only when needed.
5. **Licensed content** — every newly imported runtime asset maps to a recorded
   source and license.

## Client module boundaries

```text
Input sources (keyboard / pointer / touch / gamepad)
  -> InputRouter (context + remappable actions)
  -> CombatController (cast validation + command creation)
  -> SkillResolver (data-driven delivery, status, movement, summons)
  -> World simulation (players, enemies, zones, projectiles)
  -> Presentation events (animation, VFX, SFX, camera, HUD)
  -> Network protocol (intent up, authoritative snapshot/event down)
```

- `classes/`: class stats, skill definitions, behavior descriptors, progression.
- `combat/`: pure damage/status/cooldown calculations and skill resolution.
- `input/`: normalized actions, input contexts, bindings, accessibility options.
- `engine/`: simulation loop and world entities; no UI DOM ownership.
- `maps/`: zone definitions, platforms, hazards, decoration, encounter anchors.
- `assets/`: approved asset packs, runtime paths, preload tiers, credits.
- `ui/`: HUD components, menus, cards, responsive layout, accessibility.
- `network/`: versioned messages, interpolation, reconnect, room state.

## Skill definition contract

Every one of the 60 skills must declare these facets:

| Facet | Required data |
| --- | --- |
| Identity | class, slot, name, role, icon, tags |
| Cost | mana, cooldown, cast time, recovery time |
| Delivery | melee, projectile, self-AoE, target-AoE, chain, zone, summon, movement |
| Payload | damage coefficients, hits, crit rule, heal/shield, status effects |
| Targeting | range, radius, target cap, ally/enemy/self rules |
| Motion | dash, leap, teleport, pull, knockback, invulnerability window |
| Presentation | animation cue, cast/projectile/impact/ultimate VFX, palette, SFX, camera cue |
| Networking | prediction policy and authoritative result event |

Descriptions are generated or validated against the behavior data. A test must
fail when text promises an effect such as slow, lifesteal, taunt, shield, or
frailty that the payload does not implement.

## Map and encounter contract

Each zone owns:

- parallax layers with scroll factors and optional drift;
- a registered ground line and tile/floor material;
- collision platforms and drop-through rules;
- decoration instances split into back, gameplay, and foreground layers;
- landmarks, spawn anchors, checkpoints, exits, hazards, and camera bounds;
- allowed enemy families, elite modifiers, boss arena, music, and preload group;
- deterministic seed so host and guests agree on decoration and encounters.

The renderer culls instances outside the camera margin. Decoration never owns
collision unless the map data explicitly links it to a platform or hazard.

## UI component inventory

- Player status plate: portrait, class/level, HP, MP/resource, EXP, status chips.
- Six-slot action bar: input prompts, cooldown sweep, cost, rank, unavailable state.
- Party rail: role, HP, downed/revive progress, latency/connection state.
- Target frame and boss frame: health, phases, cast telegraph, status/resistance.
- Quest tracker, loot feed, minimap/zone banner, combo and damage feedback.
- Inventory/equipment, character sheet, skill book, quest log, world map, settings.
- Dialogue, confirmation, reward, failure, reconnect, and migration modals.

DOM overlays use semantic buttons, keyboard focus, visible focus rings, ARIA
labels, reduced-motion mode, scalable text, color-independent cooldown/status
indicators, and safe-area insets. Desktop and touch controls are never shown at
the same time unless the user explicitly selects a hybrid layout.

## Multiplayer and persistence schemas

Target PostgreSQL tables (existing installations migrate incrementally):

- `users(id uuid pk, username citext unique, password_hash text, short_id text
  unique, created_at, updated_at)`
- `player_saves(user_id uuid pk fk users, revision bigint, save_data jsonb,
  power int, class_id text, level int, updated_at)`
- `friendships(requester_id, addressee_id, status, created_at, updated_at,
  primary key(requester_id, addressee_id))`
- `sessions(id uuid pk, user_id uuid fk users, token_hash text, expires_at,
  revoked_at, user_agent_hash text, created_at)`
- `match_runs(id uuid pk, room_code text, dungeon_id text, seed bigint, status,
  started_at, ended_at)`
- `match_members(run_id uuid fk match_runs, actor_id uuid, user_id uuid fk users,
  class_id text, joined_at, left_at, stats jsonb, primary key(run_id, actor_id))`

Save writes use an optimistic `revision`; stale clients receive `409 Conflict`
instead of overwriting newer progress.

## HTTP and Socket.IO contracts

HTTP:

- `POST /api/auth/guest` -> one-time credentials and session token.
- `POST /api/auth/login` -> session token and public profile.
- `POST /api/auth/refresh` / `POST /api/auth/logout`.
- `GET /api/save` and `PUT /api/save` with bearer token and revision.
- `GET /api/leaderboard?sort=power|level&limit=` returns public fields only.
- `GET /api/assets/credits` may be generated from the asset manifest at build time.

Socket client intents:

- `room:create`, `room:join`, `room:leave`, `room:ready`;
- `input:frame`, `skill:cast`, `interact`, `revive:start|cancel`;
- `chat:quick`, `ping:create`, and same-room voice signaling.

Server events:

- `room:snapshot`, `world:snapshot`, `world:event`, `combat:result`;
- `player:joined|left|reconnected`, `host:changed`, `run:transition`;
- `protocol:error` with stable error code and recoverability flag.

Every message carries `protocolVersion`, `roomId`, `actorId`, and monotonic
sequence/tick where applicable. Server handlers enforce authentication, room
membership, bounds, cooldown/rate limits, and host authority before mutation.

## Performance budgets

- Initial core image transfer: target <= 4 MB; decoded core texture memory <= 64 MB.
- Per-zone transfer: target <= 8 MB; only current and next zone retained.
- VFX: load the selected class kit plus shared hit effects; ultimates on demand.
- Simulation: fixed step with capped catch-up; rendering interpolates.
- Entity and particle pools have explicit caps and camera culling.
- HUD writes are event-driven or throttled; no whole-HUD rebuild per frame.
- Public runtime folders reject archives, source art, demo projects, and caches.

## Delivery gates

1. Baseline tests and a clean inventory of user-owned changes.
2. P0 combat, controls, auth, rooms, reconnect, and authority repaired.
3. Skill behavior and presentation validated for all 60 skills.
4. Licensed asset manifest and lazy loading active.
5. Maps, monsters, hazards, and encounter composition expanded.
6. RPG HUD and menus responsive on desktop, landscape phone, and portrait phone.
7. Unit, integration, build, browser, two-client co-op, reconnect, security, and
   soak checks pass with results recorded separately.
