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
          // The service returns the error message string on failure — surface it
          // instead of silently showing an empty table.
          if (typeof res === 'string' && res.trim()) this.error = res;
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
        // The server stores submitted as DateTime.UtcNow and serializes it without
        // timezone info, so treat it as UTC here. "Today" is the user's LOCAL
        // calendar day (local midnight → next local midnight) — comparing local
        // midnight bounds against UTC-parsed stamps keeps scores from evening
        // sessions from being filtered out (previously they landed "tomorrow").
        const now = new Date();
        const localStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const localEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const startMs = localStart.getTime();
        const endMs = localEnd.getTime();
        const todays = (allScores || []).filter(s => {
          if (!s.submitted) return false;
          const d = this.parseServerDateUtc(s.submitted);
          if (!d) return false;
          const t = d.getTime();
          return t >= startMs && t < endMs;
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
            if (typeof userRes === 'string' && userRes.trim() && !this.error) this.error = userRes;
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
  // Parses a server-returned date. DateTimes from the server are UTC but are
  // serialized without a timezone marker (e.g. "2026-08-07T00:00:00"), so
  // TZ-less ISO strings are interpreted as UTC — matching the timeSince pipe's
  // isUTC=true handling used to render the Date column.
  private parseServerDateUtc(value: Date | string): Date | null {
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (/^0001-01-01/.test(trimmed)) return null; // SQL min date sentinel
    if (/[Zz]|[+\-]\d{2}:\d{2}$/.test(trimmed)) {
      const d = new Date(trimmed);
      return isNaN(d.getTime()) ? null : d;
    }
    const isoNoTz = /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(:\d{2}(\.\d{1,7})?)?$/;
    const d = isoNoTz.test(trimmed) ? new Date(trimmed + 'Z') : new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
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