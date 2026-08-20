// Rolldown bundles this fixture so Node tests execute the real TypeScript run
// implementation and the same gameplay sprite manifest used by the browser.
export * from '../src/sideview/dungeons/run';
export {
  GAMEPLAY_SPRITES,
  isGameplaySpriteId,
  validateGameplaySpriteManifest,
} from '../src/sideview/assets/GameplaySpriteManifest';
