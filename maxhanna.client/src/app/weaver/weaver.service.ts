import { Injectable } from '@angular/core';

export interface WeaverProject {
  name: string;
  path: string;
  description?: string;
}

export interface WeaverCard {
  id: string;
  text?: string;
  title?: string;
  Text?: string;
  filePath?: string;
  FilePath?: string;
  priority?: string;
  createdAt?: string;
  ready?: boolean;
  autoPr?: boolean;
  prStatus?: { status: string; branch?: string; prUrl?: string; originalBranch?: string; error?: string };
  attached?: string[];
  agentAnalysis?: any;
  agentLog?: any[];
  agentRunning?: boolean;
  agentPhase?: string;
  agentThinking?: string;
  agentSummary?: string;
}

export interface WeaverHeartbeatStatus {
  clientId: string;
  status: string;
  lastHeartbeat: string;
  kanbanData?: string;
  settingsData?: string;
  settingsUpdatedAt?: string;
  weaverAddress?: string;
  remoteIp?: string;
}

export interface WeaverRemoteCommand {
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

export interface IdeFileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface IdeTab {
  path: string;
  content: string;
  originalContent: string;
  dirty: boolean;
  loading: boolean;
}

export interface EditorState {
  currentFile: string | null;
  openFiles: string[];
  content: string;
  dirty: boolean;
}

export interface KanbanPayload {
  projects: WeaverProject[];
  state: { todo: WeaverCard[]; doing: WeaverCard[]; done: WeaverCard[]; archived: WeaverCard[] };
  agentActive: boolean;
  agentPhase: string;
  agentThinking: string;
  agentSummary: string;
  activeCardId: string | null;
  activeCardText: string;
}

@Injectable({ providedIn: 'root' })
export class WeaverService {
  async autoLogin(): Promise<string | null> {
    try {
      const res = await fetch('/weaver/auto-login', { method: 'POST' });
      if (!res.ok) return null;
      const data = await res.json();
      return data.token;
    } catch { return null; }
  }

  async login(username: string, password: string): Promise<{ token: string }> {
    const res = await fetch('/weaver/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Username: username, Password: password }),
    });
    if (!res.ok) throw new Error('Login failed');
    return res.json();
  }

  async getHeartbeatStatus(token: string, userId: number): Promise<WeaverHeartbeatStatus> {
    const res = await fetch(`/weaver/heartbeat/status?token=${encodeURIComponent(token)}&userId=${userId}`);
    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('UNAUTHORIZED');
      }
      throw new Error('Failed to fetch heartbeat status');
    }
    return res.json();
  }

  async getCommands(token: string): Promise<WeaverRemoteCommand[]> {
    const res = await fetch(`/weaver/commands?token=${encodeURIComponent(token)}`);
    if (!res.ok) throw new Error('Failed to fetch commands');
    return res.json();
  }

  async cancelCommand(token: string, commandId: number): Promise<void> {
    const res = await fetch('/weaver/commands/ack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Token: token, CommandId: commandId, Status: 'cancelled' }),
    });
    if (!res.ok) throw new Error('Failed to cancel command');
  }

  async addCommand(token: string, command: string, params?: any): Promise<AddCommandResult | null> {
    const res = await fetch('/weaver/commands/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Token: token, Command: command, Params: params ? JSON.stringify(params) : '' }),
    });
    if (!res.ok) return null;
    return res.json();
  }

  async updateCommandParams(token: string, commandId: number, params: any): Promise<boolean> {
    try {
      const res = await fetch('/weaver/commands/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Token: token, CommandId: commandId, Params: JSON.stringify(params) }),
      });
      return res.ok;
    } catch { return false; }
  }

  async saveSettings(token: string, settingsData: string): Promise<boolean> {
    try {
      const res = await fetch('/weaver/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Token: token, SettingsData: settingsData }),
      });
      return res.ok;
    } catch { return false; }
  }

  async getSettings(token: string): Promise<{ settingsData?: string; updatedAt?: string } | null> {
    try {
      const res = await fetch(`/weaver/settings?token=${encodeURIComponent(token)}`);
      if (!res.ok) return null;
      return res.json();
    } catch { return null; }
  }

  // ── Direct filesystem access (bypasses the command/heartbeat loop) ──────────
  // These call BugHosted's own /api/bughosted/fs/* which proxies to the Weaver
  // local filesystem in real time — no 10-second polling delay.

  async fsList(clientId: string, path: string): Promise<{ path: string; entries: IdeFileEntry[] } | null> {
    try {
      const params = new URLSearchParams({ clientId, path });
      const res = await fetch(`/api/bughosted/fs/list?${params}`);
      if (!res.ok) return null;
      return res.json();
    } catch { return null; }
  }

  async fsContent(clientId: string, path: string): Promise<{ path: string; content: string } | null> {
    try {
      const params = new URLSearchParams({ clientId, path });
      const res = await fetch(`/api/bughosted/fs/content?${params}`);
      if (!res.ok) return null;
      return res.json();
    } catch { return null; }
  }

  async fsSave(clientId: string, path: string, content: string): Promise<boolean> {
    try {
      const res = await fetch('/api/bughosted/fs/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, path, content, createIfMissing: false }),
      });
      return res.ok;
    } catch { return false; }
  }
}
