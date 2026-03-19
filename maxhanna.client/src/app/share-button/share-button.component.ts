import { Component, EventEmitter, Input, Output } from '@angular/core';
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
  @Input() isExternalLink = false;
  @Input() inputtedParentRef?: AppComponent;
  @Output() linkCopiedEvent = new EventEmitter<void>();

  copyLink() { 
    const link = 
      (this.isExternalLink || this.link.includes("bughosted.com") || this.link.includes("://")) 
      ? this.link 
      : `https://bughosted.com/${this.link}`;
    this.inputtedParentRef?.closeOverlay();
    navigator.clipboard.writeText(link).then(() => {
      this.inputtedParentRef?.showNotification('Link copied to clipboard!');
      if (!this.inputtedParentRef) {
        alert('Link copied to clipboard!');
      }
      this.linkCopiedEvent.emit();
    }).catch(err => {
      this.inputtedParentRef?.showNotification('Failed to copy link!');
    });
  }
}
