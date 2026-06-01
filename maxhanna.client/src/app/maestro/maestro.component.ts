import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { MaestroService, MaestroCard, MaestroProject, KanbanPayload } from '../maestro/maestro.service';
import { AppComponent } from '../app.component';
import { ChildComponent } from '../child.component';

@Component({
  selector: 'app-maestro',
  templateUrl: './maestro.component.html',
  styleUrl: './maestro.component.css',
  standalone: false,
})
export class MaestroComponent extends ChildComponent implements OnInit, OnDestroy {
  loginUsername = '';
  loginPassword = '';
  token = '';
  isLoggedIn = false;
  error = '';
  activeCardId: string | null = null;
  private readonly TOKEN_KEY = 'maestro_token';

  @Input() inputtedParentRef?: AppComponent;

  projects: MaestroProject[] = [];
  selectedProjectPath = '';
  state: { todo: MaestroCard[]; doing: MaestroCard[]; done: MaestroCard[]; archived: MaestroCard[] } = {
    todo: [], doing: [], done: [], archived: [],
  };
  showArchived = false;

  agentActive = false;
  agentPhase = '';
  agentThinking = '';
  agentSummary = '';
  activeCardText = '';

  lastHeartbeat = '';
  clientId = '';

  commands: any[] = [];
  cardCommandMap: { [cardId: string]: number } = {};
  selectedCommand: any = null;
  newCommandType = '';
  newCommandText = '';
  commandResult = '';
  commandSending = false;

  settingsData: any = null;
  settingsRaw: string | null = null;
  settingsUpdatedAt = '';
  settingsPanelOpen = false;
  editSettings: any = {};
  sendingSettings = false;

  loading = true;
  searchFilter = '';
  dragCardId: string | null = null;

  isMenuPanelOpen = false;

  voiceSupported = false;
  isRecording = false;
  recordingCardId: string | null = null;
  private speechRecognition: any = null;
  private speechStopFlag = false;

  private get SpeechRecognitionClass(): any {
    return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  }

  deleteCardConfirm: { id: string; col: string; show: boolean } | null = null;

  private pollTimer: any;

  constructor(private maestroService: MaestroService) { super(); }

  async ngOnInit() {
    this.voiceSupported = !!this.SpeechRecognitionClass;
    const saved = window.localStorage.getItem(this.TOKEN_KEY);
    if (saved) {
      this.token = saved;
      this.isLoggedIn = true;
      await this.loadData();
      if (!this.selectedProjectPath && this.projects.length) {
        this.selectedProjectPath = this.projects[0].path;
      }
    } else if (this.parentRef?.user?.id) {
      const newToken = await this.maestroService.autoLogin();
      if (newToken) {
        this.token = newToken;
        this.isLoggedIn = true;
        window.localStorage.setItem(this.TOKEN_KEY, newToken);
        await this.loadData();
        if (!this.selectedProjectPath && this.projects.length) {
          this.selectedProjectPath = this.projects[0].path;
        }
      }
    }
    this.loading = false;
    this.pollTimer = setInterval(async () => {
      if (this.isLoggedIn) await this.loadData();
    }, 10000);
  }

  ngOnDestroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.speechRecognition) {
      try { this.speechRecognition.abort(); } catch { }
    }
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
      if (!this.selectedProjectPath && this.projects.length) {
        this.selectedProjectPath = this.projects[0].path;
      }
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
        } catch { }
      }
      if (hb.settingsData) {
        try {
          this.settingsRaw = hb.settingsData;
          this.settingsData = JSON.parse(hb.settingsData);
          this.settingsUpdatedAt = hb.settingsUpdatedAt || '';
        } catch {
          this.settingsRaw = hb.settingsData;
          this.settingsData = null;
        }
      } else {
        this.settingsData = null;
        this.settingsRaw = null;
        this.settingsUpdatedAt = '';
      }
      this.commands = await this.maestroService.getCommands(this.token);
      // Clean up cardCommandMap for commands no longer pending
      for (const cardId in this.cardCommandMap) {
        const cmdId = this.cardCommandMap[cardId];
        if (!this.commands.some(c => c.id === cmdId)) {
          delete this.cardCommandMap[cardId];
        }
      }
      this.error = '';
    } catch (e: any) {
      if (this.isLoggedIn) this.error = e?.message || 'Lost connection';
    }
  }

  get filteredTodo(): MaestroCard[] {
    return this.filterCards(this.state.todo.filter(c => this.matchesProject(c)));
  }
  get filteredDoing(): MaestroCard[] {
    return this.filterCards(this.state.doing.filter(c => this.matchesProject(c)));
  }
  get filteredDone(): MaestroCard[] {
    return this.filterCards(this.state.done.filter(c => this.matchesProject(c)));
  }
  get filteredArchived(): MaestroCard[] {
    return this.filterCards(this.state.archived.filter(c => this.matchesProject(c)));
  }

  private filterCards(cards: MaestroCard[]): MaestroCard[] {
    if (!this.searchFilter) return cards;
    const f = this.searchFilter.toLowerCase();
    return cards.filter(c => c.id.toLowerCase().includes(f) || this.getCardText(c).toLowerCase().includes(f));
  }

  private matchesProject(c: MaestroCard): boolean {
    if (!this.selectedProjectPath) return true;
    return (c.filePath || c.FilePath || '') === this.selectedProjectPath;
  }

  get selectedProjectName(): string {
    const p = this.projects.find(x => x.path === this.selectedProjectPath);
    return p?.name || this.selectedProjectPath || 'All Projects';
  }

  get archivedCount(): number {
    return this.filteredArchived.length;
  }

  getCardText(c: MaestroCard): string {
    return c.text || c.Text || c.title || '';
  }

  getCardPriority(c: MaestroCard): string {
    return c.priority || 'medium';
  }

  getCardId(c: MaestroCard): string {
    return (c.id || '').slice(0, 6);
  }

  getAttachedFiles(c: MaestroCard): string[] {
    if (Array.isArray(c.attached)) return c.attached;
    if (c.attached) return [c.attached];
    return [];
  }

  hasAgentAnalysis(c: MaestroCard): boolean {
    return !!(c.agentAnalysis && (c.agentAnalysis.summary || c.agentAnalysis.thinking));
  }

  hasAttachments(c: MaestroCard): boolean {
    return this.getAttachedFiles(c).length > 0;
  }

  trackByCardId(_: number, card: MaestroCard): string {
    return card.id;
  }

  // --- Card text saving on blur ---
  async saveCardText(card: MaestroCard) {
    const text = this.getCardText(card);
    const cmdId = this.cardCommandMap[card.id];
    if (cmdId && this.commands.some(c => c.id === cmdId)) {
      await this.maestroService.updateCommandParams(this.token, cmdId, { cardId: card.id, text, project: card.filePath || this.selectedProjectPath });
    } else {
      await this.maestroService.addCommand(this.token, 'changeCardText', { cardId: card.id, text });
    }
  }

  // --- Add card: local + remote ---
  async addCard() {
    const card: MaestroCard = {
      id: Math.random().toString(36).slice(2, 9),
      text: '',
      filePath: this.selectedProjectPath,
      createdAt: new Date().toISOString(),
      priority: 'medium',
      attached: [],
    };
    this.state.todo.push(card);
    this.commandResult = 'Card added locally + command sent';
    const result = await this.maestroService.addCommand(this.token, 'addCard', {
      cardId: card.id,
      text: '',
      project: this.selectedProjectPath,
    });
    if (result?.id) {
      this.cardCommandMap[card.id] = result.id;
    }
  }

  // --- Card actions ---
  async toggleCardReady(card: MaestroCard) {
    card.ready = !card.ready;
    if (card.ready) {
      await this.maestroService.addCommand(this.token, 'startAgent', { cardId: card.id });
      this.commandResult = 'Agent start command sent';
    }
  }

  async moveCard(cardId: string, toCol: string) {
    let fromCol: string | null = null;
    for (const col of ['todo', 'doing', 'done']) {
      if ((this.state as any)[col].find((c: MaestroCard) => c.id === cardId)) { fromCol = col; break; }
    }
    if (!fromCol || fromCol === toCol) return;
    const card = (this.state as any)[fromCol].find((c: MaestroCard) => c.id === cardId);
    if (!card) return;
    const idx = (this.state as any)[fromCol].findIndex((c: MaestroCard) => c.id === cardId);
    (this.state as any)[fromCol].splice(idx, 1);
    (this.state as any)[toCol].push(card);
    await this.maestroService.addCommand(this.token, 'moveCard', { cardId, status: toCol });
    this.commandResult = 'Card moved';
  }

  async archiveCard(cardId: string, col: string) {
    const idx = (this.state as any)[col].findIndex((c: MaestroCard) => c.id === cardId);
    if (idx === -1) return;
    const card = (this.state as any)[col].splice(idx, 1)[0];
    this.state.archived.push(card);
    await this.maestroService.addCommand(this.token, 'archiveCard', { cardId });
    this.commandResult = 'Card archived';
  }

  async unarchiveCard(cardId: string) {
    const idx = this.state.archived.findIndex(c => c.id === cardId);
    if (idx === -1) return;
    const card = this.state.archived.splice(idx, 1)[0];
    this.state.todo.push(card);
    this.commandResult = 'Card unarchived';
  }

  async startAgent(cardId: string) {
    await this.maestroService.addCommand(this.token, 'startAgent', { cardId });
    this.commandResult = 'Agent start command sent';
  }

  async stopAgent() {
    await this.maestroService.addCommand(this.token, 'stopAgent', {});
    this.commandResult = 'Stop command sent';
  }

  copyCardText(card: MaestroCard) {
    const text = this.getCardText(card);
    if (!text) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    this.commandResult = 'Card text copied';
  }

  openDeleteCardConfirm(id: string, col: string) {
    this.deleteCardConfirm = { id, col, show: true };
  }

  closeDeleteCardConfirm() {
    this.deleteCardConfirm = null;
  }

  async confirmDeleteCard() {
    if (!this.deleteCardConfirm) return;
    const { id, col } = this.deleteCardConfirm;
    const idx = (this.state as any)[col].findIndex((c: MaestroCard) => c.id === id);
    if (idx !== -1) (this.state as any)[col].splice(idx, 1);
    this.deleteCardConfirm = null;
    this.commandResult = 'Card deleted locally';
  }

  splitCard(card: MaestroCard) {
    const text = this.getCardText(card);
    if (!text) return;
    const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
    if (lines.length <= 1) {
      const parts = text.split(/[.;]\s+/).filter(p => p.length > 10);
      if (parts.length <= 1) { this.commandResult = 'Task is already small'; return; }
      lines.splice(0, lines.length, ...parts);
    }
    const idx = this.state.todo.findIndex(c => c.id === card.id);
    if (idx !== -1) this.state.todo.splice(idx, 1);
    for (const line of lines) {
      this.state.todo.push({
        id: Math.random().toString(36).slice(2, 9),
        text: line.charAt(0).toUpperCase() + line.slice(1),
        filePath: card.filePath || this.selectedProjectPath,
        createdAt: new Date().toISOString(),
        priority: card.priority || 'medium',
        attached: [],
      });
    }
    this.commandResult = 'Card split into ' + lines.length + ' tasks';
  }

  // --- Voice input ---
  recordVoice(card: MaestroCard) {
    if (this.isRecording) {
      this.stopRecording();
      return;
    }
    if (!this.voiceSupported) return;
    this.isRecording = true;
    this.recordingCardId = card.id;
    this.speechStopFlag = false;

    const SR = this.SpeechRecognitionClass;
    this.speechRecognition = new SR();
    this.speechRecognition.continuous = true;
    this.speechRecognition.interimResults = false;

    this.speechRecognition.onresult = (e: any) => {
      if (this.speechStopFlag) return;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          const transcript = e.results[i][0].transcript;
          card.text = (card.text || '') + (card.text ? ' ' : '') + transcript;
        }
      }
    };

    this.speechRecognition.onerror = () => { this.stopRecording(); };
    this.speechRecognition.onend = () => {
      if (!this.speechStopFlag) {
        try { this.speechRecognition?.start(); } catch { }
      }
    };
    this.speechRecognition.start();
  }

  stopRecording() {
    this.speechStopFlag = true;
    if (this.speechRecognition) {
      try { this.speechRecognition.stop(); } catch { }
    }
    this.isRecording = false;
    this.recordingCardId = null;
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
    await this.moveCard(cardId, targetColumn);
  }

  // --- Commands ---
  selectCommand(cmd: any) {
    this.selectedCommand = this.selectedCommand?.id === cmd.id ? null : cmd;
  }

  async cancelCommand(cmd: any) {
    await this.maestroService.cancelCommand(this.token, cmd.id);
    this.commands = this.commands.filter(c => c.id !== cmd.id);
    if (this.selectedCommand?.id === cmd.id) this.selectedCommand = null;
    this.commandResult = 'Command cancelled';
  }

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

  isOnline(): boolean {
    if (!this.lastHeartbeat) return false;
    return Date.now() - new Date(this.lastHeartbeat).getTime() < 180000;
  }

  // --- Menu panel ---
  showMenuPanel() {
    if (this.isMenuPanelOpen) { this.closeMenuPanel(); return; }
    this.isMenuPanelOpen = true;
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent) { try { (parent as any).showOverlay(); } catch { } }
  }

  closeMenuPanel() {
    this.isMenuPanelOpen = false;
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent) { try { (parent as any).closeOverlay(); } catch { } }
  }

  // --- Settings panel ---
  openSettingsPanel() {
    this.editSettings = this.settingsData ? { ...this.settingsData } : {};
    this.settingsPanelOpen = true;
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent) { try { (parent as any).showOverlay(); } catch { } }
  }

  closeSettingsPanel() {
    this.settingsPanelOpen = false;
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent) { try { (parent as any).closeOverlay(); } catch { } }
  }

  async saveSettingsRemote() {
    this.sendingSettings = true;
    await this.maestroService.addCommand(this.token, 'updateSettings', this.editSettings);
    this.commandResult = 'Settings update command sent';
    this.sendingSettings = false;
    this.closeSettingsPanel();
  }

  async loadSettings() {
    const result = await this.maestroService.getSettings(this.token);
    if (result?.settingsData) {
      try {
        this.settingsData = JSON.parse(result.settingsData);
        this.settingsRaw = result.settingsData;
        this.settingsUpdatedAt = result.updatedAt || '';
      } catch { }
    }
  }

  onSettingsFieldChange(field: string, event: Event) {
    this.editSettings[field] = (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  onSettingsCheckboxChange(field: string, event: Event) {
    this.editSettings[field] = (event.target as HTMLInputElement).checked;
  }

  onTextChange(card: MaestroCard, event: Event) {
    card.text = (event.target as HTMLTextAreaElement).value;
  }

  onUsernameChange(event: Event) { this.loginUsername = (event.target as HTMLInputElement).value; }
  onPasswordChange(event: Event) { this.loginPassword = (event.target as HTMLInputElement).value; }
  onCommandTypeChange(event: Event) { this.newCommandType = (event.target as HTMLSelectElement).value; }
  onNewCardTextChange(event: Event) { this.newCommandText = (event.target as HTMLInputElement).value; }
  onSelectedProjectChange(event: Event) { this.selectedProjectPath = (event.target as HTMLSelectElement).value; }
  onSearchFilterChange(event: Event) { this.searchFilter = (event.target as HTMLInputElement).value; }

  getSelectedProject(): MaestroProject | undefined {
    return this.projects.find(p => p.path === this.selectedProjectPath);
  }
}
