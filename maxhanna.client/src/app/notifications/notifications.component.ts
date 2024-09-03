import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { NotificationService } from '../../services/notification.service';
import { ChildComponent } from '../child.component';
import { UserNotification } from '../../services/datacontracts/notification/user-notification';
import { Location } from '@angular/common'; 
import { AppComponent } from '../app.component';
import { User } from '../../services/datacontracts/user/user';

@Component({
  selector: 'app-notifications',
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.css'
})
export class NotificationsComponent extends ChildComponent implements OnInit, OnDestroy {
  constructor(private notificationService: NotificationService, private location: Location) { super(); }

  @Input() minimalInterface? = false;
  @Input() inputtedParentRef?: AppComponent;

  showNotifications = false;
  notifications?: UserNotification[] = [];
  private pollingInterval: any;

  ngOnInit() {
    this.getNotifications();
    this.startPolling(); 
  }

  ngOnDestroy() {
    if (this.inputtedParentRef)
      this.inputtedParentRef.closeOverlay();
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval); // Clear the interval when component is destroyed
    }
  }
  private async getNotifications() {
    if ((this.inputtedParentRef && this.inputtedParentRef.user) || (this.parentRef && this.parentRef.user)) {
      const user = this.inputtedParentRef && this.inputtedParentRef.user ? this.inputtedParentRef.user : this.parentRef!.user!;
      this.notifications = await this.notificationService.getNotifications(user);
    }
  }
  private startPolling() {
    this.pollingInterval = setInterval(async () => {
      try {
        this.getNotifications();
      } catch (error) {
        console.error('Error fetching notifications:', error);
      }
    }, 30000); // Poll every 30 seconds
  }

  removeMe(type: string) { 
    if (this.inputtedParentRef) { 
      this.inputtedParentRef.removeAllComponents();
    } else { 
      super.remove_me(type);
    }
  }
  createComponent(name: string, args: any) {
    if (this.parentRef || this.inputtedParentRef) { 
      if (this.parentRef)
        this.parentRef.createComponent(name, args);
      else if (this.inputtedParentRef) {
        this.inputtedParentRef.createComponent(name, args); 
      }
    }
    this.showNotifications = false; 
  }
  goToFileId(id: number) {
    console.log("goToFileId");
    this.location.replaceState("/File/" + id);
    this.createComponent("Files", { "fileId": id }) 
  }
  goToStoryId(id: number) {
    this.location.replaceState("/Social/" + id);
    this.createComponent("Social", { "storyId": id });  
  }
  goToChat(user: User) {
    if (!(this.inputtedParentRef && this.inputtedParentRef.user) && !(this.parentRef && this.parentRef.user)) {
      return alert("Please log in to chat.");
    }
    if (!user) return alert("Error: Must select a user to chat!");

    this.createComponent("Chat", { selectedUser: user });
  }
  delete(notification?: UserNotification) {
    if ((this.inputtedParentRef && this.inputtedParentRef.user) || (this.parentRef && this.parentRef.user)) {
      this.notificationService.deleteNotification(this.inputtedParentRef?.user ?? this.parentRef?.user!, notification?.id);
      if (notification && this.notifications) { 
        this.notifications = this.notifications.filter(x => x.id != notification.id);
      } else {
        this.notifications = []; 
      }
    }
  }
}
