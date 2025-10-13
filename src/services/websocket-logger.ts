/**
 * @fileoverview WebSocket Logger Service
 * 
 * This service provides real-time logging capabilities that broadcast to all connected
 * WebSocket clients. It's designed to provide verbose, real-time feedback during
 * job extraction processes, including:
 * 
 * - Puppeteer actions and screenshots
 * - AI model reasoning and thoughts
 * - Data extraction progress
 * - Error handling and debugging information
 * - Performance metrics and timing
 * 
 * @author AI Agent Development Team
 * @version 1.0.0
 * @since 2024-01-20
 */

export interface LogEvent {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error' | 'success';
  category: 'system' | 'puppeteer' | 'ai' | 'extraction' | 'websocket' | 'performance';
  message: string;
  data?: any;
  screenshot?: string; // Base64 encoded screenshot
  duration?: number; // Duration in milliseconds
  sessionId?: string;
}

export interface WebSocketLogger {
  debug(category: LogEvent['category'], message: string, data?: any): void;
  info(category: LogEvent['category'], message: string, data?: any): void;
  warn(category: LogEvent['category'], message: string, data?: any): void;
  error(category: LogEvent['category'], message: string, data?: any): void;
  success(category: LogEvent['category'], message: string, data?: any): void;
  screenshot(message: string, screenshotBase64: string, data?: any): void;
  performance(message: string, duration: number, data?: any): void;
  aiThought(message: string, reasoning?: string, data?: any): void;
  puppeteerAction(action: string, selector?: string, data?: any): void;
}

/**
 * Creates a WebSocket logger that broadcasts to all connected clients
 * 
 * @param env - Cloudflare environment with WebSocket Durable Object binding
 * @param sessionId - Optional session ID for tracking related logs
 * @returns WebSocket logger instance
 */
export function createWebSocketLogger(env: Env, sessionId?: string): WebSocketLogger {
  const broadcast = async (event: LogEvent) => {
    try {
      // Add session ID if provided
      if (sessionId) {
        event.sessionId = sessionId;
      }

      // Always log to console for debugging
      const consoleMessage = `[${event.level.toUpperCase()}] [${event.category}] ${event.message}`;
      switch (event.level) {
        case 'debug':
          console.debug(consoleMessage, event.data || '');
          break;
        case 'info':
          console.info(consoleMessage, event.data || '');
          break;
        case 'warn':
          console.warn(consoleMessage, event.data || '');
          break;
        case 'error':
          console.error(consoleMessage, event.data || '');
          break;
        case 'success':
          console.log(`✅ ${consoleMessage}`, event.data || '');
          break;
      }

      // Broadcast to WebSocket clients
      const id = env.WEBSOCKET_HANDLER_DO.idFromName('websocket-handler');
      const durableObject = env.WEBSOCKET_HANDLER_DO.get(id);
      
      // Send the log event to the Durable Object for broadcasting
      await durableObject.fetch(new Request('https://internal/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event)
      }));
    } catch (error) {
      // Fallback to console if WebSocket broadcast fails
      console.error('Failed to broadcast log event:', error);
      console.log('Original event:', event);
    }
  };

  const createLogEvent = (
    level: LogEvent['level'],
    category: LogEvent['category'],
    message: string,
    data?: any
  ): LogEvent => ({
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    data
  });

  return {
    debug: (category, message, data) => {
      broadcast(createLogEvent('debug', category, message, data));
    },

    info: (category, message, data) => {
      broadcast(createLogEvent('info', category, message, data));
    },

    warn: (category, message, data) => {
      broadcast(createLogEvent('warn', category, message, data));
    },

    error: (category, message, data) => {
      broadcast(createLogEvent('error', category, message, data));
    },

    success: (category, message, data) => {
      broadcast(createLogEvent('success', category, message, data));
    },

    screenshot: (message, screenshotBase64, data) => {
      broadcast({
        ...createLogEvent('info', 'puppeteer', message, data),
        screenshot: screenshotBase64
      });
    },

    performance: (message, duration, data) => {
      broadcast({
        ...createLogEvent('info', 'performance', message, data),
        duration
      });
    },

    aiThought: (message, reasoning, data) => {
      broadcast(createLogEvent('info', 'ai', message, {
        reasoning,
        ...data
      }));
    },

    puppeteerAction: (action, selector, data) => {
      broadcast(createLogEvent('info', 'puppeteer', `Action: ${action}`, {
        action,
        selector,
        ...data
      }));
    }
  };
}

/**
 * Performance timer utility for measuring operation duration
 */
export class PerformanceTimer {
  private startTime: number;
  private logger: WebSocketLogger;
  private operation: string;

  constructor(logger: WebSocketLogger, operation: string) {
    this.logger = logger;
    this.operation = operation;
    this.startTime = Date.now();
    this.logger.debug('performance', `Started: ${operation}`);
  }

  end(additionalData?: any): number {
    const duration = Date.now() - this.startTime;
    this.logger.performance(`Completed: ${this.operation}`, duration, additionalData);
    return duration;
  }

  checkpoint(checkpoint: string, additionalData?: any): number {
    const duration = Date.now() - this.startTime;
    this.logger.performance(`Checkpoint (${this.operation}): ${checkpoint}`, duration, additionalData);
    return duration;
  }
}
