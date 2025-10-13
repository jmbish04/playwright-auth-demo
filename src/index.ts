import { WebSocketHandler } from './websocket-handler';
import type { Env } from './types';

export { WebSocketHandlerDO } from './websocket-handler-do';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Handle WebSocket connections
    if (url.pathname === '/ws') {
      const upgradeHeader = request.headers.get('Upgrade');
      if (!upgradeHeader || upgradeHeader !== 'websocket') {
        return new Response('Expected Upgrade: websocket', { status: 426 });
      }

      // Get a unique ID for the Durable Object
      const doId = env.WEBSOCKET_HANDLER_DO.newUniqueId();
      const durableObject = env.WEBSOCKET_HANDLER_DO.get(doId);

      // Forward the request to the Durable Object
      return durableObject.fetch(request);
    }

    // Serve static assets (e.g., openapi.json)
    try {
      // Check if env.ASSETS is defined and has a fetch method
      if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
        return await env.ASSETS.fetch(request);
      }
      // Fallback for local development if `wrangler pages dev` is not used
      const notFoundResponse = new Response('Static asset binding not found. Ensure you are running in a Pages environment or have a `site` configuration in wrangler.toml.', { status: 404 });
      // In a real scenario, you might want to return a more specific error or a generic 404
      if (url.pathname === '/openapi.json') {
         // Manually retrieve from R2 if needed as a fallback, assuming it's uploaded there.
         // This part is simplified; a real implementation might need more logic.
         return new Response('Not found', { status: 404 });
      }
      return notFoundResponse;

    } catch (e) {
      return new Response(e.message, { status: 500 });
    }
  },
};
