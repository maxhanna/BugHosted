import { Component, ElementRef, Input, OnChanges, OnInit, SimpleChanges, ViewChild } from '@angular/core'; 
import { AppComponent } from '../app.component';
import { ChildComponent } from '../child.component';
import { User } from '../../services/datacontracts/user/user';
import { MediaViewerComponent } from '../media-viewer/media-viewer.component';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-user-tag',
  templateUrl: './user-tag.component.html',
  styleUrl: './user-tag.component.css'
})
export class UserTagComponent extends ChildComponent implements OnInit, OnChanges {
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

  @ViewChild('profileImageViewer') profileImageViewer!: MediaViewerComponent;

  constructor(private userService: UserService) { super(); }
  async ngOnInit() {
    console.log("user tag init");
    this.parentRef = this.inputtedParentRef;
    if (this.user && this.user.id && !this.user.username) {
      console.log("no username passed in, but got a userId, fetching user: ", this.user);
      await this.userService.getUserById(this.user.id).then(res => {
        if (res) {
          this.user = res;
        }
      });
    } else if (this.userId) { 
      console.log("no username passed in, but got a userId, fetching user: ", this.user);
      await this.userService.getUserById(this.userId).then(res => {
        if (res) {
          this.user = res;
        }
      }); 
    }
  }

  ngOnChanges(changes: SimpleChanges) { 
    if (changes['user'] && !changes['user'].firstChange && this.profileImageViewer) {
      this.user = changes["user"].currentValue;
      this.profileImageViewer.fileSrc = undefined;
      this.profileImageViewer.selectedFileSrc = '';
      this.profileImageViewer.file = undefined;
      this.profileImageViewer.fileId = this.user?.displayPictureFile?.id; 

      setTimeout(() => {
        this.profileImageViewer.fetchFileSrc();
      }, 10)
    }
  }
}
