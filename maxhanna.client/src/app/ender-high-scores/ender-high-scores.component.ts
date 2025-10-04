import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { EnderService } from '../../services/ender.service';

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

  topScores: any[] = [];

  // UI state for collapsing
  collapsedModes: Record<string, boolean> = {};

  constructor(private enderService: EnderService) { }

  async ngOnInit() {
    this.applyHeadersCollapsed();
    await this.loadTopScores();
    if (this.headersCollapsed) this.collapsedModes['scores'] = true;
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
}
