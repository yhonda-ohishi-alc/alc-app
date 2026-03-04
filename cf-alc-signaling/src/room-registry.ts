import { DurableObject } from 'cloudflare:workers';

/**
 * RoomRegistry — singleton DO (name="registry")
 * Tracks which rooms currently have a device connected.
 * Admin clients can connect via WebSocket (/watch) to receive real-time updates.
 */
export class RoomRegistry extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // GET /watch → WebSocket upgrade for real-time room list updates
    if (request.method === 'GET' && url.pathname === '/watch') {
      const upgradeHeader = request.headers.get('Upgrade');
      if (upgradeHeader !== 'websocket') {
        return new Response('Expected WebSocket upgrade', { status: 426 });
      }
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      // Send current state immediately on connect
      const rooms = await this.getActiveRooms();
      pair[1].send(JSON.stringify({ type: 'rooms_updated', rooms }));
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    // GET /rooms → list active room IDs
    if (request.method === 'GET' && url.pathname === '/rooms') {
      const rooms = await this.getActiveRooms();
      return new Response(JSON.stringify({ rooms }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // PUT /rooms/:roomId → register room
    const putMatch = url.pathname.match(/^\/rooms\/([^/]+)$/);
    if (request.method === 'PUT' && putMatch) {
      const roomId = putMatch[1];
      await this.ctx.storage.put(`room:${roomId}`, Date.now());
      await this.broadcastRooms();
      return new Response(null, { status: 204 });
    }

    // DELETE /rooms/:roomId → unregister room
    const delMatch = url.pathname.match(/^\/rooms\/([^/]+)$/);
    if (request.method === 'DELETE' && delMatch) {
      const roomId = delMatch[1];
      await this.ctx.storage.delete(`room:${roomId}`);
      await this.broadcastRooms();
      return new Response(null, { status: 204 });
    }

    return new Response('Not Found', { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (message === 'ping') ws.send('pong');
  }

  async webSocketClose(ws: WebSocket) {
    ws.close();
  }

  async webSocketError(ws: WebSocket) {
    ws.close();
  }

  private async broadcastRooms() {
    const rooms = await this.getActiveRooms();
    const msg = JSON.stringify({ type: 'rooms_updated', rooms });
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(msg); } catch { /* ignore closed */ }
    }
  }

  private async getActiveRooms(): Promise<string[]> {
    const entries = await this.ctx.storage.list<number>({ prefix: 'room:' });
    return [...entries.keys()].map(k => k.replace('room:', ''));
  }
}
