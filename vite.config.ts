import { defineConfig } from 'vite';
import { prunePublicArtifacts } from './tools/vite/prunePublicArtifacts.ts';

export default defineConfig({
  plugins: [prunePublicArtifacts()],
  server: {
    port: 3000
  },
  build: {
    target: 'esnext'
  }
});
