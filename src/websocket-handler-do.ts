/**
 * @file src/websocket-handler-do.ts
 * @description This file defines the Durable Object (`WebSocketHandlerDO`) responsible for managing WebSocket connections.
 * As a Durable Object, it provides a single point of coordination for all connected WebSocket clients,
 * maintaining a consistent state (the list of active sessions) and enabling broadcast functionality.
 * This is crucial for ensuring all clients receive the same real-time updates during a scraping job.
 * @see https://developers.cloudflare.com/workers/wrangler/workers-sites/
 */

// Env is globally available from worker-configuration.d.ts
import { WebSocketHandler } from './websocket-handler';

// Define the structure of a WebSocket message for clarity.
interface WSMessage {
  type: string;
  data?: any;
}

/**
 * @class WebSocketHandlerDO
 * @description A Cloudflare Durable Object that manages and broadcasts WebSocket messages.
 * It maintains an in-memory array of active WebSocket sessions. When a message needs to be
 * sent to all clients (broadcast), this object iterates through the sessions and sends the message.
 * It also handles the lifecycle of WebSocket connections, including setup, message handling, and cleanup on close/error.
 */
export class WebSocketHandlerDO {
  /** @description The state provided by the Durable Object runtime for hibernation API. */
  state: DurableObjectState;
  /** @description The Cloudflare environment bindings, passed from the worker. */
  env: Env;

  /**
   * @constructor
   * @param {DurableObjectState} state - The Durable Object's state container.
   * @param {Env} env - The worker's environment bindings.
   */
  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  /**
   * @method fetch
   * @description The entry point for all requests to the Durable Object. Handles both
   * WebSocket upgrades and internal broadcast requests.
   * @param {Request} request - The incoming HTTP request.
   * @returns {Promise<Response>} A response that establishes the WebSocket connection or handles broadcast.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    // Handle internal broadcast requests
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      try {
        const logEvent = await request.json();
        const frontendMessage = this.transformLogEventForFrontend(logEvent);
        this.broadcast(frontendMessage);
        return new Response('OK', { status: 200 });
      } catch (error) {
        console.error('Failed to handle broadcast request:', error);
        return new Response('Internal Server Error', { status: 500 });
      }
    }

    // Handle WebSocket upgrade requests
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    if (request.method !== 'GET') {
      return new Response('Expected GET method for WebSocket upgrade', { status: 400 });
    }

    // Create a WebSocket pair: one side for the client, one for the server (this DO).
    const { 0: client, 1: server } = new WebSocketPair();
    
    // Use hibernation API for better performance
    this.state.acceptWebSocket(server);
    
    // Send welcome message to new client
    server.send(JSON.stringify({
      type: 'welcome',
      message: 'Connected to AI Scraper Live Status',
      timestamp: new Date().toISOString(),
      connectionCount: this.state.getWebSockets().length
    }));

    // Return the client-side of the WebSocket to the user, completing the upgrade.
    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * @method transformLogEventForFrontend
   * @description Transforms internal log events into frontend-compatible message formats
   * @param {any} logEvent - The internal log event
   * @returns {any} Frontend-compatible message
   */
  transformLogEventForFrontend(logEvent: any): any {
    // Handle screenshot events
    if (logEvent.screenshot) {
      return {
        type: 'vision_update',
        data: {
          description: logEvent.message,
          imageUrl: `data:image/png;base64,${logEvent.screenshot}`,
          timestamp: logEvent.timestamp,
          category: logEvent.category
        }
      };
    }

    // Handle AI thoughts
    if (logEvent.category === 'ai' && logEvent.data?.reasoning) {
      return {
        type: 'ai_thought',
        data: {
          message: logEvent.message,
          reasoning: logEvent.data.reasoning,
          timestamp: logEvent.timestamp,
          additionalData: logEvent.data
        }
      };
    }

    // Handle performance metrics
    if (logEvent.category === 'performance' && logEvent.duration) {
      return {
        type: 'performance_update',
        data: {
          operation: logEvent.message,
          duration: logEvent.duration,
          timestamp: logEvent.timestamp,
          additionalData: logEvent.data
        }
      };
    }

    // Handle errors
    if (logEvent.level === 'error') {
      return {
        type: 'error',
        error: logEvent.message,
        timestamp: logEvent.timestamp,
        category: logEvent.category,
        data: logEvent.data
      };
    }

    // Handle general status updates
    return {
      type: 'status_update',
      data: {
        level: logEvent.level,
        category: logEvent.category,
        message: logEvent.message,
        timestamp: logEvent.timestamp,
        additionalData: logEvent.data
      }
    };
  }

  /**
   * @method broadcast
   * @description Sends a message to all currently connected WebSocket clients using hibernation API.
   * @param {any} message - The message object to be broadcast.
   */
  broadcast(message: any) {
    const serializedMessage = JSON.stringify(message);
    
    // Use hibernation API to get all WebSocket connections
    const webSockets = this.state.getWebSockets();
    
    webSockets.forEach(ws => {
      try {
        ws.send(serializedMessage);
      } catch (error) {
        console.error('Failed to send message to WebSocket client:', error);
        // The hibernation API will automatically clean up dead connections
      }
    });
  }

  /**
   * WebSocket hibernation API handlers
   */
  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
    try {
      const messageStr = typeof message === 'string' ? message : new TextDecoder().decode(message);
      const parsedMessage: WSMessage = JSON.parse(messageStr);
      
      // Instantiate the logic handler to process the message.
      const handler = new WebSocketHandler(this, this.env);
      await handler.handleMessage(parsedMessage);
    } catch (error) {
      // If the message is invalid, inform all clients.
      this.broadcast({ 
        type: 'error', 
        error: `Invalid message: ${error instanceof Error ? error.message : String(error)}` 
      });
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    // Hibernation API automatically handles cleanup
    console.log(`WebSocket closed: code=${code}, reason=${reason}, wasClean=${wasClean}`);
    
    // Notify remaining clients about disconnection
    this.broadcast({
      type: 'client_disconnected',
      connectionCount: this.state.getWebSockets().length,
      timestamp: new Date().toISOString()
    });
  }

  async webSocketError(ws: WebSocket, error: Error) {
    console.error('WebSocket error:', error);
    
    // Notify clients about the error
    this.broadcast({
      type: 'websocket_error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
