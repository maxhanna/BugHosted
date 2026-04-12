import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-loading-spinner',
  templateUrl: './app-loading-spinner.component.html',
  styleUrls: ['./app-loading-spinner.component.css']
})
export class AppLoadingSpinnerComponent {
  /**
   * Emoji to display. Defaults to hourglass.
   */
  @Input() icon: string = '⏳';
  /**
   * Accessible label for the emoji.
   */
  @Input() label: string = 'Loading';
  /**
   * Font size (e.g. '1.2em', '24px').
   */
  @Input() fontSize: string = '1.2em';
}
