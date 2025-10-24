import { Component } from '@angular/core';
import { Input, OnInit, OnChanges, SimpleChanges, Output, EventEmitter } from '@angular/core';
import { MastermindService } from '../../services/mastermind.service';
import { MastermindScore } from '../../services/datacontracts/mastermind/mastermind-score';
import { UserService } from '../../services/user.service';
import { AppComponent } from '../app.component';

@Component({
  selector: 'app-mastermind-scores',
  standalone: false,
  templateUrl: './mastermind-scores.component.html',
  styleUrl: './mastermind-scores.component.css'
})
export class MastermindScoresComponent implements OnInit, OnChanges {

  @Output() hasData = new EventEmitter<boolean>();

  @Input() showBestScores: boolean = true;
  @Input() showBestScoresToday: boolean = true;
  @Input() showHeaderTitles: boolean = true;
  @Input() showUserHeader: boolean = false;
  @Input() showHeader: boolean = true;
  @Input() headerClickable: boolean = false;
  @Input() headerClickTarget?: string | null = null;
  @Input() parentRef?: AppComponent;
  @Input() inputtedParentRef?: any;
  @Input() headersCollapsed: boolean = false;

  bestScores: MastermindScore[] = [];
  bestScoresToday: MastermindScore[] = [];

  collapsedModes: Record<string, boolean> = {};

  constructor(private mastermindService: MastermindService) {}

  async ngOnInit() {
    this.applyHeadersCollapsed();
    if (this.showBestScores) {
      try {
        this.bestScores = await this.mastermindService.getBestScores(10);
      } catch {
        this.bestScores = [];
      }
    }
    if (this.showBestScoresToday) {
      try {
        this.bestScoresToday = await this.mastermindService.getBestScoresToday(20);
      } catch {
        this.bestScoresToday = [];
      }
    }
    // emit whether we have any data
    try {
      const has = (this.bestScores?.length ?? 0) > 0 || (this.bestScoresToday?.length ?? 0) > 0;
      this.hasData.emit(has);
    } catch {}
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['headersCollapsed']) this.applyHeadersCollapsed();
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
      if (this.showBestScores) this.collapsedModes['best'] = true;
      if (this.showBestScoresToday) this.collapsedModes['today'] = true;
    }
  }

  openMastermind() {
    this.parentRef?.createComponent("Mastermind");
  }

}
