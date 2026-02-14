import { DurableObject } from 'cloudflare:workers';

type ClientRole = 'device' | 'admin';

interface IceCandidate {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

interface SignalingMessage {
  type: 'sdp_offer' | 'sdp_answer' | 'ice_candidate' | 'ping';
  sdp?: string;
  candidate?: IceCandidate;
}

interface ServerMessage {
  type: 'sdp_offer' | 'sdp_answer' | 'ice_candidate' | 'peer_joined' | 'peer_left' | 'error' | 'pong';
  sdp?: string;
  candidate?: IceCandidate;
  role?: ClientRole;
  message?: string;
}

export class SignalingRoom extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const role = url.searchParams.get('role') as ClientRole;

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    // Check if this role is already connected
    const existing = this.ctx.getWebSockets(role);
    if (existing.length > 0) {
      return new Response(`Role "${role}" is already connected to this room`, { status: 409 });
    }

    const pair = new WebSocketPair();
    // Accept with role tag for Hibernatable WebSockets
    this.ctx.acceptWebSocket(pair[1], [role]);

    // Notify the other peer that a new participant joined
    this.notifyPeer(role, { type: 'peer_joined', role });

    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return;

    let data: SignalingMessage;
    try {
      data = JSON.parse(message);
    } catch {
      this.send(ws, { type: 'error', message: 'Invalid JSON' });
      return;
    }

    const senderRole = this.getRole(ws);
    if (!senderRole) {
      this.send(ws, { type: 'error', message: 'Unknown sender' });
      return;
    }

    switch (data.type) {
      case 'sdp_offer':
        // Device sends offer → relay to admin
        if (senderRole !== 'device') {
          this.send(ws, { type: 'error', message: 'Only device can send sdp_offer' });
          return;
        }
        this.notifyPeer(senderRole, { type: 'sdp_offer', sdp: data.sdp });
        break;

      case 'sdp_answer':
        // Admin sends answer → relay to device
        if (senderRole !== 'admin') {
          this.send(ws, { type: 'error', message: 'Only admin can send sdp_answer' });
          return;
        }
        this.notifyPeer(senderRole, { type: 'sdp_answer', sdp: data.sdp });
        break;

      case 'ice_candidate':
        // Either side can send ICE candidates → relay to peer
        this.notifyPeer(senderRole, { type: 'ice_candidate', candidate: data.candidate });
        break;

      case 'ping':
        this.send(ws, { type: 'pong' });
        break;

      default:
        this.send(ws, { type: 'error', message: `Unknown message type: ${(data as { type: string }).type}` });
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, _wasClean: boolean): Promise<void> {
    const role = this.getRole(ws);
    if (role) {
      this.notifyPeer(role, { type: 'peer_left', role });
    }
    ws.close(code, reason);
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    const role = this.getRole(ws);
    if (role) {
      this.notifyPeer(role, { type: 'peer_left', role });
    }
    ws.close(1011, 'WebSocket error');
  }

  /** Get the role tag attached to a WebSocket */
  private getRole(ws: WebSocket): ClientRole | null {
    const tags = this.ctx.getTags(ws);
    if (tags.includes('device')) return 'device';
    if (tags.includes('admin')) return 'admin';
    return null;
  }

  /** Send a message to the peer (the other role) */
  private notifyPeer(senderRole: ClientRole, message: ServerMessage): void {
    const peerRole: ClientRole = senderRole === 'device' ? 'admin' : 'device';
    const peers = this.ctx.getWebSockets(peerRole);
    for (const peer of peers) {
      this.send(peer, message);
    }
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // WebSocket already closed
    }
  }
}
