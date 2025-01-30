import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { NotificationService } from '../../services/notification.service';
import { ChildComponent } from '../child.component';
import { UserNotification } from '../../services/datacontracts/notification/user-notification';
import { Location } from '@angular/common';
import { AppComponent } from '../app.component';
import { User } from '../../services/datacontracts/user/user';
import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, Messaging } from "firebase/messaging";

@Component({
  selector: 'app-notifications',
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.css'
})
export class NotificationsComponent extends ChildComponent implements OnInit, OnDestroy {
  constructor(private notificationService: NotificationService, private location: Location) {
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
  goToChat(chatId?: number) {
    if (!chatId) return alert("Error: Must select a user to chat!");
    this.createComponent("Chat", { chatId: chatId });
  }
  async delete(notification?: UserNotification) {
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent && parent.user) {
      await this.notificationService.deleteNotification(parent.user, notification?.id);
      if (notification && this.notifications) {
        this.notifications = this.notifications.filter(x => x.id != notification.id);
      } else {
        this.notifications = [];
      }
      parent.getNotifications();
    }
  }
  async read(notification?: UserNotification) {
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent && parent.user) {
      if (notification && notification.id) { 
        await this.notificationService.readNotifications(parent.user, [notification.id]);
      } else { 
        await this.notificationService.readNotifications(parent.user, undefined);
      }
      if (notification) {
        notification.isRead = true;
      } else if (this.notifications) {
        this.notifications.forEach(x => x.isRead = true);
      }
      parent.getNotifications();
    }
  }
  notificationTextClick(notification: UserNotification) {
    if (notification.text?.includes('Captured a base at')) {
      this.parentRef?.createComponent('Bug-Wars');
    } else if (notification.fileId) {
      this.goToFileId(notification.fileId)
    } else if (notification.storyId) {
      this.goToStoryId(notification.storyId)
    } else if (notification.chatId) {
      this.goToChat(notification.chatId);
    } else if (notification?.text?.toLowerCase().includes("following")) {
      this.viewProfile(notification.fromUser);
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
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent && parent?.user?.id) {
      this.notificationService.subscribeToTopic(parent.user, token, "notification" + parent.user.id).then(res => {
        console.log(res);
      });
    }
  }
}
