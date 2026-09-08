import type { SiteEventListener, SiteEventSource } from "./types";
import { KNOWN_EVENT_TYPES } from "./types";
import { parseSiteEvent } from "./event-schema";

/**
 * Remote-mode SSE adapter over the native browser EventSource. The browser
 * uses same-origin /api/v1/events/stream?siteId=... with the HttpOnly session
 * cookie; no custom Authorization header is assembled.
 */
export class BrowserEventSourceTransport implements SiteEventSource {
  private es: EventSource | null = null;
  private listeners = new Set<SiteEventListener>();
  private readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  open(): void {
    if (this.es) return;
    const es = new EventSource(this.url);
    this.es = es;

    es.onopen = () => {
      for (const listener of this.listeners) listener.onOpen();
    };
    es.onerror = () => {
      for (const listener of this.listeners) listener.onError();
    };
    // M1 requires a named SSE event; unnamed `message` frames are ignored.
    es.onmessage = (messageEvent) => this.handle("message", messageEvent);

    for (const type of KNOWN_EVENT_TYPES) {
      es.addEventListener(type, (messageEvent) => this.handle(type, messageEvent));
    }
  }

  private handle(name: string, messageEvent: MessageEvent<string>): void {
    let data: unknown;
    try {
      data = JSON.parse(messageEvent.data);
    } catch {
      return; // malformed JSON: ignore, keep connection
    }
    const parsed = parseSiteEvent(name, data);
    if (!parsed) return;
    for (const listener of this.listeners) listener.onEvent(parsed);
  }

  close(): void {
    if (this.es) {
      this.es.close();
      this.es = null;
    }
  }

  subscribe(listener: SiteEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
