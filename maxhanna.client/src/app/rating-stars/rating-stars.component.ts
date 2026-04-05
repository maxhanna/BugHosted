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
  @Input() showRatingValueOnly = false;
  @Input() componentType: 'file' | 'search' = 'file';
  @Output() rated = new EventEmitter<number>();
  @Output() panelOpened = new EventEmitter<void>();

  stars = [1, 2, 3, 4, 5];
  hoveredIndex: number | null = null;
  isRatingsPanelOpen = false;
  tmpRatingFile?: FileEntry | MetaData | undefined;

  get isCurrentUser() {
    return this.currentUser.id === this.rating?.user?.id;
  }

  get currentUser() {
    return this.inputtedParentRef?.user ?? new User(0, "Anonymous");
  }

  get ratingsTitle(): string {
    if (!this.ratingFile) return "";
    return this.componentType === 'file'
      ? ((this.ratingFile as FileEntry).givenFileName ?? (this.ratingFile as FileEntry).fileName ?? "")
      : (this.ratingFile as MetaData).title ?? (this.ratingFile as MetaData).url ?? "";
  }

  isUserRating(r: Rating): boolean {
    return r.user?.id === this.currentUser.id;
  }
  
  onRate(star: number) {
    console.log('onRate called with star:', star, 'current rating:', this.rating);
    if (!this.readOnly && this.ratingFile && this.isCurrentUser) {
      this.rateFile(star);
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

  async openRatingsPanel(): Promise<void> {
    this.tmpRatingFile = this.ratingFile;
    console.log('openRatingsPanel called with current ratingFile:', this.ratingFile, 'isRatingsPanelOpen:', this.isRatingsPanelOpen);
    if (!this.ratingFile || this.isRatingsPanelOpen) {
      console.warn('No file provided or ratings panel already open, not opening a new panel.');
      return;
    }
    if (!this.inputtedParentRef) {
      console.error('No parent reference provided for RatingStarsComponent');
      return;
    }
    this.panelOpened.emit();

    setTimeout(async () => { 
      const file = this.tmpRatingFile;
      const fileId = file?.id ?? 0;
      this.inputtedParentRef?.showOverlay();
      this.isRatingsPanelOpen = true;
      if (fileId && file && (!file.ratings || (file.ratings && file.ratings.length === 0))) {
        try {
          const ratings = this.componentType === 'file'
            ? await this.ratingsService.getRatingsByFile(fileId) as Rating[] | undefined
            : await this.ratingsService.getRatingsBySearch(fileId) as Rating[] | undefined; 
          file.ratings = Array.isArray(ratings) ? ratings : []; 
        } catch (e) {
          this.inputtedParentRef?.showNotification('Failed to fetch ratings.');
          console.error('Error fetching ratings:', e);
        }
      } else {
        console.log('Ratings already loaded for this file, skipping fetch.');
      }
    }, 100);
  }

  closeRatingsPanel(): void {
    setTimeout(() => {
      this.isRatingsPanelOpen = false;
      //this.ratingFile = undefined;
      const parent = this.inputtedParentRef;
      if (parent) {
        parent.closeOverlay(false);
      }
    }, 50)
  }

  async rateFile(star: number) {
    if (!this.ratingFile) {
      console.error('No rating file available to rate.');
      return;
    }
    console.log('rateFile called with file:', this.ratingFile, 'star:', star);
    const user = this.currentUser;
    try {
      await this.ratingsService.submitRating(
        user, 
        star, 
        this.componentType === 'file' ? this.ratingFile?.id : undefined, 
        this.componentType != 'file' ? this.ratingFile?.id : undefined
      );
      // If this is the ratings panel file, recalculate average from ratings array
      if (this.ratingFile && this.ratingFile.id === this.ratingFile.id && Array.isArray(this.ratingFile.ratings)) {
        // Find or update the user's rating in the array
        const userId = user.id;
        let found = false;
        for (const r of this.ratingFile.ratings) {
          if (r.user?.id === userId) {
            r.value = star;
            found = true;
            break;
          }
        }
        if (!found) {
          this.ratingFile?.ratings.push({ user, value: star });
        }
        // Remove duplicate ratings by the same user (shouldn't happen, but just in case)
        const uniqueRatings = new Map();
        for (const r of this.ratingFile?.ratings ?? []) {
          if (r.user?.id) uniqueRatings.set(r.user.id, r);
        }
        const ratingsArr = Array.from(uniqueRatings.values());
        this.ratingFile.ratingCount = ratingsArr.length;
        this.ratingFile.averageRating = ratingsArr.length
          ? ratingsArr.reduce((sum, r) => sum + (r.value ?? 0), 0) / ratingsArr.length
          : star;
      } else {
        // Fallback: just increment as before
        this.ratingFile.averageRating = this.ratingFile.ratingCount
          ? ((this.ratingFile.averageRating ?? 0) * this.ratingFile.ratingCount + star) / (this.ratingFile.ratingCount + 1)
          : star;
        this.ratingFile.ratingCount = (this.ratingFile.ratingCount ?? 0) + 1;
      }
      this.inputtedParentRef?.showNotification(`Rated ${star} star${star > 1 ? 's' : ''}!`);
    } catch (ex) {
      console.error(ex);
      this.inputtedParentRef?.showNotification('Failed to submit rating.');
    }
  }
}
