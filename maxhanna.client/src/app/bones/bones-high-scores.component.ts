import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BonesService } from '../../services/bones.service';

@Component({
  selector: 'app-bones-high-scores',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './bones-high-scores.component.html',
  styleUrls: ['./bones-high-scores.component.css']
})
export class BonesHighScoresComponent implements OnInit {
  @Input() parentRef: any;
  topHeroes: any[] | undefined;
  loading = false;

  constructor(private bonesService: BonesService) {}

  async ngOnInit() {
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
