import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { WordlerService } from '../../services/wordler.service';
import { WordlerScore } from '../../services/datacontracts/wordler/wordler-score';
type Mode = 'all' | 'user' | 'today' | 'best';
@Component({
  selector: 'app-wordler-high-scores',
  templateUrl: './wordler-high-scores.component.html',
  styleUrl: './wordler-high-scores.component.css',
  standalone: false,
})
export class WordlerHighScoresComponent implements OnInit, OnChanges {
  @Output() hasData = new EventEmitter<boolean>();
  keys(obj?: Record<string, any>): string[] {
    return Object.keys(obj || {});
  }
  @Input() userId?: number;
  @Input() mode: Mode | Mode[] = 'all';
  @Input() showHeader: boolean = true;
  @Input() headerTitle: string | null = null; 
  @Input() headerClickable: boolean = false; 
  @Input() headerClickTarget: string | null = null; 
  @Output() headerClick = new EventEmitter<string | null>();
  @Input() showUserHeader: boolean = false;
  @Input() showHeaderTitles: boolean = true;
  @Input() headersCollapsed: boolean = false;
  @Input() inputtedParentRef?: any;
  @Input() displayWordlerInHeader? = true;
  scores: WordlerScore[] = [];
  loading = false;
  error?: string;
  noScoresLoaded = true;
  grouped: Record<number, WordlerScore[]> = {};
  groupedByMode: Record<Mode, Record<number, WordlerScore[]>> = {
    all: {},
    user: {},
    today: {},
    best: {}
  };
  constructor(private wordlerService: WordlerService) { }
  collapsedModes: Record<string, boolean> = {};
  collapsedGroups: Record<string, boolean> = {};
  toggleMode(mode: Mode) {
    if (this.showUserHeader) return; 
    this.collapsedModes[mode] = !this.collapsedModes[mode];
  }
  isModeCollapsed(mode: Mode) {
    if (this.showUserHeader) return false; 
    return !!this.collapsedModes[mode];
  }
  toggleGroup(mode: Mode, groupKey: string) {
    const k = `${mode}-${groupKey}`;
    this.collapsedGroups[k] = !this.collapsedGroups[k];
  }
  isGroupCollapsed(mode: Mode, groupKey: string) {
    return !!this.collapsedGroups[`${mode}-${groupKey}`];
  }
  ngOnInit(): void {
    this.applyHeadersCollapsed();
    this.refresh();
  }
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['userId'] || changes['mode']) {
      this.refresh();
    }
    if (changes['headersCollapsed'] || changes['mode']) {
      this.applyHeadersCollapsed();
    }
  }
  async refresh() {
    this.loading = true;
    this.error = undefined;
    try {
      const modes = this.modesSelected;
      const includeUserMode = modes.includes('user') && !(modes.length === 1 && modes[0] === 'today');
      let allScores: WordlerScore[] | undefined = undefined;
      if (modes.includes('all') || modes.includes('today')) {
        const res = await this.wordlerService.getAllScores();
        if (Array.isArray(res)) {
          allScores = res as WordlerScore[];
        } else {
          allScores = [];
        }
      }
      if (modes.includes('all')) {
        this.groupedByMode.all = this.groupScores(allScores || []);
      }
      if (modes.includes('best') || modes.includes('all')) {
        const topAcrossAll = (allScores || []).slice().sort((a, b) => (b.score - a.score) || (a.time - b.time)).slice(0, 10);
        this.groupedByMode.best = { 999: topAcrossAll };
      }
      if (modes.includes('today')) {
        const now = new Date();
        const utcStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
        const utcEnd = utcStart + 24 * 60 * 60 * 1000;
        const todays = (allScores || []).filter(s => {
          if (!s.submitted) return false;
          const t = new Date(s.submitted).getTime();
          return t >= utcStart && t < utcEnd;
        });
        this.groupedByMode.today = this.groupScores(todays);
      }
      if (includeUserMode) {
        if (!this.userId) {
          this.groupedByMode.user = {};
        } else {
          const userRes = await this.wordlerService.getAllScores(this.userId);
          if (Array.isArray(userRes)) {
            const userScores = userRes as WordlerScore[];
            this.groupedByMode.user = this.groupScores(userScores || []);
          } else {
            this.groupedByMode.user = {};
          }
        }
      }
    } catch (e: any) {
      this.error = e?.message ?? String(e);
    } finally {
      this.loading = false;
      if (this.headersCollapsed) {
        for (const m of this.modesSelected) {
          this.collapsedModes[m] = true;
          const groups = this.groupedByMode[m] || {};
          for (const g of Object.keys(groups)) {
            this.collapsedGroups[`${m}-${g}`] = true;
          }
        }
      }
      try {
        const any = Object.values(this.groupedByMode || {}).some(m => Object.keys(m || {}).length > 0);
        this.hasData.emit(any);
        this.noScoresLoaded = !any;
      } catch { }
    }
  }
  private applyHeadersCollapsed() {
    if (this.headersCollapsed) {
      for (const m of this.modesSelected) {
        this.collapsedModes[m] = true;
      }
    }
  }
  private groupScores(scores: WordlerScore[]) {
    const out: Record<number, WordlerScore[]> = {};
    (scores || []).forEach(s => {
      const d = s.difficulty ?? 0;
      if (!out[d]) out[d] = [];
      out[d].push(s);
    });
    Object.keys(out).forEach(k => {
      out[+k] = out[+k].sort((a, b) => (b.score - a.score) || (a.time - b.time)).slice(0, 10);
    });
    return out;
  }
  difficultyLabel(d: number) {
    switch (d) {
      case 4: return 'Easy';
      case 5: return 'Medium';
      case 6: return 'Hard';
      case 7: return 'Master';
      default: return `Difficulty ${d}`;
    }
  }
  keepOrder = (a: { key: string, value: any }, b: { key: string, value: any }) => {
    return parseInt(b.key) - parseInt(a.key);
  }
  get modesSelected(): Mode[] {
    const requested = Array.isArray(this.mode) ? this.mode.slice() : [this.mode];
    const expanded: Mode[] = [];
    for (const m of requested) {
      if (m === 'all' || m === 'best') {
        expanded.push('all', 'today', 'user');
      } else {
        expanded.push(m);
      }
    }
    return Array.from(new Set(expanded));
  }
  openWordler() {
    const pr = this.inputtedParentRef;
    pr?.createComponent('Wordler');
  }
}