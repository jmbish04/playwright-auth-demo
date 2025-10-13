import { WebSocketHandler } from './websocket-handler';
import type { Env } from './types';

export class WebSocketHandlerDO {
  state: DurableObjectState;
  env: Env;
  webSocketHandler?: WebSocketHandler;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    // Create a new WebSocket pair
    const { 0: client, 1: server } = new WebSocketPair();

    // The server-side WebSocket is now the one we work with
    await this.handleSession(server);

    // The client-side WebSocket is returned to the client
    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async handleSession(ws: WebSocket) {
    // This is where the WebSocket connection is established.
    // We can now pass it to our existing handler logic.
    ws.accept();
    this.webSocketHandler = new WebSocketHandler(ws, this.env);
  }
}
