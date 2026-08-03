import { Injectable, OnDestroy } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Subject } from 'rxjs';

export interface ChatPushEvent {
  chatId: number;
  messageId: number;
  senderId: number;
}

@Injectable({ providedIn: 'root' })
export class ChatHubService implements OnDestroy {
  private hub: signalR.HubConnection | null = null;

  readonly messagePosted$ = new Subject<ChatPushEvent>();
  readonly messageEdited$ = new Subject<ChatPushEvent>();
  readonly connectionError$ = new Subject<string>();

  get connected(): boolean {
    return this.hub?.state === signalR.HubConnectionState.Connected;
  }

  async connect(): Promise<boolean> {
    if (this.connected) return true;

    try {
      this.hub = new signalR.HubConnectionBuilder()
        .withUrl('/hubs/chat')
        .withAutomaticReconnect([0, 1000, 2000, 5000, 10000])
        .configureLogging(signalR.LogLevel.Warning)
        .build();

      this.hub.on('OnMessagePosted', (data: ChatPushEvent) => {
        this.messagePosted$.next(data);
      });

      this.hub.on('OnMessageEdited', (data: ChatPushEvent) => {
        this.messageEdited$.next(data);
      });

      this.hub.onreconnecting(() => {
        this.connectionError$.next('Reconnecting...');
      });

      this.hub.onclose(() => {
        this.connectionError$.next('Disconnected');
      });

      await this.hub.start();
      return true;
    } catch (err) {
      console.error('ChatHub connection failed:', err);
      this.connectionError$.next('Connection failed');
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.hub) return;
    try { await this.hub.stop(); } catch { }
    this.hub = null;
  }

  async joinChat(chatId: number): Promise<void> {
    if (!this.connected) await this.connect();
    if (!this.connected) return;
    try { await this.hub!.invoke('JoinChat', chatId); } catch { }
  }

  async leaveChat(chatId: number): Promise<void> {
    if (!this.connected) return;
    try { await this.hub!.invoke('LeaveChat', chatId); } catch { }
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
