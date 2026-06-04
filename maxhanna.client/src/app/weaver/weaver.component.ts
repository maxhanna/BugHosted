import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { WeaverService, WeaverCard, WeaverProject, KanbanPayload, IdeFileEntry, IdeTab, EditorState } from './weaver.service';
import { AppComponent } from '../app.component';
import { ChildComponent } from '../child.component';

@Component({
  selector: 'app-weaver',
  templateUrl: './weaver.component.html',
  styleUrl: './weaver.component.css',
  standalone: false,
})
export class WeaverComponent extends ChildComponent implements OnInit, OnDestroy {
  loginUsername = '';
  loginPassword = '';
  token = '';
  isLoggedIn = false;
  error = '';
  activeCardId: string | null = null;
  private readonly TOKEN_KEY = 'weaver_token';

  @Input() inputtedParentRef?: AppComponent;

  projects: WeaverProject[] = [];
  selectedProjectPath = '';
  state: { todo: WeaverCard[]; doing: WeaverCard[]; done: WeaverCard[]; archived: WeaverCard[] } = {
    todo: [], doing: [], done: [], archived: [],
  };
  showArchived = false;
  collapsedColumns: { [key: string]: boolean } = { todo: false, doing: false, done: false };

  agentActive = false;
  agentPhase = '';
  agentThinking = '';
  agentSummary = '';
  activeCardText = '';

  lastHeartbeat = '';
  clientId = '';
  nextSyncTime = '';
  lastCommandExecution = '';

  commands: any[] = [];
  cardCommandMap: { [cardId: string]: number } = {};
  dirtyCardText: { [cardId: string]: string } = {};
  deletedCardIds: Set<string> = new Set();
  calendarCards: any[] = [];
  pickerOpen = false;
  pickerCardId: string | null = null;
  pickerSelected: string[] = [];
  pickerTree: any[] = [];
  pickerSearchFilter = '';
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

  // --- IDE state ---
  ideSidebarOpen = false;
  ideSearchFilter = '';
  ideCurrentDir = '';
  ideEntries: IdeFileEntry[] = [];
  ideTabs: IdeTab[] = [];
  ideActiveTabPath: string | null = null;
  ideLoading = false;
  ideError: string | null = null;
  private idePendingListingPath = '';
  private idePendingContentPath = '';
  private ideAutoRequested = false;
  remoteEditorState: EditorState | null = null;

  loading = true;
  searchFilter = '';
  dragCardId: string | null = null;

  isMenuPanelOpen = false;

  voiceSupported = false;
  isRecording = false;
  recordingCardId: string | null = null;
  private speechRecognition: any = null;
  private speechStopFlag = false;

  toggleColumnCollapse(column: string) {
    this.collapsedColumns[column] = !this.collapsedColumns[column];
  }

  private get SpeechRecognitionClass(): any {
    return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  }

  private filterPickerTree(tree: any[], filter: string): any[] {
    if (!filter) return tree;
    const lowerFilter = filter.toLowerCase();
    const filteredTree: any[] = [];

    for (const node of tree) {
      // Check if current node matches filter
      if (node.name.toLowerCase().includes(lowerFilter)) {
        filteredTree.push(node);
        continue;
      }

      // If node has children, recursively filter them
      if (node.children && node.children.length > 0) {
        const filteredChildren = this.filterPickerTree(node.children, filter);
        if (filteredChildren.length > 0) {
          // Create a copy of the node with filtered children
          const newNode = { ...node, children: filteredChildren };
          filteredTree.push(newNode);
        }
      }
    }

    return filteredTree;
  }
  
  private cardHasPendingCommand(cardId: string): boolean {
    return this.commands.some(cmd => {
      const raw = cmd.parameters || cmd.params || '{}';
      try {
        const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return p.cardId === cardId;
      } catch { return false; }
    });
  }

  deleteCardConfirm: { id: string; col: string; show: boolean } | null = null;

  private pollTimer: any;

  constructor(private weaverService: WeaverService) { super(); }

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
      const newToken = await this.weaverService.autoLogin();
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
      const data = await this.weaverService.login(this.loginUsername, this.loginPassword);
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
    this.closeMenuPanel();
    setTimeout(()=> {
      this.token = '';
      this.isLoggedIn = false;
      this.projects = [];
      this.state = { todo: [], doing: [], done: [], archived: [] };
      this.commands = [];
      window.localStorage.removeItem(this.TOKEN_KEY);
    }, 50); 
  }

  async loadData() {
    if (!this.token) return;
    try {
      const hb = await this.weaverService.getHeartbeatStatus(this.token, 0);
      this.lastHeartbeat = hb.lastHeartbeat;
      this.clientId = hb.clientId;
      // Calculate next sync time (10 seconds after last heartbeat)
      if (this.lastHeartbeat) {
        const lastHeartbeatDate = new Date(this.lastHeartbeat);
        const nextSyncDate = new Date(lastHeartbeatDate.getTime() + 10000);
        this.nextSyncTime = nextSyncDate.toLocaleTimeString();
      } else {
        this.nextSyncTime = '';
      }
      // Fetch pending commands BEFORE state merge so cardHasPendingCommand sees fresh data
      this.commands = await this.weaverService.getCommands(this.token);
      if (hb.kanbanData) {
        try {
          const parsed: any = JSON.parse(hb.kanbanData);
          const rawProjects = parsed.projects || parsed.Projects || [];
          const newProjects = rawProjects.map((p: any) => ({
            name: p.name ?? p.Name ?? '',
            path: p.path ?? p.Path ?? '',
            description: p.description ?? p.Description ?? '',
          }));
          // Only reassign if changed to avoid unnecessary <select> re-renders
          if (JSON.stringify(newProjects) !== JSON.stringify(this.projects)) {
            this.projects = newProjects;
          }
          // Preserve selected project path if it's still valid
          if (this.selectedProjectPath && !this.projects.some(p => p.path === this.selectedProjectPath)) {
            this.selectedProjectPath = '';
          }
          const state = parsed.state || parsed.State;
          if (state) {
            // Build flat map of old cards across all columns
            const oldCardMap = new Map<string, { card: any; col: string }>();
            for (const col of ['todo', 'doing', 'done', 'archived']) {
              for (const card of (this.state as any)[col] || []) {
                oldCardMap.set(card.id, { card, col });
              }
            }
            // Build set of card IDs in the new heartbeat state
            const allNewIds = new Set<string>();
            for (const col of ['todo', 'doing', 'done', 'archived']) {
              for (const card of (state[col] || [])) {
                allNewIds.add(card.id);
              }
            }
            const newState: any = { todo: [], doing: [], done: [], archived: [] };
            for (const col of ['todo', 'doing', 'done', 'archived']) {
              const newCards: any[] = (state[col] || []).filter((c: any) => !this.deletedCardIds.has(c.id));
              for (const card of newCards) {
                const old = oldCardMap.get(card.id);
                const dirty = this.dirtyCardText[card.id];
                let mergedCard: any;
                if (dirty !== undefined) {
                  mergedCard = { ...card, ...(old?.card || {}), text: dirty };
                } else if (old && this.cardHasPendingCommand(card.id)) {
                  mergedCard = { ...card, ...old.card };
                } else {
                  mergedCard = card;
                }
                // If card has a pending command and was in a different column, put it in its old column
                if (old && this.cardHasPendingCommand(card.id) && old.col !== col) {
                  newState[old.col].push(mergedCard);
                } else {
                  newState[col].push(mergedCard);
                }
              }
            }
            // Keep old cards with pending commands not yet in the heartbeat
            for (const [id, entry] of oldCardMap) {
              if (!allNewIds.has(id) && !this.deletedCardIds.has(id) && this.cardHasPendingCommand(id)) {
                newState[entry.col].push(entry.card);
              }
            }
            this.state = newState as any;
            // Clear dirtyCardText for cards whose heartbeat text now matches
            for (const cardId in this.dirtyCardText) {
              for (const col of ['todo', 'doing', 'done', 'archived']) {
                const card = (this.state as any)[col].find((c: any) => c.id === cardId);
                if (card && card.text === this.dirtyCardText[cardId]) {
                  delete this.dirtyCardText[cardId];
                  break;
                }
              }
            }
            // Clean up deletedCardIds when the delete command is no longer pending
            const stillDeleted: string[] = [];
            for (const cardId of this.deletedCardIds) {
              const hasPending = this.commands.some(c => {
                if (c.command !== 'deleteCard') return false;
                const raw = c.parameters || c.params || '{}';
                try {
                  const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
                  return p.cardId === cardId;
                } catch { return false; }
              });
              if (hasPending) stillDeleted.push(cardId);
            }
            this.deletedCardIds = new Set(stillDeleted);
          }
          this.agentActive = parsed.agentActive ?? parsed.AgentActive ?? false;
          this.agentPhase = parsed.agentPhase || parsed.AgentPhase || '';
          this.agentThinking = parsed.agentThinking || parsed.AgentThinking || '';
          this.agentSummary = parsed.agentSummary || parsed.AgentSummary || '';
          this.activeCardText = parsed.activeCardText || parsed.ActiveCardText || '';
          this.calendarCards = parsed.calendarCards || parsed.CalendarCards || [];
          // IDE file listing response
          if (parsed.fileListing) {
            const fl = parsed.fileListing;
            if (fl.path === this.idePendingListingPath) {
              this.ideEntries = fl.entries || [];
              this.ideCurrentDir = fl.path;
              this.idePendingListingPath = '';
              this.ideLoading = false;
            }
          }
          // IDE file content response
          if (parsed.fileContent) {
            const fc = parsed.fileContent;
            if (fc.path === this.idePendingContentPath) {
              const tab = this.ideTabs.find(t => t.path === fc.path);
              if (tab) {
                tab.content = fc.content || '';
                tab.originalContent = fc.content || '';
                tab.dirty = false;
                tab.loading = false;
              }
              this.idePendingContentPath = '';
            }
          }
          // Remote editor state (co-editing)
          if (parsed.editorState) {
            try {
              const es = typeof parsed.editorState === 'string' ? JSON.parse(parsed.editorState) : parsed.editorState;
              this.remoteEditorState = es;
            } catch { }
          }
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
      // Clean up cardCommandMap for commands no longer pending
      for (const cardId in this.cardCommandMap) {
        const cmdId = this.cardCommandMap[cardId];
        if (!this.commands.some(c => c.id === cmdId)) {
          delete this.cardCommandMap[cardId];
        }
      }
      this.error = '';
    } catch (e: any) {
      if (this.isLoggedIn) {
        if (e?.message === 'UNAUTHORIZED') {
          // Handle 401 Unauthorized - logout and attempt relogin
          this.doLogout();
          // Attempt to relogin using autoLogin
          const newToken = await this.weaverService.autoLogin();
          if (newToken) {
            this.token = newToken;
            this.isLoggedIn = true;
            window.localStorage.setItem(this.TOKEN_KEY, newToken);
            await this.loadData();
          } else {
            this.error = 'Re-login failed';
          }
        } else {
          this.error = e?.message || 'Lost connection';
        }
      }
    }
  }

  get filteredTodo(): WeaverCard[] {
    return this.filterCards(this.state.todo.filter(c => this.matchesProject(c)));
  }
  get filteredDoing(): WeaverCard[] {
    return this.filterCards(this.state.doing.filter(c => this.matchesProject(c)));
  }
  get filteredDone(): WeaverCard[] {
    return this.filterCards(this.state.done.filter(c => this.matchesProject(c)));
  }
  get filteredArchived(): WeaverCard[] {
    return this.filterCards(this.state.archived.filter(c => this.matchesProject(c)));
  }

  private filterCards(cards: WeaverCard[]): WeaverCard[] {
    if (!this.searchFilter) return cards;
    const f = this.searchFilter.toLowerCase();
    return cards.filter(c => c.id.toLowerCase().includes(f) || this.getCardText(c).toLowerCase().includes(f));
  }

  get ideActiveTab(): IdeTab | null {
    if (!this.ideActiveTabPath) return null;
    return this.ideTabs.find(t => t.path === this.ideActiveTabPath) || null;
  }

  get filteredIdeEntries(): IdeFileEntry[] {
    if (!this.ideSearchFilter) return this.ideEntries;
    const f = this.ideSearchFilter.toLowerCase();
    return this.ideEntries.filter(e => e.name.toLowerCase().includes(f));
  }

  getFileName(path: string): string {
    return path.replace(/\\/g, '/').split('/').filter(Boolean).pop() || path;
  }

  private matchesProject(c: WeaverCard): boolean {
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

  getCardText(c: WeaverCard): string {
    return c.text || c.Text || c.title || '';
  }

  getCardPriority(c: WeaverCard): string {
    return c.priority || 'medium';
  }

  getCardId(c: WeaverCard): string {
    return (c.id || '').slice(0, 6);
  }

  getAttachedFiles(c: WeaverCard): string[] {
    if (Array.isArray(c.attached)) return c.attached;
    if (c.attached) return [c.attached];
    return [];
  }

  hasAgentAnalysis(c: WeaverCard): boolean {
    return !!(c.agentAnalysis && (c.agentAnalysis.summary || c.agentAnalysis.thinking));
  }

  hasAttachments(c: WeaverCard): boolean {
    return this.getAttachedFiles(c).length > 0;
  }

  trackByCardId(_: number, card: WeaverCard): string {
    return card.id;
  }

  // --- Card text saving on blur ---
  async saveCardText(card: WeaverCard) {
    const text = this.getCardText(card);
    const cmdId = this.cardCommandMap[card.id];
    if (cmdId && this.commands.some(c => c.id === cmdId)) {
      await this.weaverService.updateCommandParams(this.token, cmdId, { cardId: card.id, text, project: card.filePath || this.selectedProjectPath });
    } else {
      await this.weaverService.addCommand(this.token, 'changeCardText', { cardId: card.id, text });
    }
  }

  // --- Add card: local + remote ---
  async addCard() {
    const card: WeaverCard = {
      id: Math.random().toString(36).slice(2, 9),
      text: '',
      filePath: this.selectedProjectPath,
      createdAt: new Date().toISOString(),
      priority: 'medium',
      attached: [],
    };
    this.state.todo.push(card);
    this.commandResult = 'Card added locally + command sent';
    const result = await this.weaverService.addCommand(this.token, 'addCard', {
      cardId: card.id,
      text: '',
      project: this.selectedProjectPath,
    });
    if (result?.id) {
      this.cardCommandMap[card.id] = result.id;
    }
  }

  // --- Card actions ---
  async toggleCardReady(card: WeaverCard) {
    card.ready = !card.ready;
    if (card.ready) {
      await this.weaverService.addCommand(this.token, 'startAgent', { cardId: card.id });
      this.commandResult = 'Agent start command sent';
    }
  }

  async togglePr(card: WeaverCard) {
    card.autoPr = !card.autoPr;
    await this.weaverService.addCommand(this.token, 'updateCard', { cardId: card.id, autoPr: card.autoPr });
    this.commandResult = card.autoPr ? 'PR enabled' : 'PR disabled';
  }

  async onMiniCalendarCommand(event: { command: string; params: any }) {
    await this.weaverService.addCommand(this.token, event.command, event.params);
    this.commandResult = 'Calendar ' + event.command + ' sent';
  }

  async moveCard(cardId: string, toCol: string) {
    let fromCol: string | null = null;
    for (const col of ['todo', 'doing', 'done']) {
      if ((this.state as any)[col].find((c: WeaverCard) => c.id === cardId)) { fromCol = col; break; }
    }
    if (!fromCol || fromCol === toCol) return;
    const card = (this.state as any)[fromCol].find((c: WeaverCard) => c.id === cardId);
    if (!card) return;
    const idx = (this.state as any)[fromCol].findIndex((c: WeaverCard) => c.id === cardId);
    (this.state as any)[fromCol].splice(idx, 1);
    (this.state as any)[toCol].push(card);
    await this.weaverService.addCommand(this.token, 'moveCard', { cardId, status: toCol });
    this.commandResult = 'Card moved';
  }

  async archiveCard(cardId: string, col: string) {
    const idx = (this.state as any)[col].findIndex((c: WeaverCard) => c.id === cardId);
    if (idx === -1) return;
    const card = (this.state as any)[col].splice(idx, 1)[0];
    this.state.archived.push(card);
    await this.weaverService.addCommand(this.token, 'archiveCard', { cardId });
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
    await this.weaverService.addCommand(this.token, 'startAgent', { cardId });
    this.commandResult = 'Agent start command sent';
  }

  // --- IDE methods ---
  toggleIdeSidebar() {
    this.ideSidebarOpen = !this.ideSidebarOpen;
    if (this.ideSidebarOpen && !this.ideAutoRequested) {
      this.ideAutoRequested = true;
      this.requestIdeFileListing(this.ideCurrentDir || this.selectedProjectPath);
    } else if (!this.ideSidebarOpen) {
      this.ideError = null;
    }
  }

  requestIdeFileListing(path: string) {
    if (!path) { this.ideError = 'No project selected'; return; }
    this.ideLoading = true;
    this.ideError = null;
    this.idePendingListingPath = path;
    this.weaverService.addCommand(this.token, 'requestFileListing', { path });
  }

  openIdeDir(path: string) {
    this.requestIdeFileListing(path);
  }

  goUpIdeDir() {
    const parts = this.ideCurrentDir.replace(/\\/g, '/').split('/').filter(Boolean);
    parts.pop();
    const parent = parts.join('/') || this.selectedProjectPath;
    if (parent) this.requestIdeFileListing(parent);
  }

  refreshIdeListing() {
    this.requestIdeFileListing(this.ideCurrentDir || this.selectedProjectPath);
  }

  openIdeFile(path: string) {
    if (!path) return;
    const existing = this.ideTabs.findIndex(t => t.path === path);
    if (existing !== -1) {
      this.ideActiveTabPath = path;
      return;
    }
    const tab: IdeTab = { path, content: '', originalContent: '', dirty: false, loading: true };
    this.ideTabs.push(tab);
    this.ideActiveTabPath = path;
    this.idePendingContentPath = path;
    this.weaverService.addCommand(this.token, 'requestFileContent', { path });
  }

  closeIdeTab(index: number) {
    const tab = this.ideTabs[index];
    if (!tab) return;
    if (tab.dirty && !confirm('Close unsaved file?')) return;
    this.ideTabs.splice(index, 1);
    if (this.ideActiveTabPath === tab.path) {
      this.ideActiveTabPath = this.ideTabs.length > 0 ? this.ideTabs[Math.min(index, this.ideTabs.length - 1)].path : null;
    }
  }

  switchIdeTab(path: string) {
    this.ideActiveTabPath = path;
  }

  onIdeTextChange(event: Event) {
    const val = (event.target as HTMLTextAreaElement).value;
    const tab = this.ideActiveTab;
    if (tab) {
      tab.content = val;
      tab.dirty = val !== tab.originalContent;
    }
  }

  async saveIdeFile() {
    const tab = this.ideActiveTab;
    if (!tab || !tab.dirty) return;
    this.ideLoading = true;
    this.ideError = null;
    const ok = await this.weaverService.addCommand(this.token, 'fileEdit', { path: tab.path, content: tab.content });
    if (ok) {
      tab.originalContent = tab.content;
      tab.dirty = false;
      this.commandResult = 'Saved ' + this.getFileName(tab.path);
    } else {
      this.ideError = 'Save failed';
    }
    this.ideLoading = false;
  }

  closeIdeAllTabs() {
    if (this.ideTabs.some(t => t.dirty) && !confirm('Close all tabs? Unsaved changes will be lost.')) return;
    this.ideTabs = [];
    this.ideActiveTabPath = null;
  }

  // --- End IDE methods ---

  async stopAgent() {
    await this.weaverService.addCommand(this.token, 'stopAgent', {});
    this.commandResult = 'Stop command sent';
  }

  copyCardText(card: WeaverCard) {
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
    const idx = (this.state as any)[col].findIndex((c: WeaverCard) => c.id === id);
    if (idx !== -1) (this.state as any)[col].splice(idx, 1);
    this.deleteCardConfirm = null;
    this.deletedCardIds.add(id);
    delete this.cardCommandMap[id];
    delete this.dirtyCardText[id];
    await this.weaverService.addCommand(this.token, 'deleteCard', { cardId: id });
    this.commandResult = 'Card deleted';
  }

  // --- File picker ---
  openFilePicker(card: WeaverCard) {
    this.pickerCardId = card.id;
    this.pickerSelected = this.getAttachedFiles(card).slice();
    this.pickerTree = this.buildFileTree();
    this.pickerOpen = true;
  }

  closeFilePicker() {
    this.pickerOpen = false;
    this.pickerCardId = null;
    this.pickerSelected = [];
    this.pickerTree = [];
  }

  private buildFileTree(): any[] {
    const allFiles = new Set<string>();
    const project = this.selectedProjectPath;
    for (const col of ['todo', 'doing', 'done', 'archived']) {
      const cards: WeaverCard[] = (this.state as any)[col] || [];
      for (const card of cards) {
        if (card.filePath === project || (!project && !card.filePath)) {
          const files = this.getAttachedFiles(card);
          files.forEach(f => allFiles.add(f));
        }
      }
    }
    const tree: any[] = [];
    const root: any = { name: '', children: [] };
    for (const filePath of allFiles) {
      const parts = filePath.replace(/\\/g, '/').split('/').filter(Boolean);
      let node = root;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isFile = i === parts.length - 1;
        let child = node.children.find((c: any) => c.name === part);
        if (!child) {
          child = { name: part, path: isFile ? filePath : null, children: isFile ? undefined : [] };
          node.children.push(child);
        }
        node = child;
      }
    }
    return root.children;
  }

  toggleFileSelect(path: string) {
    const idx = this.pickerSelected.indexOf(path);
    if (idx === -1) {
      this.pickerSelected.push(path);
    } else {
      this.pickerSelected.splice(idx, 1);
    }
  }

  isFileSelected(path: string): boolean {
    return this.pickerSelected.indexOf(path) !== -1;
  }

  async confirmFilePicker() {
    if (!this.pickerCardId) return;
    const card = this.findCardInState(this.pickerCardId);
    if (card) {
      card.attached = this.pickerSelected.slice();
    }
    await this.weaverService.addCommand(this.token, 'updateCard', {
      cardId: this.pickerCardId,
      attached: this.pickerSelected,
    });
    this.commandResult = 'Attachments updated';
    this.closeFilePicker();
  }

  private findCardInState(cardId: string): WeaverCard | null {
    for (const col of ['todo', 'doing', 'done']) {
      const card = (this.state as any)[col].find((c: WeaverCard) => c.id === cardId);
      if (card) return card;
    }
    return null;
  }

  isTreeLeaf(node: any): boolean {
    return !node.children || node.children.length === 0;
  }

  splitCard(card: WeaverCard) {
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
  recordVoice(card: WeaverCard) {
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
    await this.weaverService.cancelCommand(this.token, cmd.id);
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
    const result = await this.weaverService.addCommand(this.token, this.newCommandType, params);
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
    this.closeMenuPanel();
    setTimeout(() => {
      this.editSettings = this.settingsData ? { ...this.settingsData } : {};
      this.settingsPanelOpen = true;
      const parent = this.inputtedParentRef ?? this.parentRef;
      if (parent) { try { (parent as any).showOverlay(); } catch { } }
    }, 50); 
  }

  closeSettingsPanel() {
    this.settingsPanelOpen = false;
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent) { try { (parent as any).closeOverlay(); } catch { } }
  }

  async saveSettingsRemote() {
    this.sendingSettings = true;
    await this.weaverService.addCommand(this.token, 'updateSettings', this.editSettings);
    this.commandResult = 'Settings update command sent';
    this.sendingSettings = false;
    this.closeSettingsPanel();
  }

  async loadSettings() {
    const result = await this.weaverService.getSettings(this.token);
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

  onTextChange(card: WeaverCard, event: Event) {
    const val = (event.target as HTMLTextAreaElement).value;
    card.text = val;
    this.dirtyCardText[card.id] = val;
  }

  onUsernameChange(event: Event) { this.loginUsername = (event.target as HTMLInputElement).value; }
  onPasswordChange(event: Event) { this.loginPassword = (event.target as HTMLInputElement).value; }
  onCommandTypeChange(event: Event) { this.newCommandType = (event.target as HTMLSelectElement).value; }
  onNewCardTextChange(event: Event) { this.newCommandText = (event.target as HTMLInputElement).value; }
  onSelectedProjectChange(event: Event) { this.selectedProjectPath = (event.target as HTMLSelectElement).value; }
  onSearchFilterChange(event: Event) { this.searchFilter = (event.target as HTMLInputElement).value; }

  onPickerSearchFilterChange(event: Event) { 
    this.pickerSearchFilter = (event.target as HTMLInputElement).value;
    // Rebuild tree with filtering
    if (this.pickerOpen && this.pickerTree.length > 0) {
      this.pickerTree = this.filterPickerTree(this.buildFileTree(), this.pickerSearchFilter);
    }
  }

  getSelectedProject(): WeaverProject | undefined {
    return this.projects.find(p => p.path === this.selectedProjectPath);
  }
}
