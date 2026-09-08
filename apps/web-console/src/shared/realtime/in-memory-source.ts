import type { SiteEvent, SiteEventListener, SiteEventSource } from "./types";

/**
 * Test/controlled SiteEventSource. The hook depends only on the interface;
 * this double lets tests drive open/event/error deterministically.
 */
export class InMemorySiteEventSource implements SiteEventSource {
  private listeners = new Set<SiteEventListener>();
  private opened = false;
  private opens = 0;
  private closes = 0;

  open(): void {
    this.opened = true;
    this.opens += 1;
  }

  close(): void {
    this.opened = false;
    this.closes += 1;
  }

  subscribe(listener: SiteEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emitOpen(): void {
    for (const listener of this.listeners) listener.onOpen();
  }

  emitEvent(event: SiteEvent): void {
    for (const listener of this.listeners) listener.onEvent(event);
  }

  emitError(): void {
    for (const listener of this.listeners) listener.onError();
  }

  get isOpened(): boolean {
    return this.opened;
  }

  get openCount(): number {
    return this.opens;
  }

  get closeCount(): number {
    return this.closes;
  }
}
