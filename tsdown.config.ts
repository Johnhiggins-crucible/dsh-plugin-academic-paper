import { defineConfig } from 'tsdown'

/**
 * Host half only: bundle the Node plugin entry into ESM. The browser half
 * (`src/client.js`) is plain dependency-free JavaScript served verbatim by the
 * host client-modules system, so it needs no build step.
 */
export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2022',
    fixedExtension: false,
    dts: false,
    clean: true,
  },
])
