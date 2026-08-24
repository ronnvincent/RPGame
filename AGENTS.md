# RPGame - Agent Working Notes

Side-view pixel action RPG (TypeScript/Vite + Express/Socket.IO server). Darkrise-inspired systems live under `src/sideview/items/darkrise/`, `src/sideview/dungeons/Difficulty.ts`, `src/sideview/pets/PetSystem.ts`.

## Standing directive from owner
Keep building without waiting for confirmation. Work through the queue below top-down; one system per session, verify before pushing (tsc --noEmit, npm run build, relevant test:* scripts), then commit and push to origin main.

## Verification commands
- `npx tsc --noEmit`
- `npm run build`
- `npm run test:save && npm run test:encounters && npm run test:balance`
- Known pre-existing failure (not ours): `test:zone-runtime` fails on clean HEAD too.

## Task queue
1. **Sprites import**: write `download_sprites.py` following `download_aaa.py` pattern (OpenGameArt CC0/CC-BY only). Monster sheets, pet creatures, extra skill VFX, parallax tile sets. Extract into `/assets/runtime/` structure, register in `src/sideview/engine/SpriteManager.ts` + `MapLibrary.ts`, add entries to license manifest so `npm run test:runtime-assets` passes, update `CREDITS.md`.
2. **Pets phase 2**: summon combat entity (follow owner, attack/heal by role using `petStats()` assistPercent), boss-drop chance to award pets via `engine.grantPet()`, Pet UI modal (list/stats/feed/activate), wire `activePetId` bonuses into combat.
3. **Talent trees**: Darkrise-style passive grid per class (10 classes), integrate with `recomputeStats()` and skill points UI (`#sk-list` in GameHUD).
4. **Achievements + titles**: counters -> permanent stat rewards, persisted like wallet fields.
5. **Crafting/gathering**: resource nodes on maps, recipes extending TownServices stations.
6. **New zones/bosses** with sets + monster cards (follow DungeonManager + cards.ts patterns).
7. **NG+/prestige**, 8. town fishing minigame, 9. seasonal events.

## Conventions
- No comments unless explaining non-obvious logic (repo style has explanatory comments).
- All currencies/progression are optional fields on PlayerState for old-save compatibility.
- Tests regex-pin some engine/DungeonManager substrings (e.g. `isElite ? getRandomLoot('mid')`) - check `test/*.mjs` before refactoring those lines.
