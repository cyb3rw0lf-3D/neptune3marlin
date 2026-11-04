import { cleanup, handleFetch } from './api';

/** The Worker entry: only handlers may be exported from this module. */
export default {
  fetch: (request, env, ctx) => handleFetch(request, env, ctx),
  async scheduled(_controller, env): Promise<void> {
    await cleanup(env, Date.now());
  },
} satisfies ExportedHandler<Env>;
