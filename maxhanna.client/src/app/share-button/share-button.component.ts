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
  @Input() text = "📋Share";
  @Input() isExternalLink = false;
  @Input() inputtedParentRef?: AppComponent;
  @Input() callback?: any;
  @Output() linkCopiedEvent = new EventEmitter<void>();

  copyLink() { 
    let link = "";
    if (this.link) { 
      link = 
        (this.isExternalLink || this.link.includes("bughosted.com") || this.link.includes("://")) 
        ? this.link 
        : `https://bughosted.com/${this.link}`;
      navigator.clipboard.writeText(link).then(() => {
        this.inputtedParentRef?.showNotification('Link copied to clipboard!');
        if (!this.inputtedParentRef) {
          alert('Link copied to clipboard!');
        }
      }).catch(err => {
        this.inputtedParentRef?.showNotification('Failed to copy link!');
      });
    }
    
    if (this.callback && typeof this.callback === 'function') {
      this.callback();
    }
    this.linkCopiedEvent.emit();
    this.inputtedParentRef?.closeOverlay();
    
  }
}
