---
name: rpgjs-coop-sync
description: Diagnose and fix RPGJS (@rpgjs/server, @rpgjs/client) co-op multiplayer desync — when one player's client shows a different game state than another's inside a shared session, like skill effects/animations only some players see, enemies or monsters invisible to one player but hittable by another, a wave/enemy-spawn system whose count or progress disagrees between players, a dungeon that only some party members can complete or that returns some players to town while others stay stuck inside, or host vs. joining/invited player behaving inconsistently — anything that "works fine until we're actually inside the dungeon/instance." Also covers building instanced dungeons and multiplayer parties/groups correctly in the first place (map-id-as-room instancing, RpgWorld, syncSchema, canChangeMap), since the debugging playbook leans on that architecture. Use whenever the user mentions RPGJS, RPG-JS, "rpgjs", @rpgjs packages, co-op, multiplayer, dungeon instance, party or group system, wave system, or players out of sync / seeing different things / hindi nagkakasabay / hindi sync sa isa't isa. This is a companion to a broader RPGJS skill covering GUI, shops, loot, and skill VFX — reach for that one for non-multiplayer-sync RPGJS work; use this one specifically for co-op state divergence.
---

# RPGJS: Co-op Multiplayer Sync — Instancing, Parties & Desync Debugging

Scoped to one thing: getting RPGJS (@rpgjs/server, @rpgjs/client) co-op multiplayer right —
instanced dungeons, party/group formation, and, the main event, diagnosing when players'
clients silently drift out of sync with each other inside a shared session. This assumes v5
(current) unless the project's `package.json` says otherwise. For anything outside multiplayer
sync (GUI, shops, loot, skill VFX wiring), use the broader RPGJS skill instead — this file
intentionally leaves that out.

**Check for the official RPGJS skill first.** If the project doesn't already have it,
`npx skills add https://github.com/RSamaium/RPG-JS#v5` is worth installing alongside this file —
the official skill (and the live docs index at `https://v5.rpgjs.dev/llms.txt`) win on any
specific API detail, since RPGJS is under active development and this file can go stale.

RPGJS always separates **server** (authoritative state — HP, position, event logic, all living
on `RpgPlayer`) from **client** (rendering, input capture). Never trust client-submitted state
for anything that matters here (wave progress, enemy HP, completion) — compute and hold it
server-side, same as damage/loot/currency would be.

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
   "leave" interactions back to the server (`player.gui('party').open(...)` /
   `.on('accept', ...)` — see the companion RPGJS skill's GUI section for the full pattern).
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

## Debugging: co-op desync — host and joining player see different game states

"It's fine in town/lobby, but the moment we're actually inside the dungeon, my partner's skills,
enemies, and wave count don't match mine, and finishing the dungeon only sends one of us back to
town." This exact cluster — fine outside an instance, then the host and the joining player quietly
diverge once inside one — is narrow enough to have a short, checkable list of causes. It is essentially
never "RPGJS's networking is flaky," because of the room model already described above: **RPGJS syncs
by map id — schemas sync within the context of a "room," and a room is a map.** If the host and the
joining player ever resolve to two different map id strings for what was supposed to be the same
instance, both still keep a live connection to the server and keep receiving *some* things (their own
input, their own state) — which is exactly why this looks like "half-working" networking instead of a
clean disconnect. Instead of one shared room, each player is quietly alone in their own copy.

Work through these in order on the *server*-side dungeon/wave code — the first one that reproduces the
symptom is almost always the whole bug:

**1. Instance map id mismatch.** Log the resolved instance id at the moment *each* party member's
`changeMap()` into the dungeon returns, for the same run, and diff the two logged strings. The most
common way they drift apart:
```ts
// BUGGY — every call mints its own suffix, so host and joiner land on two different ids
async function enterDungeon(player: RpgPlayer) {
  const instanceId = `goblin-cave-${player.id}-${Date.now()}`
  await player.changeMap(instanceId)
}
// host's call -> goblin-cave-host123-...001
// joiner's call moments later -> goblin-cave-mobile456-...118
// two rooms, not one — from here neither ever sees the other again
```
```ts
// FIXED — one id, computed once from something the whole party shares (groupId), reused
// for every member instead of derived per-player or per-call
async function enterDungeon(groupPlayers: RpgPlayer[], groupId: string) {
  const instanceId = `goblin-cave-${groupId}`
  for (const player of groupPlayers) await player.changeMap(instanceId)
}
```
If the lobby/invite system is custom-built (RPGJS ships no built-in one — see Multiplayer: parties
above), also check that whatever the joining player's client sends back actually carries the *same*
`groupId` the host's lobby code generated, rather than the joining client minting its own.

**2. Wave/spawn/completion logic scoped to one player instead of the whole instance.** A matching map
id can still produce this exact symptom if the code that spawns a wave, checks "is it cleared," or
ends the dungeon runs against a single `player` argument — usually whichever player's input got wired
up and tested first (typically the host):
```ts
// BUGGY — only tells the caller about the new wave, only sends the caller to town
function onWaveCleared(player: RpgPlayer, instanceMapId: string) {
  player.showAnimation('wave-complete')
  currentWave++
  if (currentWave > totalWaves) player.changeMap('town')
}
```
```ts
// FIXED — act on everyone actually registered in this instance
function onWaveCleared(instanceMapId: string) {
  const party = RpgWorld.getPlayersOfMap(instanceMapId)
  for (const p of party) p.showAnimation('wave-complete')
  currentWave++
  if (currentWave > totalWaves) for (const p of party) p.changeMap('town')
}
```
Keep `currentWave`, the live enemy list, and clear/complete state on the map instance's `syncSchema`
(or a server-side struct keyed by `groupId`) — never on one player's own state. State hung off a
single player only ever gets read or pushed to that one player, by construction.

**3. Enemies spawned or wave state set before the joining client has actually synced to the new
map.** RPGJS's own docs call this out directly: code that runs immediately after `await
player.changeMap(...)` resolves is not guaranteed to be synchronized to the client yet — the promise
resolving means the server finished the map transition, not that the client has received and applied
it. The fix is to gate anything the client must see on the `onJoinMap(player, map)` hook instead:
```ts
// BUGGY — spawns the wave in the same tick changeMap() resolves; races the client's own sync
async function enterDungeon(player: RpgPlayer, instanceId: string) {
  await player.changeMap(instanceId)
  spawnWave(instanceId, 1)   // may fire before this player's client has actually joined the room
}
```
```ts
// FIXED — (re-)announce current state once RPGJS confirms this player has joined
export const player: RpgPlayerHooks = {
  onJoinMap(p: RpgPlayer, map: RpgMap) {
    ensureWaveSpawnedFor(map.id)   // idempotent: spawns once for the instance, no-ops after
  }
}
```
This explains the specific *direction* of the bug well: on the same machine as the server, the round
trip is fast enough that the race is rarely lost; over an actual network hop (the joining device) it's
lost far more often — which is why it's consistently the joining/mobile side that ends up missing the
initial enemies and stuck on the starting wave count, rather than a random 50/50 split.

**4. Skill-effect calls that special-case "the host."** If 1–3 all check out (matching instance id,
party-scoped wave logic, spawn gated on `onJoinMap`) and it's specifically skill VFX that's still
asymmetric by direction, don't go chasing the animation/SFX wiring itself — a *wrong* animation
playing is a different bug (see the companion RPGJS skill's "Skill abilities" section for that one).
Instead grep the skill's `onUse`/effect code for anything that branches on who's the host:
```ts
// The asymmetry itself, not a fix for it — RPGJS has no privileged "host player" concept for
// gameplay; the server is equally authoritative for every connected player
onUse(player, target) {
  if (player.isHost) {
    player.showAnimation('slash')       // only reaches whichever clients are watching player
  } else {
    broadcastToParty('slash', player)   // a second, different path only invited players go through
  }
}
```
A branch like this is almost always something an earlier debugging pass hand-added — remove it and
call the same effect trigger unconditionally regardless of which connected player used the skill.

## Common pitfalls

- **Routing every party into the same shared dungeon map id** — that puts every group in one
  room instead of instancing; give each group's dungeon run its own map id (see Dungeons above).
- **Host and joining player quietly end up in different rooms once inside an instance** — the
  classic co-op symptom is "my skills/enemies/wave state show for me but not my partner, and only
  I get sent back to town on completion." Never patch this per-symptom (one fix for skill VFX,
  another for enemies, another for the wave counter) — it's almost always one of a mismatched
  instance map id, single-player-scoped wave/completion logic, or state set before the joining
  client's `onJoinMap` fires. See "Debugging: co-op desync" above for the ordered checklist.
