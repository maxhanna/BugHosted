import { Component } from '@angular/core';
import { Input } from '@angular/core';
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
export class MastermindScoresComponent {

  @Input() showBestScores: boolean = true;
  @Input() showBestScoresToday: boolean = true;
  @Input() showHeaderTitles: boolean = true;
  @Input() showUserHeader: boolean = false;
  @Input() parentRef?: AppComponent;

  bestScores: MastermindScore[] = [];
  bestScoresToday: MastermindScore[] = [];

  constructor(private mastermindService: MastermindService) {}

  async ngOnInit() {
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
  }
  openMastermind() {
    this.parentRef?.createComponent("Mastermind");
  }

}
