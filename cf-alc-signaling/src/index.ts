export { SignalingRoom } from './signaling-room';

interface Env {
  SIGNALING_ROOM: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health') {
      return new Response('ok');
    }

    // WebSocket endpoint: /room/:roomId
    const match = url.pathname.match(/^\/room\/([a-zA-Z0-9_-]+)$/);
    if (!match) {
      return new Response('Not Found. Use /room/:roomId', { status: 404 });
    }

    const roomId = match[1];
    const role = url.searchParams.get('role');
    if (role !== 'device' && role !== 'admin') {
      return new Response('Missing or invalid role query param. Use ?role=device or ?role=admin', {
        status: 400,
      });
    }

    // Route to Durable Object by room ID
    const id = env.SIGNALING_ROOM.idFromName(roomId);
    const stub = env.SIGNALING_ROOM.get(id);

    return stub.fetch(request);
  },
} satisfies ExportedHandler<Env>;
