import { Injectable, OnDestroy } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Subject } from 'rxjs';

export interface CoEditParticipant {
  connectionId: string;
  displayName: string;
  cursor?: {
    line: number; col: number;
    selEndLine?: number; selEndCol?: number;
  };
}

export interface ContentChangedEvent {
  connectionId: string;
  content: string;
  version: number;
}

export interface CursorChangedEvent {
  connectionId: string;
  line: number; col: number;
  selEndLine?: number; selEndCol?: number;
}

@Injectable({ providedIn: 'root' })
export class CoEditService implements OnDestroy {

  private hub: signalR.HubConnection | null = null;

  // Events emitted to subscribers
  readonly participantJoined$  = new Subject<CoEditParticipant>();
  readonly participantLeft$    = new Subject<{ connectionId: string; displayName: string }>();
  readonly currentParticipants$ = new Subject<{ participants: CoEditParticipant[]; version: number; content: string | null }>();
  readonly contentChanged$     = new Subject<ContentChangedEvent>();
  readonly cursorChanged$      = new Subject<CursorChangedEvent>();

  /** My own connection ID (set after connect) */
  get myConnectionId(): string | null { return this.hub?.connectionId ?? null; }

  /** True while connected */
  get connected(): boolean {
    return this.hub?.state === signalR.HubConnectionState.Connected;
  }

  async connect(): Promise<void> {
    if (this.hub && this.hub.state !== signalR.HubConnectionState.Disconnected) return;

    this.hub = new signalR.HubConnectionBuilder()
      .withUrl('/hubs/coEdit')
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    this.hub.on('OnParticipantJoined', (connectionId: string, displayName: string) => {
      this.participantJoined$.next({ connectionId, displayName });
    });

    this.hub.on('OnParticipantLeft', (connectionId: string, displayName: string) => {
      this.participantLeft$.next({ connectionId, displayName });
    });

    this.hub.on('OnCurrentParticipants',
      (participants: CoEditParticipant[], version: number, content: string | null) => {
        this.currentParticipants$.next({ participants, version, content });
      });

    this.hub.on('OnContentChanged', (connectionId: string, content: string, version: number) => {
      this.contentChanged$.next({ connectionId, content, version });
    });

    this.hub.on('OnCursorChanged',
      (connectionId: string, line: number, col: number,
       selEndLine?: number, selEndCol?: number) => {
        this.cursorChanged$.next({ connectionId, line, col, selEndLine, selEndCol });
      });

    await this.hub.start();
  }

  async disconnect(): Promise<void> {
    if (!this.hub) return;
    try { await this.hub.stop(); } catch { }
    this.hub = null;
  }

  async joinFile(path: string, displayName: string): Promise<void> {
    if (!this.connected) await this.connect();
    await this.hub!.invoke('JoinFile', path, displayName);
  }

  async leaveFile(path: string): Promise<void> {
    if (!this.connected) return;
    await this.hub!.invoke('LeaveFile', path);
  }

  async pushContent(path: string, content: string, version: number): Promise<void> {
    if (!this.connected) return;
    await this.hub!.invoke('PushContent', path, content, version);
  }

  async pushCursor(path: string, line: number, col: number,
                   selEndLine?: number, selEndCol?: number): Promise<void> {
    if (!this.connected) return;
    await this.hub!.invoke('PushCursor', path, line, col, selEndLine, selEndCol);
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
