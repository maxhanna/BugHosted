import { Component, OnInit } from '@angular/core';
import { NotificationService } from '../../services/notification.service';
import { ChildComponent } from '../child.component';
import { UserNotification } from '../../services/datacontracts/notification/user-notification';
import { Location } from '@angular/common'; 

@Component({
  selector: 'app-notifications',
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.css'
})
export class NotificationsComponent extends ChildComponent implements OnInit {
  constructor(private notificationService: NotificationService, private location: Location) { super(); }

  notifications?: UserNotification[] = [];

  async ngOnInit() {
    if (this.parentRef && this.parentRef.user) { 
      this.notifications = await this.notificationService.getNotifications(this.parentRef.user)
    }
  }
  goToFileId(id: number) {
    this.location.replaceState("/File/" + id);
    if (this.parentRef) {
      this.parentRef.createComponent("Files", { "fileId": id });
    }
  }
  goToStoryId(id: number) {
    this.location.replaceState("/Social/" + id);
    if (this.parentRef) {
      this.parentRef.createComponent("Social", { "storyId": id });
    }
  }
}
