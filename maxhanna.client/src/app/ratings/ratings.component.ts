import { Component, Input } from '@angular/core';
import { Rating, RatingsService } from '../../services/ratings.service'; 

@Component({
  selector: 'app-ratings',
  templateUrl: './ratings.component.html',
  styleUrl: './ratings.component.css',
  standalone: false
})
export class RatingsComponent { 
  @Input() file_id?: number;
  @Input() search_id?: number;
    ratings: Rating[] = [];
    rating = 0;
    averageRating = 0;
    isMenuPanelOpen = false;
    userId = 1; // Replace with actual user id logic
  constructor(private ratingsService: RatingsService) {}

  async setRating(star: number) {
    this.rating = star;
    // Replace with actual userId logic
    const userId = 1;
    await this.ratingsService.submitRating(userId, star);
  }

  async ngOnInit() {
    await this.fetchRatings();
    // Find user's rating
    const userRating = this.ratings.find(r => r.user_id === this.userId);
    if (userRating) {
      this.rating = userRating.rating;
      this.averageRating = this.calculateAverage();
    } else {
      this.averageRating = this.calculateAverage();
      this.rating = Math.round(this.averageRating);
    }
  }

  showMenuPanel() {
    this.isMenuPanelOpen = true;
  }

  closeMenuPanel() {
    this.isMenuPanelOpen = false;
    if (!this.ratings.length) return 0;
    const sum = this.ratings.reduce((acc, r) => acc + r.rating, 0);
    return sum / this.ratings.length;
  } 
  async fetchRatings() {
    if (this.file_id) {
      this.ratings = await this.ratingsService.getRatingsByFile(this.file_id);
    } else if (this.search_id) {
      this.ratings = await this.ratingsService.getRatingsBySearch(this.search_id);
    }
  }

  calculateAverage(): number {
    if (!this.ratings.length) return 0;
    const sum = this.ratings.reduce((acc, r) => acc + r.rating, 0);
    return sum / this.ratings.length;
  }
}
