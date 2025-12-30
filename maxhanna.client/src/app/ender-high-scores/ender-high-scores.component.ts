import { Component, Input, OnInit, OnChanges, SimpleChanges, Output, EventEmitter } from '@angular/core';
import { EnderService } from '../../services/ender.service';

type Mode = 'all' | 'user' | 'today' | 'best';

@Component({
  selector: 'app-ender-high-scores',
  templateUrl: './ender-high-scores.component.html',
  styleUrl: './ender-high-scores.component.css',
  standalone: false,
})
export class EnderHighScoresComponent implements OnInit, OnChanges {
  @Output() hasData = new EventEmitter<boolean>();
  @Input() limit: number = 20;
  @Input() showBestScoresToday: boolean = false;
  @Input() parentRef: any;
  // header controls to match Wordler-style behavior
  @Input() showHeader: boolean = true;
  @Input() showUserHeader: boolean = false;
  @Input() showHeaderTitles: boolean = true;
  @Input() headerClickable: boolean = false;
  @Input() headerClickTarget?: string | null = null;
  @Input() inputtedParentRef?: any;
  @Input() headersCollapsed: boolean = false;
  @Input() mode: Mode | Mode[] = 'all';

  topScores: any[] = [];

  // grouped by difficulty-equivalent (for Ender we'll group by hero_id as a pseudo-group or use a single group for now)
  groupedByMode: Record<Mode, Record<number, any[]>> = {
    all: {},
    user: {},
    today: {},
    best: {}
  };

  // UI state for collapsing
  collapsedModes: Record<string, boolean> = {};

  constructor(private enderService: EnderService) { }

  async ngOnInit() {
    // start with all modes collapsed by default
    const allModes: Mode[] = ['all', 'user', 'today', 'best'];
    for (const m of allModes) { this.collapsedModes[m] = true; }

    this.applyHeadersCollapsed();
    await this.refresh();
    if (this.headersCollapsed) {
      for (const m of this.modesSelected) { this.collapsedModes[m] = true; }
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['headersCollapsed']) {
      this.applyHeadersCollapsed();
    }
  }

  async loadTopScores() {
    try {
      // enderService.getTopScores may return Observable or Promise depending on version;
      const maybe = this.enderService.getTopScores(this.limit) as any;
      const res = maybe.subscribe ? await new Promise((resR, rej) => maybe.subscribe((v: any) => resR(v), (err: any) => rej(err))) : await maybe;
      let scores = res ?? [];
      if (this.showBestScoresToday) {
        const today = new Date();
        const isoToday = today.toISOString().slice(0, 10);
        scores = scores.filter((s: any) => (s.created_at || '').slice(0, 10) === isoToday);
      }
      this.topScores = scores;
    } catch (err) {
      console.error('Failed to load ender top scores', err);
      this.topScores = [];
    }
  }

  async refresh() {
    this.topScores = [];
    // clear any previous grouped results so only requested modes are shown
    this.groupedByMode = {
      all: {},
      user: {},
      today: {},
      best: {}
    };
    try {
      const modes = this.modesSelected;
      let allScores: any[] | undefined = undefined;

      // Prefer server-side today endpoint when only 'today' is requested to avoid fetching all scores
      if (modes.includes('all') || modes.includes('best') || (modes.includes('today') && modes.length > 1)) {
        const res = await this.enderService.getTopScores(this.limit);
        allScores = Array.isArray(res) ? res : [];
      } else if (modes.includes('today')) {
        const res = await this.enderService.getTopScoresToday(this.limit);
        allScores = Array.isArray(res) ? res : [];
      }

      if (modes.includes('all')) {
        this.groupedByMode.all = { 0: (allScores || []).slice(0, this.limit) };
      }

      if (modes.includes('best')) {
        const top = (allScores || []).slice().sort((a: any, b: any) => (b.score - a.score) || 0).slice(0, 10);
        this.groupedByMode.best = { 999: top };
      }

      // For 'today' prefer the server endpoint to avoid timezone/formatting mismatches
      if (modes.includes('today')) {
        try {
          const resToday = await this.enderService.getTopScoresToday(this.limit);
          const todaysArr = Array.isArray(resToday) ? resToday : [];
          this.groupedByMode.today = { 0: todaysArr };
        } catch (errToday) {
          // Fallback to filtering allScores if the dedicated endpoint fails
          const today = new Date();
          const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
          const end = start + 24 * 60 * 60 * 1000;
          const todays = (allScores || []).filter(s => {
            if (!s?.created_at) return false;
            const t = new Date(s.created_at).getTime();
            return t >= start && t < end;
          });
          this.groupedByMode.today = { 0: todays };
        }
      }

      if (modes.includes('user')) {
        if (!this.parentRef?.user?.id) {
          this.groupedByMode.user = {};
        } else {
          const resUser = await this.enderService.getTopScoresForUser(this.parentRef.user.id);
          const arr = Array.isArray(resUser) ? resUser : [];
          this.groupedByMode.user = { 0: arr };
        }
      }

    } catch (e) {
      console.error('ender-high-scores.refresh failed', e);
    }
    // emit whether any scores were loaded
    try {
      const any = Object.values(this.groupedByMode || {}).some(g => Object.keys(g || {}).length > 0);
      this.hasData.emit(any);
    } catch {}
  }

  toggleMode(mode: string) {
    if (this.showUserHeader) return;
    this.collapsedModes[mode] = !this.collapsedModes[mode];
  }

  isModeCollapsed(mode: string) {
    if (this.showUserHeader) return false;
    return !!this.collapsedModes[mode];
  }

  private applyHeadersCollapsed() {
    if (this.headersCollapsed) {
      this.collapsedModes['scores'] = true;
    }
  }

  // helper used from the template to avoid referencing global Object in template
  hasGroups(mode: Mode | string): boolean {
    const g = this.groupedByMode[mode as Mode];
    if (!g) return false;
    return Object.keys(g).length > 0;
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
}
