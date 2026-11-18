import { NextRequest } from 'next/server';
import { subscribePortalUpdates, type PortalPushEvent } from '@/lib/portal-events';
import { loadServerStore } from '@/lib/server-db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  const store = loadServerStore();
  let isClosed = false;
  let unsubscribe: (() => void) | null = null;
  let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const safeEnqueue = (chunk: string) => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          isClosed = true;
        }
      };

      const sendEvent = (name: string, data: Record<string, unknown>) => {
        safeEnqueue(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      sendEvent('ready', {
        version: store.mutationVersion || 1,
        updatedAt: new Date().toISOString(),
      });

      unsubscribe = subscribePortalUpdates((evt: PortalPushEvent) => {
        sendEvent('update', {
          version: evt.version,
          topic: evt.topic,
          updatedAt: evt.updatedAt,
        });
      });

      keepAliveTimer = setInterval(() => {
        safeEnqueue(`: keepalive ${Date.now()}\n\n`);
      }, 25_000);

      const cleanup = () => {
        if (isClosed) return;
        isClosed = true;
        if (keepAliveTimer) {
          clearInterval(keepAliveTimer);
          keepAliveTimer = null;
        }
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
        try {
          controller.close();
        } catch {
          // Stream already closed
        }
      };

      req.signal.addEventListener('abort', cleanup);
    },
    cancel() {
      isClosed = true;
      if (keepAliveTimer) {
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
      }
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
