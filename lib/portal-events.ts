export type PortalEventTopic = 'portal' | 'chat';

export interface PortalPushEvent {
  version: number;
  topic: PortalEventTopic;
  updatedAt: string;
}

type PortalEventListener = (event: PortalPushEvent) => void;

interface PortalEventBus {
  listeners: Set<PortalEventListener>;
  latestVersion: number;
}

declare global {
  var __alnibrasPortalEventBus: PortalEventBus | undefined;
}

function getBus(): PortalEventBus {
  if (!global.__alnibrasPortalEventBus) {
    global.__alnibrasPortalEventBus = {
      listeners: new Set<PortalEventListener>(),
      latestVersion: 1,
    };
  }
  return global.__alnibrasPortalEventBus;
}

export function emitPortalUpdate(version: number, topic: PortalEventTopic = 'portal'): void {
  const bus = getBus();
  bus.latestVersion = Math.max(bus.latestVersion, version);
  const payload: PortalPushEvent = {
    version,
    topic,
    updatedAt: new Date().toISOString(),
  };
  for (const listener of Array.from(bus.listeners)) {
    try {
      listener(payload);
    } catch {
      // Ignore failing subscriber cleanup
    }
  }
}

export function subscribePortalUpdates(listener: PortalEventListener): () => void {
  const bus = getBus();
  bus.listeners.add(listener);
  return () => {
    bus.listeners.delete(listener);
  };
}
