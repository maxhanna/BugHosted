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
  _plan?: { summary?: string; items?: { file: string; change: string; done: boolean }[] };
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
  fileRequests?: any[];
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

  // ── File request table flow ────────────────────────────────────────────────
  // Creates a file request in the BugHosted database, then polls until the
  // Weaver backend processes and fulfills it. Works through NAT because the
  // Weaver's polling loop picks up pending requests, processes them locally,
  // and stores the result.

  async requestFile(clientId: string, type: string, path: string, content?: string): Promise<{ id: number; status: string } | null> {
    try {
      const res = await fetch('/bughosted/fs/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, type, path, content }),
      });
      if (!res.ok) return null;
      return res.json();
    } catch { return null; }
  }

  async pollFileResult(id: number, timeoutMs = 15000): Promise<{ status: string; result?: string } | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`/bughosted/fs/requests/result?id=${id}`);
        if (!res.ok) return null;
        const data = await res.json();
        if (data.status === 'fulfilled') return data;
        if (data.status === 'error') return data;
      } catch { }
      await new Promise(r => setTimeout(r, 500));
    }
    return null;
  }

  // ── File Hints ──────────────────────────────────────────────────────

  async getFileHints(token: string): Promise<any[]> {
    try {
      const res = await fetch(`/weaver/fileHints?token=${encodeURIComponent(token)}`);
      if (!res.ok) return [];
      return res.json();
    } catch { return []; }
  }

  async saveFileHints(token: string, hints: any[]): Promise<boolean> {
    try {
      const res = await fetch('/weaver/fileHints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Token: token, Hints: hints }),
      });
      return res.ok;
    } catch { return false; }
  }
}
