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
      this.rateFile(this.ratingFile, star);
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
    if (!file || this.isRatingsPanelOpen) return;
    this.inputtedParentRef.closeOverlay();
    setTimeout(async () => {
      this.ratingFile = file;
      this.isRatingsPanelOpen = true;  
      this.inputtedParentRef.showOverlay();
      
      if (file && file.id && !file.ratings) {
        try {
          const ratings = this.componentType === 'file'
            ? await this.ratingsService.getRatingsByFile(file.id) as Rating[] | undefined
            : await this.ratingsService.getRatingsBySearch(file.id) as Rating[] | undefined;
          this.ratingFile.ratings = Array.isArray(ratings) ? ratings : [];
        } catch (e) { 
          this.inputtedParentRef.showNotification('Failed to fetch ratings.'); 
          console.error('Error fetching ratings:', e);
        }
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

  async rateFile(file: FileEntry | MetaData, star: number) {
    console.log('rateFile called with file:', file, 'star:', star);
    const user = this.currentUser;
    try {
      await this.ratingsService.submitRating(
        user, 
        star, 
        this.componentType === 'file' ? file.id : undefined, 
        this.componentType != 'file' ? file.id : undefined
      );
      // If this is the ratings panel file, recalculate average from ratings array
      if (this.ratingFile && file.id === this.ratingFile.id && Array.isArray(this.ratingFile.ratings)) {
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
        file.ratingCount = ratingsArr.length;
        file.averageRating = ratingsArr.length
          ? ratingsArr.reduce((sum, r) => sum + (r.value ?? 0), 0) / ratingsArr.length
          : star;
      } else {
        // Fallback: just increment as before
        file.averageRating = file.ratingCount
          ? ((file.averageRating ?? 0) * file.ratingCount + star) / (file.ratingCount + 1)
          : star;
        file.ratingCount = (file.ratingCount ?? 0) + 1;
      }
      this.inputtedParentRef?.showNotification(`Rated ${star} star${star > 1 ? 's' : ''}!`);
    } catch (ex) {
      console.error(ex);
      this.inputtedParentRef?.showNotification('Failed to submit rating.');
    }
  }
}
