import { Component, Input, Output, EventEmitter } from '@angular/core';
import { User } from '../../services/datacontracts/user/user';
import { Rating, RatingsService } from '../../services/ratings.service';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { MetaData } from '../../services/datacontracts/social/story';

@Component({
  selector: 'app-rating-stars',
  templateUrl: './rating-stars.component.html',
  styleUrls: ['./rating-stars.component.css'],
  standalone: false,
})
export class RatingStarsComponent {
  constructor(private ratingsService: RatingsService) { }
  @Input() rating!: Rating;
  @Input() inputtedParentRef: any;
  @Input() readOnly = false;
  @Input() ratingFile?: FileEntry | MetaData;
  @Output() rated = new EventEmitter<number>();

  stars = [1, 2, 3, 4, 5];
  hoveredIndex: number | null = null;
  isRatingsPanelOpen = false;

  get isCurrentUser() {
    return this.currentUser.id === this.rating?.user?.id;
  }

  get currentUser() {
    return this.inputtedParentRef?.user ?? new User(0, "Anonymous");
  }

  get ratingsTitle(): string {
    return this.ratingFile instanceof FileEntry 
      ? (this.ratingFile.givenFileName ?? this.ratingFile.fileName ?? "")
      : this.ratingFile instanceof MetaData 
        ? this.ratingFile.title ?? "" 
        : "";
  }

  onRate(star: number) {
    console.log('onRate called with star:', star, 'current rating:', this.rating);
    if (!this.readOnly && this.isCurrentUser) {
      this.rated.emit(star);
    }
  }

  onStarMouseEnter(index: number) {
    if (!this.readOnly && this.isCurrentUser) {
      this.hoveredIndex = index;
    }
  }

  onStarMouseLeave() {
    this.hoveredIndex = null;
  }
  /**
     * Opens the ratings panel for a given file and fetches ratings.
     * @param file The file entry to show ratings for.
     */
  async openRatingsPanel(file?: FileEntry | MetaData): Promise<void> {
    if (!file) return;
    this.ratingFile = file;
    this.isRatingsPanelOpen = true;
    const parent = this.inputtedParentRef;
    if (parent) {
      parent.showOverlay();
    }
    if (file && file.id && !file.ratings) {
      try {
        const ratings = await this.ratingsService.getRatingsByFile(file.id) as Rating[] | undefined;
        this.ratingFile.ratings = Array.isArray(ratings) ? ratings : [];
      } catch (e) {
        if (parent) {
          parent.showNotification('Failed to fetch ratings.');
        }
      }
    }
  }

  closeRatingsPanel(): void {
    this.isRatingsPanelOpen = false;
    //this.ratingFile = undefined;
    const parent = this.inputtedParentRef;
    if (parent) {
      parent.closeOverlay();
    }
  }
}
