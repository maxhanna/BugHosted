import { Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core'; 
import { AppComponent } from '../app.component';
import { ChildComponent } from '../child.component';
import { User } from '../../services/datacontracts/user/user';
import { MediaViewerComponent } from '../media-viewer/media-viewer.component';
import { UserService } from '../../services/user.service';

@Component({
    selector: 'app-user-tag',
    templateUrl: './user-tag.component.html',
    styleUrl: './user-tag.component.css',
    standalone: false
})
export class UserTagComponent extends ChildComponent implements OnInit, OnDestroy, OnChanges {
  @Input() user?: User;
  @Input() userId?: number;
  @Input() inputtedParentRef?: AppComponent;
  @Input() displayEmptyAvatar = false;
  @Input() displayOnlyName = false;
  @Input() displayOnlyAvatar = false;
  @Input() displayLargeAvatar = false;
  @Input() displayMiniTag = false;
  @Input() preventOpenProfile = false;
  @Input() preventExpandPicture = true;
  @Input() hideName = false;
  @Input() displayTinyPicture = false;
  @Input() displayHoverPicture = false;
  @Output() userLoaded = new EventEmitter<User>();
  @ViewChild('profileImageViewer') profileImageViewer!: MediaViewerComponent;

  popupTop: number = 0;
  popupLeft: number = 0;

  constructor(private userService: UserService) { super(); }
  async ngOnInit() { 
    this.parentRef = this.inputtedParentRef;
    if (this.user && this.user.id && !this.user.username) { 
      await this.userService.getUserById(this.user.id).then(res => {
        if (res) {
          this.user = res;
          this.userLoaded.emit(this.user);
        }
      });
    } else if (this.userId) {  
      await this.userService.getUserById(this.userId).then(res => {
        if (res) {
          this.user = res;
          this.userLoaded.emit(this.user);
        }
      }); 
    }
  }
  ngOnDestroy() { 
    this.onUserTagLeave();
  }
 
  ngOnChanges(changes: SimpleChanges) { 
    if (changes['user'] && !changes['user'].firstChange && this.profileImageViewer) {
      this.user = changes["user"].currentValue;
      this.profileImageViewer.fileSrc = undefined;
      this.profileImageViewer.selectedFileSrc = '';
      this.profileImageViewer.file = undefined;
      this.profileImageViewer.fileId = this.user?.displayPictureFile?.id;  
      this.userLoaded.emit(this.user);

      setTimeout(() => {
        this.profileImageViewer.fetchFileSrc();
      }, 10)
    }
  }

  onUserTagHover(event: any) {
    if (!this.user?.id) return;
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => {
      const btn = document.getElementById("showUserTagButton");
      const inputX = document.getElementById("showUserTagX") as HTMLInputElement;
      const inputY = document.getElementById("showUserTagY") as HTMLInputElement; 
      (document.getElementById("showUserTagUserId") as HTMLInputElement).value = this.user?.id?.toString() || '0'; 
      let newX = event.clientX + 150;
      let newY = event.clientY + 30;
      const tagWidth = 200;
      const tagHeight = 80;
      const offset = 5;
      // Check if tag would go off the right edge of the window
      if (newX + tagWidth > window.innerWidth) {
        newX = event.clientX - tagWidth; // Position to the left of cursor
      }

      // Check if tag would go off the bottom edge of the window
      if (newY + tagHeight > window.innerHeight) {
        newY = event.clientY - tagHeight - offset; // Position above cursor
      }

      // Ensure the tag doesn't go off the left edge
      if (newX < 0) {
        newX = offset;
      }

      // Ensure the tag doesn't go off the top edge
      if (newY < 0) {
        newY = offset;
      }


      if (btn) {
        inputX.value = newX; // 10px right of cursor
        inputY.value = newY; // 10px below cursor  
        btn.click(); 
      }
    }, 500);
   
  }
  onUserTagLeave() {
    if (!this.user?.id) return;
    const btn = document.getElementById("hideUserTagButton");
    if (btn) {
      btn.click(); 
    }
  }
}
