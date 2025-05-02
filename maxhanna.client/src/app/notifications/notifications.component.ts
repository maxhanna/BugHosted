import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { NotificationService } from '../../services/notification.service';
import { ChildComponent } from '../child.component';
import { UserNotification } from '../../services/datacontracts/notification/user-notification';
import { Location } from '@angular/common';
import { AppComponent } from '../app.component';
import { User } from '../../services/datacontracts/user/user';
import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, Messaging } from "firebase/messaging";
import { CommentService } from '../../services/comment.service';
import { FileComment } from '../../services/datacontracts/file/file-comment';

@Component({
    selector: 'app-notifications',
    templateUrl: './notifications.component.html',
    styleUrl: './notifications.component.css',
    standalone: false
})
export class NotificationsComponent extends ChildComponent implements OnInit, OnDestroy {
  constructor(private notificationService: NotificationService, private commentService: CommentService, private location: Location) {
    super();
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent?.user?.id) { //only allow notifications pushed if user is logged in.
      try {
        this.requestNotificationPermission();
      } catch (e) {
        console.log("error configuring firebase: ", e);
      }
    }
  }

  @Input() minimalInterface? = false;
  @Input() inputtedParentRef?: AppComponent; 

  showNotifications = false;
  notifications?: UserNotification[] = [];

  app?: any;
  messaging?: any;
  unreadNotifications = 0;

  private pollingInterval: any;

  ngOnInit() {
    if (this.inputtedParentRef && !this.parentRef) { 
      this.parentRef = this.inputtedParentRef;
    }
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
    if (this.parentRef?.user?.id) { 
      this.startLoading();
      this.notifications = await this.notificationService.getNotifications(this.parentRef.user.id);
      this.unreadNotifications = this.notifications?.filter(x => x.isRead == false).length;
      this.stopLoading();
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
    const parent = this.parentRef ?? this.inputtedParentRef;
    if (parent) {
      parent.createComponent(name, args);
    }
    this.showNotifications = false;
  }
  goToFileId(notification: UserNotification) {
    this.location.replaceState("/File/" + notification.fileId);
    if (!notification.isRead) { this.read(notification, true); }
    this.createComponent("Files", { "fileId": notification.fileId, "previousComponent": this.previousComponent });
  }
  goToStoryId(notification: UserNotification) {
    if (notification.userProfileId) {
      this.location.replaceState("/User/" + notification.userProfileId);
      this.createComponent("User", { "userId": notification.userProfileId, "previousComponent": this.previousComponent });
    } else { 
      this.location.replaceState("/Social/" + notification.storyId);
      this.createComponent("Social", { "storyId": notification.storyId, "previousComponent": this.previousComponent });
    }
    if (!notification.isRead) { this.read(notification, true); }
  }
  goToChat(notification?: UserNotification) {
    if (!notification?.chatId) return alert("Error: Must select a user to chat!");
    if (!notification.isRead) { this.read(notification, true); }
    this.createComponent("Chat", { chatId: notification.chatId });
  }
  viewProfileByNotification(notification?: UserNotification) {
    if (!notification) return;
    this.read(notification, true);
    const userProfileId = notification.userProfileId;
    if (userProfileId && userProfileId != 0) {
      const storyId = notification.storyId;
      console.log(storyId, userProfileId);
      this.parentRef?.closeOverlay();
      this.parentRef?.createComponent("User", { 
        "userId": userProfileId, 
        "storyId": storyId,
        "previousComponent": this.previousComponent,  
      }); 
    }
  }
  async goToCommentId(notification?: UserNotification) {
    if (!notification || !notification.commentId) return;
    if (!notification.isRead) { this.read(notification, true); }  
    if (notification.storyId) {
      return this.goToStoryId(notification);
    }
    if (notification.fileId) {
      return this.goToFileId(notification);
    }

    alert("No parent component");
  }

  async delete(notification?: UserNotification) {
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent && parent.user) {
      await this.notificationService.deleteNotification(parent.user.id ?? 0, notification?.id);
      if (notification && this.notifications) {
        this.notifications = this.notifications.filter(x => x.id != notification.id);
        if (!notification.isRead) {
          this.unreadNotifications--;
        }
      } else {
        this.notifications = [];
      }
      parent.navigationComponent.setNotificationNumber(this.unreadNotifications);
    }
  }
  async read(notification?: UserNotification, forceRead: boolean = false) {
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent && parent.user) {
      if (notification && notification.id) {
        if (notification.isRead && !forceRead) {
          notification.isRead = false;
          this.unreadNotifications++;
          await this.notificationService.unreadNotifications(parent.user.id ?? 0, [notification.id]);
        } else {
          notification.isRead = true;
          this.unreadNotifications--;
          await this.notificationService.readNotifications(parent.user.id ?? 0, [notification.id]);
        }
      } else {
        this.notifications?.forEach(x => x.isRead = true);
        this.unreadNotifications = 0;
        await this.notificationService.readNotifications(parent.user.id ?? 0, undefined);
      }
      parent.navigationComponent.setNotificationNumber(this.unreadNotifications);
    }
  }
  notificationTextClick(notification: UserNotification) {
    if (!notification.isRead) { 
      this.read(notification, true);
    } 
    if (notification.text?.includes('Captured') && notification.text?.includes('base at')) {
      this.parentRef?.createComponent('Bug-Wars');
    } else if (notification.text?.includes('BugWars')) {
      this.parentRef?.createComponent('Bug-Wars');
    } else if (notification.text?.includes('Shared a note')) {
      this.parentRef?.createComponent('Notepad');
    } else if (notification.fileId) {
      this.goToFileId(notification)
    } else if (notification.storyId) {
      this.goToStoryId(notification)
    } else if (notification.chatId) {
      this.goToChat(notification);
    } else if (notification?.text?.toLowerCase().includes("following")) {
      this.viewProfile(notification.fromUser, this.previousComponent);
    } else if (notification?.text?.toLowerCase().includes("friend request")) {
      this.viewProfile(notification.fromUser, this.previousComponent);
    }
  }

  toggleNotifications() {
    this.showNotifications = !this.showNotifications;

    if (this.inputtedParentRef) {
      if (this.showNotifications) {
        this.inputtedParentRef.showOverlay();
      } else {
        this.inputtedParentRef.closeOverlay();
      }
    }
  }
  async requestNotificationPermission() {
    try {
      const firebaseConfig = {
        apiKey: "AIzaSyAR5AbDVyw2RmW4MCLL2aLVa2NLmf3W-Xc",
        authDomain: "bughosted.firebaseapp.com",
        projectId: "bughosted",
        storageBucket: "bughosted.firebasestorage.app",
        messagingSenderId: "288598058428",
        appId: "1:288598058428:web:a4605e4d8eea73eac137b9",
        measurementId: "G-MPRXZ6WVE9"
      };
      this.app = initializeApp(firebaseConfig);
      this.messaging = await getMessaging(this.app);

      onMessage(this.messaging, (payload: any) => {
        alert(`${payload}`);
      });

      console.log('Current Notification Permission:', Notification.permission);

      if (Notification.permission === 'default') {
        // Ask for permission
        const permission = await Notification.requestPermission();
        console.log('User responded with:', permission);
        if (permission === "granted") {
          const token = await getToken(this.messaging, { vapidKey: "BOdqEEb-xWiCvKqILbKr92U6ETC3O0SmpbpAtulpvEqNMMRq79_0JidqqPgrzOLDo_ZnW3Xh7PNMwzP9uBQSCyA" });
          console.log('FCM Token:', token);
          await this.subscribeToNotificationTopic(token);
        } else {
          console.log('Notification permission denied');
        }
      } else {
        console.log('Permission already:', Notification.permission);
        const token = await getToken(this.messaging, { vapidKey: "BOdqEEb-xWiCvKqILbKr92U6ETC3O0SmpbpAtulpvEqNMMRq79_0JidqqPgrzOLDo_ZnW3Xh7PNMwzP9uBQSCyA" });
        await this.subscribeToNotificationTopic(token);
      }
    } catch (error) {
      console.log('Error requesting notification permission:', error);
    }
  }


  private async subscribeToNotificationTopic(token: string) { 
    if (this.parentRef?.user?.id) {
      this.notificationService.subscribeToTopic(this.parentRef.user.id, token, "notification" + this.parentRef.user.id).then(res => {
        console.log(res);
      });
    }
  }

  getShowReadAll() {
    return this.notifications && this.notifications.length > 0 && this.notifications.some(x => !x.isRead);
  }
}
