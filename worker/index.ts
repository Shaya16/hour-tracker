/**
 * Cloudflare Pages "advanced mode" entry point, bundled to `dist/_worker.js`.
 *
 * In advanced mode this worker sees *every* request, so it is responsible for serving the
 * static site as well as the API. Anything that is not `/api/*` is handed straight to the
 * ASSETS binding, which does the real file serving, SPA fallback and cache headers.
 *
 * Why this instead of a `functions/` folder: a functions folder is only compiled by
 * Wrangler or the Git integration. A single `_worker.js` is additionally supported by
 * dashboard drag-and-drop — the only deploy route that needs neither a CLI nor a GitHub
 * account. Same code, one more way to ship it.
 */

import { handleApi, type Env } from './api'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const apiResponse = await handleApi(request, env)
    if (apiResponse) return apiResponse
    return env.ASSETS.fetch(request)
  },
}
