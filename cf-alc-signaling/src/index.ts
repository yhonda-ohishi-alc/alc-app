export { SignalingRoom } from './signaling-room';
export { RoomRegistry } from './room-registry';

interface Env {
  SIGNALING_ROOM: DurableObjectNamespace;
  ROOM_REGISTRY: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health') {
      return new Response('ok');
    }

    // GET /active-rooms → list rooms with device connected
    if (request.method === 'GET' && url.pathname === '/active-rooms') {
      const id = env.ROOM_REGISTRY.idFromName('registry');
      const stub = env.ROOM_REGISTRY.get(id);
      const res = await stub.fetch('https://registry/rooms');
      const data = await res.json<{ rooms: string[] }>();
      return new Response(JSON.stringify(data), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // DELETE /active-rooms/:roomId → manually remove stale room
    const delRoomMatch = url.pathname.match(/^\/active-rooms\/([a-zA-Z0-9_-]+)$/);
    if (request.method === 'DELETE' && delRoomMatch) {
      const id = env.ROOM_REGISTRY.idFromName('registry');
      const stub = env.ROOM_REGISTRY.get(id);
      await stub.fetch(`https://registry/rooms/${delRoomMatch[1]}`, { method: 'DELETE' });
      return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    // GET /watch-rooms → WebSocket for real-time room list updates
    if (url.pathname === '/watch-rooms') {
      const id = env.ROOM_REGISTRY.idFromName('registry');
      const stub = env.ROOM_REGISTRY.get(id);
      return stub.fetch(new Request('https://registry/watch', request));
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
