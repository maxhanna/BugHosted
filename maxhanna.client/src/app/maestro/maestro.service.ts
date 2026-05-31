import { Injectable } from '@angular/core';

export interface MaestroHeartbeatStatus {
  clientId: string;
  status: string;
  lastHeartbeat: string;
  kanbanData: string | null;
}

export interface MaestroRemoteCommand {
  id: number;
  command: string;
  params: string | null;
  createdAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class MaestroService {
  constructor() { }

  async getHeartbeatStatus(token: string, userId: number): Promise<MaestroHeartbeatStatus | null> {
    try {
      const res = await fetch(`/api/maestro/heartbeat/status?token=${encodeURIComponent(token)}&userId=${userId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async getCommands(token: string): Promise<MaestroRemoteCommand[]> {
    try {
      const res = await fetch(`/api/maestro/commands?token=${encodeURIComponent(token)}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  }

  async addCommand(token: string, command: string, params?: string): Promise<{ id: number; status: string } | null> {
    try {
      const res = await fetch('/api/maestro/commands/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, command, params }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }
}
