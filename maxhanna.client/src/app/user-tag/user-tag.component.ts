import { Component, ElementRef, Input, OnChanges, OnInit, SimpleChanges, ViewChild } from '@angular/core'; 
import { AppComponent } from '../app.component';
import { ChildComponent } from '../child.component';
import { User } from '../../services/datacontracts/user/user';
import { MediaViewerComponent } from '../media-viewer/media-viewer.component';

@Component({
  selector: 'app-user-tag',
  templateUrl: './user-tag.component.html',
  styleUrl: './user-tag.component.css'
})
export class UserTagComponent extends ChildComponent implements OnInit, OnChanges {
  @Input() user?: User;
  @Input() inputtedParentRef?: AppComponent;
  @Input() displayEmptyAvatar = false;
  @Input() displayOnlyName = false;
  @Input() displayOnlyAvatar = false;
  @Input() displayMiniTag = false;
  @Input() hideName = false;

  @ViewChild('profileImageViewer') profileImageViewer!: MediaViewerComponent;

  constructor() { super(); }
  ngOnInit() {
    this.parentRef = this.inputtedParentRef;
  }

  ngOnChanges(changes: SimpleChanges) { 
    if (changes['user'] && !changes['user'].firstChange && this.profileImageViewer) {
      this.profileImageViewer.user = changes["user"].currentValue;
      this.profileImageViewer.selectedFile = undefined;
      this.profileImageViewer.selectedFileSrc = "";
      setTimeout(() => {
        this.profileImageViewer.ngOnInit();
      }, 10)
    }
  }
}
