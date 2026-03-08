import { DurableObject } from 'cloudflare:workers';
import type { Env } from './index';

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
export class RoomRegistry extends DurableObject<Env> {
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

    // POST /rooms/:roomId/answered → broadcast that room was answered
    const answeredMatch = url.pathname.match(/^\/rooms\/([^/]+)\/answered$/);
    if (request.method === 'POST' && answeredMatch) {
      const roomId = answeredMatch[1];
      await this.broadcastRoomAnswered(roomId);
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

    // PUT /schedule/:deviceId → 外部からスケジュール更新
    const scheduleMatch = url.pathname.match(/^\/schedule\/([^/]+)$/);
    if (request.method === 'PUT' && scheduleMatch) {
      const deviceId = scheduleMatch[1];
      try {
        const body = await request.json<CallSchedule>();
        const schedule: CallSchedule = {
          enabled: !!body.enabled,
          startHour: body.startHour ?? 8,
          startMin: body.startMin ?? 0,
          endHour: body.endHour ?? 17,
          endMin: body.endMin ?? 0,
          days: Array.isArray(body.days) ? body.days : [1, 2, 3, 4, 5],
        };
        await this.ctx.storage.put(`schedule:${deviceId}`, schedule);
        console.log(`Schedule updated via HTTP for ${deviceId}: ${JSON.stringify(schedule)}`);
        return new Response(null, { status: 204 });
      } catch {
        return new Response('Invalid JSON', { status: 400 });
      }
    }

    // GET /watchers → list connected watcher device_ids (debug)
    if (request.method === 'GET' && url.pathname === '/watchers') {
      const allSockets = this.ctx.getWebSockets();
      const watchers = allSockets.map(ws => {
        const deviceId = this.getDeviceId(ws);
        return { deviceId: deviceId || '(no tag)' };
      });
      return new Response(JSON.stringify({ count: watchers.length, watchers }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // POST /test-call-all → send test call to ALL connected devices respecting schedule
    if (request.method === 'POST' && url.pathname === '/test-call-all') {
      const allSockets = this.ctx.getWebSockets();
      if (allSockets.length === 0) {
        return new Response(JSON.stringify({ ok: true, results: [] }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const rooms = await this.getActiveRooms();
      const testRoomId = `test-call-${Date.now()}`;
      const msg = JSON.stringify({ type: 'rooms_updated', rooms: [...rooms, testRoomId] });

      const results: { device_id: string; sent: boolean; blocked: boolean; reason: string }[] = [];
      // Group sockets by device_id
      const deviceSockets = new Map<string, WebSocket[]>();
      for (const ws of allSockets) {
        const deviceId = this.getDeviceId(ws);
        if (!deviceId) continue;
        const arr = deviceSockets.get(deviceId) || [];
        arr.push(ws);
        deviceSockets.set(deviceId, arr);
      }

      for (const [deviceId, sockets] of deviceSockets) {
        const shouldSend = await this.shouldNotify(sockets[0]);
        if (shouldSend) {
          let sent = false;
          for (const s of sockets) {
            try { s.send(msg); sent = true; } catch { /* ignore closed */ }
          }
          results.push({ device_id: deviceId, sent, blocked: false, reason: '' });
        } else {
          let reason = '';
          const schedule = await this.getSchedule(sockets[0]);
          if (schedule) {
            if (!schedule.enabled) {
              reason = '着信OFFです';
            } else {
              const now = new Date();
              const jstOffset = 9 * 60;
              const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
              const jstMinutes = (utcMinutes + jstOffset) % 1440;
              const jstHour = Math.floor(jstMinutes / 60);
              const jstMin = jstMinutes % 60;
              const jstTotalMinutes = now.getTime() + jstOffset * 60 * 1000;
              const jstDay = new Date(jstTotalMinutes).getUTCDay();
              const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
              if (!schedule.days.includes(jstDay)) {
                reason = `${dayNames[jstDay]}曜日はスケジュール外です`;
              } else {
                const pad = (n: number) => String(n).padStart(2, '0');
                reason = `現在${pad(jstHour)}:${pad(jstMin)} — スケジュール${pad(schedule.startHour)}:${pad(schedule.startMin)}〜${pad(schedule.endHour)}:${pad(schedule.endMin)}外です`;
              }
            }
          }
          results.push({ device_id: deviceId, sent: false, blocked: true, reason });
        }
      }

      console.log(`Test call all: ${results.length} device(s), sent=${results.filter(r => r.sent).length}, blocked=${results.filter(r => r.blocked).length}`);
      return new Response(JSON.stringify({ ok: true, results }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // POST /test-call-all-with-fcm → WebSocket + FCM fallback (実際の着信と同じ経路)
    if (request.method === 'POST' && url.pathname === '/test-call-all-with-fcm') {
      const rooms = await this.getActiveRooms();
      const testRoomId = `test-call-${Date.now()}`;
      const msg = JSON.stringify({ type: 'rooms_updated', rooms: [...rooms, testRoomId] });

      const results: { device_id: string; sent: boolean; blocked: boolean; via: string; reason: string }[] = [];
      const wsDeliveredDeviceIds: string[] = [];

      // 1) WebSocket で送信
      const deviceSockets = new Map<string, WebSocket[]>();
      for (const ws of this.ctx.getWebSockets()) {
        const deviceId = this.getDeviceId(ws);
        if (!deviceId) continue;
        const arr = deviceSockets.get(deviceId) || [];
        arr.push(ws);
        deviceSockets.set(deviceId, arr);
      }

      for (const [deviceId, sockets] of deviceSockets) {
        const shouldSend = await this.shouldNotify(sockets[0]);
        if (shouldSend) {
          let sent = false;
          for (const s of sockets) {
            try { s.send(msg); sent = true; } catch { /* ignore closed */ }
          }
          if (sent) {
            wsDeliveredDeviceIds.push(deviceId);
            results.push({ device_id: deviceId, sent: true, blocked: false, via: 'WebSocket', reason: '' });
          }
        } else {
          const reason = await this.getBlockReason(sockets[0]);
          results.push({ device_id: deviceId, sent: false, blocked: true, via: '', reason });
        }
      }

      // 2) FCM fallback: WebSocket で届かなかったデバイスに FCM テスト送信
      let fcmResult: { sent?: number; errors?: number; results?: { device_id: string; device_name: string; success: boolean; error?: string }[] } = {};
      if (this.env.BACKEND_API_URL) {
        try {
          const res = await fetch(`${this.env.BACKEND_API_URL}/api/devices/test-fcm-all-exclude`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(this.env.FCM_INTERNAL_SECRET
                ? { 'X-Internal-Secret': this.env.FCM_INTERNAL_SECRET }
                : {}),
            },
            body: JSON.stringify({ exclude_device_ids: wsDeliveredDeviceIds }),
          });
          if (res.ok) {
            fcmResult = await res.json() as typeof fcmResult;
            for (const r of fcmResult.results || []) {
              results.push({
                device_id: r.device_id,
                sent: r.success,
                blocked: false,
                via: 'FCM',
                reason: r.error || '',
              });
            }
          }
        } catch (e) {
          console.log('FCM fallback test failed:', e);
        }
      }

      const wsSent = wsDeliveredDeviceIds.length;
      const fcmSent = fcmResult.sent || 0;
      console.log(`Test call all with FCM: WS=${wsSent}, FCM=${fcmSent}, blocked=${results.filter(r => r.blocked).length}`);
      return new Response(JSON.stringify({ ok: true, results }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // POST /test-call/:deviceId → send test call respecting schedule (verifies settings work correctly)
    const testCallMatch = url.pathname.match(/^\/test-call\/([^/]+)$/);
    if (request.method === 'POST' && testCallMatch) {
      const deviceId = testCallMatch[1];
      // Find watcher WebSocket tagged with this device_id
      const allSockets = this.ctx.getWebSockets(`device:${deviceId}`);
      if (allSockets.length === 0) {
        return new Response(JSON.stringify({ error: 'device_not_connected' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      // Check schedule — test call respects schedule to verify settings
      const ws = allSockets[0];
      const shouldSend = await this.shouldNotify(ws);

      if (shouldSend) {
        // Schedule allows → send test call
        const rooms = await this.getActiveRooms();
        const testRoomId = `test-call-${Date.now()}`;
        const msg = JSON.stringify({ type: 'rooms_updated', rooms: [...rooms, testRoomId] });
        let sent = 0;
        for (const s of allSockets) {
          try {
            s.send(msg);
            sent++;
          } catch { /* ignore closed */ }
        }
        console.log(`Test call sent to device ${deviceId}: ${sent} watcher(s)`);
        return new Response(JSON.stringify({ ok: true, sent, blocked: false }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } else {
        // Schedule blocks → report reason without sending
        let reason = '';
        const schedule = await this.getSchedule(ws);
        if (schedule) {
          if (!schedule.enabled) {
            reason = '着信OFFです';
          } else {
            const now = new Date();
            const jstOffset = 9 * 60;
            const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
            const jstMinutes = (utcMinutes + jstOffset) % 1440;
            const jstHour = Math.floor(jstMinutes / 60);
            const jstMin = jstMinutes % 60;
            const jstTotalMinutes = now.getTime() + jstOffset * 60 * 1000;
            const jstDay = new Date(jstTotalMinutes).getUTCDay();
            const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
            if (!schedule.days.includes(jstDay)) {
              reason = `${dayNames[jstDay]}曜日はスケジュール外です`;
            } else {
              const pad = (n: number) => String(n).padStart(2, '0');
              reason = `現在${pad(jstHour)}:${pad(jstMin)} — スケジュール${pad(schedule.startHour)}:${pad(schedule.startMin)}〜${pad(schedule.endHour)}:${pad(schedule.endMin)}外です`;
            }
          }
        }
        console.log(`Test call blocked for device ${deviceId}: ${reason}`);
        return new Response(JSON.stringify({ ok: true, sent: 0, blocked: true, reason }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
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
      if (data.type === 'call_answered' && data.roomId) {
        await this.broadcastRoomAnswered(data.roomId);
        return;
      }
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

  private async broadcastRoomAnswered(roomId: string) {
    const msg = JSON.stringify({ type: 'room_answered', roomId });
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(msg);
      } catch { /* ignore closed */ }
    }
    console.log(`Broadcast room_answered: ${roomId}`);
  }

  private async broadcastRooms() {
    const rooms = await this.getActiveRooms();
    const msg = JSON.stringify({ type: 'rooms_updated', rooms });
    const wsDeliveredDeviceIds: string[] = [];

    for (const ws of this.ctx.getWebSockets()) {
      try {
        const shouldSend = await this.shouldNotify(ws);
        if (shouldSend) {
          ws.send(msg);
          const deviceId = this.getDeviceId(ws);
          if (deviceId) wsDeliveredDeviceIds.push(deviceId);
        }
      } catch { /* ignore closed */ }
    }

    // FCM fallback: notify devices not connected via WebSocket
    if (rooms.length > 0 && this.env.BACKEND_API_URL) {
      this.ctx.waitUntil(
        fetch(`${this.env.BACKEND_API_URL}/api/devices/fcm-notify-call`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.env.FCM_INTERNAL_SECRET
              ? { 'X-Internal-Secret': this.env.FCM_INTERNAL_SECRET }
              : {}),
          },
          body: JSON.stringify({
            room_ids: rooms,
            exclude_device_ids: wsDeliveredDeviceIds,
          }),
        }).catch(e => console.log('FCM notify failed:', e))
      );
    }
  }

  private async shouldNotify(ws: WebSocket): Promise<boolean> {
    const schedule = await this.getSchedule(ws);
    if (!schedule) return true; // スケジュール未設定 → 通知する
    if (!schedule.enabled) return false; // 着信OFF → 通知しない

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

  private async getBlockReason(ws: WebSocket): Promise<string> {
    const schedule = await this.getSchedule(ws);
    if (!schedule) return '';
    if (!schedule.enabled) return '着信OFFです';
    const now = new Date();
    const jstOffset = 9 * 60;
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const jstMinutes = (utcMinutes + jstOffset) % 1440;
    const jstHour = Math.floor(jstMinutes / 60);
    const jstMin = jstMinutes % 60;
    const jstTotalMinutes = now.getTime() + jstOffset * 60 * 1000;
    const jstDay = new Date(jstTotalMinutes).getUTCDay();
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    if (!schedule.days.includes(jstDay)) {
      return `${dayNames[jstDay]}曜日はスケジュール外です`;
    }
    const pad = (n: number) => String(n).padStart(2, '0');
    return `現在${pad(jstHour)}:${pad(jstMin)} — スケジュール${pad(schedule.startHour)}:${pad(schedule.startMin)}〜${pad(schedule.endHour)}:${pad(schedule.endMin)}外です`;
  }

  private async getActiveRooms(): Promise<string[]> {
    const entries = await this.ctx.storage.list<number>({ prefix: 'room:' });
    return [...entries.keys()].map(k => k.replace('room:', ''));
  }
}
