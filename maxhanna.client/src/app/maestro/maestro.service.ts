import { Injectable } from '@angular/core';

export interface MaestroProject {
  name: string;
  path: string;
  description?: string;
}

export interface MaestroCard {
  id: string;
  text?: string;
  title?: string;
  Text?: string;
  filePath?: string;
  FilePath?: string;
  priority?: string;
  createdAt?: string;
  ready?: boolean;
  attached?: string[];
  agentAnalysis?: any;
  agentLog?: any[];
  agentRunning?: boolean;
  agentPhase?: string;
  agentThinking?: string;
  agentSummary?: string;
}

export interface MaestroHeartbeatStatus {
  clientId: string;
  status: string;
  lastHeartbeat: string;
  kanbanData?: string;
}

export interface MaestroRemoteCommand {
  id: number;
  command: string;
  params?: any;
  parameters?: string;
  createdAt: string;
}

export interface AddCommandResult {
  id: number;
  status: string;
}

export interface KanbanPayload {
  projects: MaestroProject[];
  state: { todo: MaestroCard[]; doing: MaestroCard[]; done: MaestroCard[]; archived: MaestroCard[] };
  agentActive: boolean;
  agentPhase: string;
  agentThinking: string;
  agentSummary: string;
  activeCardId: string | null;
  activeCardText: string;
}

@Injectable({ providedIn: 'root' })
export class MaestroService {
  async login(username: string, password: string): Promise<{ token: string }> {
    const res = await fetch('/maestro/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Username: username, Password: password }),
    });
    if (!res.ok) throw new Error('Login failed');
    return res.json();
  }

  async getHeartbeatStatus(token: string, userId: number): Promise<MaestroHeartbeatStatus> {
    const res = await fetch(`/maestro/heartbeat/status?token=${encodeURIComponent(token)}&userId=${userId}`);
    if (!res.ok) throw new Error('Failed to fetch heartbeat status');
    return res.json();
  }

  async getCommands(token: string): Promise<MaestroRemoteCommand[]> {
    const res = await fetch(`/maestro/commands?token=${encodeURIComponent(token)}`);
    if (!res.ok) throw new Error('Failed to fetch commands');
    return res.json();
  }

  async addCommand(token: string, command: string, params?: any): Promise<AddCommandResult | null> {
    const res = await fetch('/maestro/commands/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Token: token, Command: command, Params: params ? JSON.stringify(params) : '' }),
    });
    if (!res.ok) return null;
    return res.json();
  }
}
