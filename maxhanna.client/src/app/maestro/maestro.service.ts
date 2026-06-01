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
  settingsData?: string;
  settingsUpdatedAt?: string;
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
  async autoLogin(): Promise<string | null> {
    try {
      const res = await fetch('/maestro/auto-login', { method: 'POST' });
      if (!res.ok) return null;
      const data = await res.json();
      return data.token;
    } catch { return null; }
  }

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

  async cancelCommand(token: string, commandId: number): Promise<void> {
    const res = await fetch('/maestro/commands/ack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Token: token, CommandId: commandId, Status: 'cancelled' }),
    });
    if (!res.ok) throw new Error('Failed to cancel command');
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

  async updateCommandParams(token: string, commandId: number, params: any): Promise<boolean> {
    try {
      const res = await fetch('/maestro/commands/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Token: token, CommandId: commandId, Params: JSON.stringify(params) }),
      });
      return res.ok;
    } catch { return false; }
  }

  async saveSettings(token: string, settingsData: string): Promise<boolean> {
    try {
      const res = await fetch('/maestro/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Token: token, SettingsData: settingsData }),
      });
      return res.ok;
    } catch { return false; }
  }

  async getSettings(token: string): Promise<{ settingsData?: string; updatedAt?: string } | null> {
    try {
      const res = await fetch(`/maestro/settings?token=${encodeURIComponent(token)}`);
      if (!res.ok) return null;
      return res.json();
    } catch { return null; }
  }
}
