import { Component, Input } from '@angular/core';
import { AppComponent } from '../app.component';

@Component({
  selector: 'app-share-button',
  standalone: false,
  templateUrl: './share-button.component.html',
  styleUrl: './share-button.component.css'
})
export class ShareButtonComponent {
  constructor() {}
  @Input() link = "";
  @Input() inputtedParentRef?: AppComponent;

  copyLink() { 
    const link = `https://bughosted.com/${this.link}`;
    this.inputtedParentRef?.closeOverlay();
    navigator.clipboard.writeText(link).then(() => {
      this.inputtedParentRef?.showNotification('Link copied to clipboard!');
    }).catch(err => {
      this.inputtedParentRef?.showNotification('Failed to copy link!');
    });
  }
}
