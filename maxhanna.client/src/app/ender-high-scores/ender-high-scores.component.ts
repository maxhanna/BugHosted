import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { EnderService } from '../../services/ender.service';

type Mode = 'all' | 'user' | 'today' | 'best';

@Component({
  selector: 'app-ender-high-scores',
  templateUrl: './ender-high-scores.component.html',
  styleUrls: ['./ender-high-scores.component.css'],
  standalone: false,
})
export class EnderHighScoresComponent implements OnInit, OnChanges {
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
    try {
      const modes = this.modesSelected;
      let allScores: any[] | undefined = undefined;

      if (modes.includes('all') || modes.includes('today') || modes.includes('best')) {
        const res = await this.enderService.getTopScores(this.limit);
        allScores = Array.isArray(res) ? res : [];
      }

      if (modes.includes('all')) {
        this.groupedByMode.all = { 0: (allScores || []).slice(0, this.limit) };
      }

      if (modes.includes('best')) {
        const top = (allScores || []).slice().sort((a: any, b: any) => (b.score - a.score) || 0).slice(0, 10);
        this.groupedByMode.best = { 999: top };
      }

      if (modes.includes('today')) {
        const today = new Date();
        const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
        const end = start + 24 * 60 * 60 * 1000;
        const todays = (allScores || []).filter(s => {
          if (!s.created_at) return false;
          const t = new Date(s.created_at).getTime();
          return t >= start && t < end;
        });
        this.groupedByMode.today = { 0: todays };
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
