import { Component, OnDestroy, OnInit } from '@angular/core';
import { ChildComponent } from '../child.component';
import { MaestroService, MaestroHeartbeatStatus, MaestroRemoteCommand } from '../maestro/maestro.service';

@Component({
  selector: 'app-maestro',
  templateUrl: './maestro.component.html',
  styleUrl: './maestro.component.css',
  standalone: false
})
export class MaestroComponent extends ChildComponent implements OnInit, OnDestroy {
  heartbeat: MaestroHeartbeatStatus | null = null;
  commands: MaestroRemoteCommand[] = [];
  kanbanData: any = null;
  kanbanColumns: string[] = ['todo', 'in-progress', 'done'];
  loading = true;
  error = '';
  newCommand = '';
  commandResult = '';

  // Auth
  loginUsername = '';
  loginPassword = '';
  token = '';
  isLoggedIn = false;
  private readonly TOKEN_KEY = 'maestro_token';

  private pollTimer: any;

  constructor(private maestroService: MaestroService) {
    super();
  }

  async ngOnInit() {
    // Restore saved token
    const saved = window.localStorage.getItem(this.TOKEN_KEY);
    if (saved) {
      this.token = saved;
      this.isLoggedIn = true;
      await this.loadData();
    } else {
      this.loading = false;
    }
    this.pollTimer = setInterval(async () => {
      if (this.isLoggedIn) await this.loadData();
    }, 15000);
  }

  ngOnDestroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.remove_me('MaestroComponent');
  }

  safeDestroy() {
    this.ngOnDestroy();
  }

  async doLogin() {
    if (!this.loginUsername.trim() || !this.loginPassword.trim()) return;
    try {
      const res = await fetch('/maestro/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: this.loginUsername, password: this.loginPassword }),
      });
      if (!res.ok) {
        this.error = 'Login failed';
        return;
      }
      const data = await res.json();
      this.token = data.token;
      this.isLoggedIn = true;
      window.localStorage.setItem(this.TOKEN_KEY, this.token);
      this.error = '';
      await this.loadData();
    } catch (e: any) {
      this.error = e?.message || 'Connection error';
    }
  }

  doLogout() {
    this.token = '';
    this.isLoggedIn = false;
    this.heartbeat = null;
    this.kanbanData = null;
    this.commands = [];
    window.localStorage.removeItem(this.TOKEN_KEY);
  }

  async loadData() {
    if (!this.token) {
      this.loading = false;
      return;
    }
    try {
      this.heartbeat = await this.maestroService.getHeartbeatStatus(this.token, 0);
      if (this.heartbeat?.kanbanData) {
        try {
          this.kanbanData = JSON.parse(this.heartbeat.kanbanData);
        } catch { this.kanbanData = null; }
      }
      this.commands = await this.maestroService.getCommands(this.token);
      this.error = '';
    } catch (e: any) {
      this.error = e?.message || 'Failed to load data';
    } finally {
      this.loading = false;
    }
  }

  async sendCommand() {
    if (!this.newCommand.trim() || !this.token) return;
    const result = await this.maestroService.addCommand(this.token, this.newCommand.trim());
    if (result) {
      this.commandResult = `Command sent (id: ${result.id})`;
      this.newCommand = '';
    } else {
      this.commandResult = 'Failed to send command';
    }
  }

  getCardText(card: any): string {
    if (!card) return '';
    if (typeof card === 'string') return card;
    return card.Text || card.text || card.title || JSON.stringify(card);
  }

  getCardsForColumn(columnId: string): any[] {
    if (!this.kanbanData) return [];
    const col = this.kanbanData.columns?.find((c: any) => c.id === columnId || c.name?.toLowerCase() === columnId);
    if (!col) return [];
    const cardIds = col.cardIds || col.cards || [];
    return (this.kanbanData.cards || []).filter((c: any) =>
      cardIds.includes(c.id) || cardIds.includes(c.Id)
    );
  }

  isOnline(): boolean {
    if (!this.heartbeat) return false;
    const last = new Date(this.heartbeat.lastHeartbeat);
    const now = new Date();
    return (now.getTime() - last.getTime()) < 120000;
  }

  onCommandChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.newCommand = select.value;
  }
  changeLoginUsername(event: Event) {
    const input = event.target as HTMLInputElement;
    this.loginUsername = input.value;
  }
  changeLoginPassword(event: Event) {
    const input = event.target as HTMLInputElement;
    this.loginPassword = input.value;
  }
}
