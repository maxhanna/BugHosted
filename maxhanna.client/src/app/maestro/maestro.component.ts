import { Component, OnDestroy, OnInit } from '@angular/core';
import { MaestroService, MaestroCard, MaestroProject, KanbanPayload } from '../maestro/maestro.service';

@Component({
  selector: 'app-maestro',
  templateUrl: './maestro.component.html',
  styleUrl: './maestro.component.css',
  standalone: false,
})
export class MaestroComponent implements OnInit, OnDestroy {
  // Auth
  loginUsername = '';
  loginPassword = '';
  token = '';
  isLoggedIn = false;
  error = '';
  activeCardId: string | null = null;
  private readonly TOKEN_KEY = 'maestro_token';

  // Data
  projects: MaestroProject[] = [];
  selectedProjectPath = '';
  kanbanColumns = ['todo', 'doing', 'done'];
  state: { todo: MaestroCard[]; doing: MaestroCard[]; done: MaestroCard[]; archived: MaestroCard[] } = {
    todo: [], doing: [], done: [], archived: [],
  };
  showArchived = false;

  // Agent status (top-level, from heartbeat)
  agentActive = false;
  agentPhase = '';
  agentThinking = '';
  agentSummary = '';
  activeCardText = '';

  // Heartbeat
  lastHeartbeat = '';
  clientId = '';

  // Commands
  commands: any[] = [];
  newCommandType = '';
  newCommandText = '';
  commandResult = '';
  commandSending = false;

  // UI state
  loading = true;
  editCardId: string | null = null;
  editCardText = '';
  dragCardId: string | null = null;

  private pollTimer: any;

  constructor(private maestroService: MaestroService) { }

  async ngOnInit() {
    const saved = window.localStorage.getItem(this.TOKEN_KEY);
    if (saved) {
      this.token = saved;
      this.isLoggedIn = true;
      await this.loadData();
    }
    this.loading = false;
    this.pollTimer = setInterval(async () => {
      if (this.isLoggedIn) await this.loadData();
    }, 10000);
  }

  ngOnDestroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  async doLogin() {
    if (!this.loginUsername.trim() || !this.loginPassword.trim()) return;
    this.error = '';
    try {
      const data = await this.maestroService.login(this.loginUsername, this.loginPassword);
      this.token = data.token;
      this.isLoggedIn = true;
      window.localStorage.setItem(this.TOKEN_KEY, this.token);
      await this.loadData();
      this.loading = false;
    } catch (e: any) {
      this.error = e?.message || 'Connection error';
    }
  }

  doLogout() {
    this.token = '';
    this.isLoggedIn = false;
    this.projects = [];
    this.state = { todo: [], doing: [], done: [], archived: [] };
    this.commands = [];
    window.localStorage.removeItem(this.TOKEN_KEY);
  }

  async loadData() {
    if (!this.token) return;
    try {
      const hb = await this.maestroService.getHeartbeatStatus(this.token, 0);
      this.lastHeartbeat = hb.lastHeartbeat;
      this.clientId = hb.clientId;
      if (hb.kanbanData) {
        try {
          const parsed: any = JSON.parse(hb.kanbanData);
          const rawProjects = parsed.projects || parsed.Projects || [];
          this.projects = rawProjects.map((p: any) => ({
            name: p.name ?? p.Name ?? '',
            path: p.path ?? p.Path ?? '',
            description: p.description ?? p.Description ?? '',
          }));
          const state = parsed.state || parsed.State;
          if (state) this.state = state;
          this.agentActive = parsed.agentActive ?? parsed.AgentActive ?? false;
          this.agentPhase = parsed.agentPhase || parsed.AgentPhase || '';
          this.agentThinking = parsed.agentThinking || parsed.AgentThinking || '';
          this.agentSummary = parsed.agentSummary || parsed.AgentSummary || '';
          this.activeCardText = parsed.activeCardText || parsed.ActiveCardText || '';
          if (!this.selectedProjectPath && this.projects.length) {
            this.selectedProjectPath = this.projects[0].path;
          }
        } catch { }
      }
      this.commands = await this.maestroService.getCommands(this.token);
      this.error = '';
    } catch (e: any) {
      if (this.isLoggedIn) this.error = e?.message || 'Lost connection';
    }
  }

  // --- Project filtering ---
  get filteredTodo(): MaestroCard[] {
    return this.state.todo.filter(c => this.matchesProject(c));
  }

  get filteredDoing(): MaestroCard[] {
    return this.state.doing.filter(c => this.matchesProject(c));
  }

  get filteredDone(): MaestroCard[] {
    return this.state.done.filter(c => this.matchesProject(c));
  }

  get filteredArchived(): MaestroCard[] {
    return this.state.archived.filter(c => this.matchesProject(c));
  }

  private matchesProject(c: MaestroCard): boolean {
    if (!this.selectedProjectPath) return true;
    const fp = c.filePath || c.FilePath || '';
    return fp === this.selectedProjectPath;
  }

  get selectedProjectName(): string {
    const p = this.projects.find(x => x.path === this.selectedProjectPath);
    return p?.name || this.selectedProjectPath || 'All Projects';
  }

  // --- Card helpers ---
  getCardText(c: MaestroCard): string {
    return c.text || c.Text || c.title || '';
  }

  getCardPriority(c: MaestroCard): string {
    return c.priority || 'medium';
  }

  hasAgentAnalysis(c: MaestroCard): boolean {
    return !!(c.agentAnalysis && (c.agentAnalysis.summary || c.agentAnalysis.thinking));
  }

  // --- Edit card ---
  startEdit(card: MaestroCard) {
    this.editCardId = card.id;
    this.editCardText = this.getCardText(card);
  }

  cancelEdit() {
    this.editCardId = null;
    this.editCardText = '';
  }

  async saveEdit(card: MaestroCard) {
    if (!this.editCardText.trim()) return;
    await this.maestroService.addCommand(this.token, 'updateCard', {
      cardId: card.id,
      text: this.editCardText.trim(),
    });
    this.commandResult = 'Card update sent';
    this.editCardId = null;
    this.editCardText = '';
  }

  // --- Add card ---
  async addCard(text: string) {
    if (!text.trim()) return;
    await this.maestroService.addCommand(this.token, 'addCard', {
      text: text.trim(),
      project: this.selectedProjectPath,
    });
    this.commandResult = 'Card added';
  }

  // --- Drag & Drop ---
  onDragStart(cardId: string) {
    this.dragCardId = cardId;
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
  }

  async onDrop(targetColumn: string) {
    if (!this.dragCardId) return;
    const cardId = this.dragCardId;
    this.dragCardId = null;
    await this.maestroService.addCommand(this.token, 'moveCard', {
      cardId: cardId,
      status: targetColumn,
    });
    this.commandResult = 'Card moved';
  }

  // --- Agent commands from dashboard ---
  async startAgent(cardId: string) {
    await this.maestroService.addCommand(this.token, 'startAgent', { cardId });
    this.commandResult = 'Agent start command sent';
  }

  async stopAgent() {
    await this.maestroService.addCommand(this.token, 'stopAgent', {});
    this.commandResult = 'Stop command sent';
  }

  async archiveCard(cardId: string) {
    await this.maestroService.addCommand(this.token, 'archiveCard', { cardId });
    this.commandResult = 'Archive command sent';
  }

  // --- Send raw command ---
  async sendCommand() {
    if (!this.newCommandType.trim()) return;
    this.commandSending = true;
    let params: any = {};
    if (this.newCommandType === 'executeTask' && this.newCommandText.trim()) {
      params = { text: this.newCommandText.trim(), project: this.selectedProjectPath };
    }
    const result = await this.maestroService.addCommand(this.token, this.newCommandType, params);
    this.commandResult = result ? `Sent (id: ${result.id})` : 'Failed to send';
    this.commandSending = false;
  }

  // --- Status ---
  isOnline(): boolean {
    if (!this.lastHeartbeat) return false;
    const diff = Date.now() - new Date(this.lastHeartbeat).getTime();
    return diff < 180000;
  }

  // --- Form helpers ---
  onUsernameChange(event: Event) {
    this.loginUsername = (event.target as HTMLInputElement).value;
  }
  onPasswordChange(event: Event) {
    this.loginPassword = (event.target as HTMLInputElement).value;
  }
  onCommandTypeChange(event: Event) {
    this.newCommandType = (event.target as HTMLSelectElement).value;
  }
  onNewCardTextChange(event: Event) {
    this.newCommandText = (event.target as HTMLInputElement).value;
  }
  onSelectedProjectChange(event: Event) {
    this.selectedProjectPath = (event.target as HTMLSelectElement).value;
  }
  onEditCardTextChange(event: Event) {
    this.editCardText = (event.target as HTMLInputElement).value;
  }
  getSelectedProject(): MaestroProject | undefined {
    return this.projects.find(p => p.path === this.selectedProjectPath);
  }
  // TrackBy for ngFor performance
  trackByCardId(_: number, card: MaestroCard): string {
    return card.id;
  }
} 