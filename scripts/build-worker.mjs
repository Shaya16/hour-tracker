/**
 * Bundles worker/index.ts into dist/_worker.js.
 *
 * Runs after `vite build`, because Vite empties dist/ on every run and would otherwise
 * delete the worker we just wrote.
 */

import { build } from 'esbuild'
import { statSync } from 'node:fs'

const OUT = 'dist/_worker.js'

await build({
  entryPoints: ['worker/index.ts'],
  outfile: OUT,
  bundle: true,
  format: 'esm',
  // workerd tracks recent V8, so there is nothing to gain from downlevelling.
  target: 'es2022',
  platform: 'neutral',
  minify: true,
  sourcemap: false,
  // Keep the banner out of the way of the module's default export.
  legalComments: 'none',
})

const kb = (statSync(OUT).size / 1024).toFixed(1)
console.log(`\nworker bundled  ${OUT}  ${kb} kB`)
