import { Component, Input, OnInit } from '@angular/core';
import { BonesService } from '../../services/bones.service';
import { AppComponent } from '../app.component';

@Component({
  selector: 'app-bones-high-scores',
  standalone: false,
  templateUrl: './bones-high-scores.component.html',
  styleUrls: ['./bones-high-scores.component.css']
})
export class BonesHighScoresComponent implements OnInit {
  // Accept only [inputtedParentRef]
  @Input('inputtedParentRef') inputtedParentRef?: AppComponent;
  topHeroes: any[] | undefined;
  loading = false;

  constructor(private bonesService: BonesService) {}

  async ngOnInit() {
  // Nothing to map; use inputtedParentRef directly in template
    // If parent hasn't provided topHeroes, fetch them here
    if (!this.topHeroes || this.topHeroes.length === 0) {
      this.loading = true;
      try {
        this.topHeroes = await this.bonesService.getHeroHighscores(50) ?? [];
      } catch (e) {
        this.topHeroes = [];
      } finally {
        this.loading = false;
      }
    }
  }
}
