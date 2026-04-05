import { Component, Input, Output, EventEmitter } from '@angular/core';
import { User } from '../../services/datacontracts/user/user';
import { Rating } from '../../services/ratings.service';

@Component({
  selector: 'app-rating-stars',
  templateUrl: './rating-stars.component.html',
  styleUrls: ['./rating-stars.component.css'],
  standalone: false,
})
export class RatingStarsComponent {
  @Input() rating!: Rating;
  @Input() currentUser!: User;
  @Input() readOnly = false;
  @Output() rated = new EventEmitter<number>();

  stars = [1, 2, 3, 4, 5];

  get isCurrentUser() {
    return this.currentUser?.id === this.rating?.user?.id;
  }

  onRate(star: number) {
    if (!this.readOnly && this.isCurrentUser) {
      this.rated.emit(star);
    }
  }
}
