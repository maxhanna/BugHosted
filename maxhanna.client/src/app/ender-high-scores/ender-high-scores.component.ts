import { Component, Input, OnInit } from '@angular/core';
import { EnderService } from '../../services/ender.service';

@Component({
  selector: 'app-ender-high-scores',
  templateUrl: './ender-high-scores.component.html',
  styleUrls: ['./ender-high-scores.component.css'],
  standalone: false,
})
export class EnderHighScoresComponent implements OnInit {
  @Input() limit: number = 20;
  @Input() showBestScoresToday: boolean = false;
  @Input() parentRef: any;
  // header controls to match Mastermind header style/behavior
  @Input() showUserHeader: boolean = false;
  @Input() showHeaderTitles: boolean = true;
  @Input() headerClickable: boolean = false;
  @Input() headerClickTarget?: string | null = null;

  topScores: any[] = [];

  constructor(private enderService: EnderService) { }

  async ngOnInit() {
    await this.loadTopScores();
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
}
