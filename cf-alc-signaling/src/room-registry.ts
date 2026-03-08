import { DurableObject } from 'cloudflare:workers';

interface CallSchedule {
  enabled: boolean;
  startHour: number;
  startMin: number;
  endHour: number;
  endMin: number;
  days: number[]; // 0=日, 1=月, ..., 6=土
}

/**
 * RoomRegistry — singleton DO (name="registry")
 * Tracks which rooms currently have a device connected.
 * Admin clients can connect via WebSocket (/watch) to receive real-time updates.
 * Supports per-watcher schedule filtering (JST) using device_id tags + DO storage.
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
      const deviceId = url.searchParams.get('device_id') || '';
      const pair = new WebSocketPair();
      // Tag with device_id for identification after hibernation
      const tags = deviceId ? [`device:${deviceId}`] : [];
      this.ctx.acceptWebSocket(pair[1], tags);
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
    if (message === 'ping') {
      ws.send('pong');
      return;
    }
    if (typeof message !== 'string') return;
    try {
      const data = JSON.parse(message);
      if (data.type === 'set_schedule') {
        const deviceId = this.getDeviceId(ws);
        const schedule: CallSchedule = {
          enabled: !!data.schedule?.enabled,
          startHour: data.schedule?.startHour ?? 8,
          startMin: data.schedule?.startMin ?? 0,
          endHour: data.schedule?.endHour ?? 17,
          endMin: data.schedule?.endMin ?? 0,
          days: Array.isArray(data.schedule?.days) ? data.schedule.days : [1, 2, 3, 4, 5],
        };
        if (deviceId) {
          // Persist schedule in DO storage (survives hibernation)
          await this.ctx.storage.put(`schedule:${deviceId}`, schedule);
          console.log(`Schedule saved for ${deviceId}: ${JSON.stringify(schedule)}`);
        }
        ws.send(JSON.stringify({ type: 'schedule_saved', schedule }));
      }
    } catch { /* ignore parse errors */ }
  }

  async webSocketClose(ws: WebSocket) {
    ws.close();
  }

  async webSocketError(ws: WebSocket) {
    ws.close();
  }

  private getDeviceId(ws: WebSocket): string | null {
    const tags = this.ctx.getTags(ws);
    const deviceTag = tags.find(t => t.startsWith('device:'));
    return deviceTag ? deviceTag.replace('device:', '') : null;
  }

  private async getSchedule(ws: WebSocket): Promise<CallSchedule | null> {
    const deviceId = this.getDeviceId(ws);
    if (!deviceId) return null;
    return await this.ctx.storage.get<CallSchedule>(`schedule:${deviceId}`) ?? null;
  }

  private async broadcastRooms() {
    const rooms = await this.getActiveRooms();
    const msg = JSON.stringify({ type: 'rooms_updated', rooms });
    for (const ws of this.ctx.getWebSockets()) {
      try {
        const shouldSend = await this.shouldNotify(ws);
        if (shouldSend) {
          ws.send(msg);
        }
      } catch { /* ignore closed */ }
    }
  }

  private async shouldNotify(ws: WebSocket): Promise<boolean> {
    const schedule = await this.getSchedule(ws);
    if (!schedule || !schedule.enabled) return true;

    // JST = UTC+9
    const now = new Date();
    const jstOffset = 9 * 60;
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const jstMinutes = (utcMinutes + jstOffset) % 1440;
    const jstHour = Math.floor(jstMinutes / 60);
    const jstMin = jstMinutes % 60;

    // JST day of week (0=日, 1=月, ..., 6=土)
    const jstTotalMinutes = now.getTime() + jstOffset * 60 * 1000;
    const jstDay = new Date(jstTotalMinutes).getUTCDay();

    // Day check
    if (!schedule.days.includes(jstDay)) {
      console.log(`Blocked: device=${this.getDeviceId(ws)} day=${jstDay} not in ${schedule.days}`);
      return false;
    }

    // Time check
    const current = jstHour * 60 + jstMin;
    const start = schedule.startHour * 60 + schedule.startMin;
    const end = schedule.endHour * 60 + schedule.endMin;

    let inRange: boolean;
    if (start <= end) {
      inRange = current >= start && current < end;
    } else {
      inRange = current >= start || current < end;
    }

    if (!inRange) {
      console.log(`Blocked: device=${this.getDeviceId(ws)} time=${jstHour}:${jstMin} not in ${schedule.startHour}:${schedule.startMin}-${schedule.endHour}:${schedule.endMin}`);
    }
    return inRange;
  }

  private async getActiveRooms(): Promise<string[]> {
    const entries = await this.ctx.storage.list<number>({ prefix: 'room:' });
    return [...entries.keys()].map(k => k.replace('room:', ''));
  }
}
