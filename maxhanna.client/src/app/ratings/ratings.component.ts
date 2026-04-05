import { Component, Input } from '@angular/core';
import { AppComponent } from '../app.component';
import { Rating, RatingsService } from '../../services/ratings.service'; 
import { User } from '../../services/datacontracts/user/user';

@Component({
  selector: 'app-ratings',
  templateUrl: './ratings.component.html',
  styleUrl: './ratings.component.css',
  standalone: false
})

export class RatingsComponent {
  @Input() file_id?: number;
  @Input() search_id?: number;
  @Input() inputtedParentRef?: AppComponent;
  ratings: Rating[] = [];
  rating = 0;
  averageRating = 0;
  isMenuPanelOpen = false;
  constructor(private ratingsService: RatingsService) {}


  async ngOnInit() {
    await this.fetchRatings();
    // Find user's rating
    const user = this.inputtedParentRef?.user;
    let userRating;
    if (user) {
      userRating = this.ratings.find(r => r.user && r.user.id === user.id);
    }
    if (userRating) {
      this.rating = userRating.rating;
      this.averageRating = this.calculateAverage();
    } else {
      this.averageRating = this.calculateAverage();
      this.rating = Math.round(this.averageRating);
    }
  }
  
  async setRating(star: number) {
    this.rating = star;
    let user = this.inputtedParentRef?.user;
    // If no user, create anonymous user object
    if (!user) {
      user = { id: 0, username: 'Anonymous' } as User;
    }
    await this.ratingsService.submitRating(user, star);
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
      this.ratings = await this.ratingsService.getRatingsByFile(this.file_id) ?? [];
    } else if (this.search_id) {
      this.ratings = await this.ratingsService.getRatingsBySearch(this.search_id) ?? [];
    }
  }

  calculateAverage(): number {
    if (!this.ratings.length) return 0;
    const sum = this.ratings.reduce((acc, r) => acc + r.rating, 0);
    return sum / this.ratings.length;
  }
}
