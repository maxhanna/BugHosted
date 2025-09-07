import { Component, Input, OnChanges, OnDestroy, OnInit } from '@angular/core';
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
export class NotificationsComponent extends ChildComponent implements OnInit, OnDestroy, OnChanges {
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

  currentPage = 1;
  itemsPerPage = 10;
  totalPages = 1;
  paginatedNotifications: UserNotification[] = [];
  filterCategory: string = 'All';
  categories: { name: string, count: number }[] = [];


  private pollingInterval: any;

  ngOnInit() {
    if (this.inputtedParentRef && !this.parentRef) { 
      this.parentRef = this.inputtedParentRef;
    }
    this.getNotifications();
    this.startPolling();
    this.scrollToTopNotification();
  }

  ngOnDestroy() {
    if (this.inputtedParentRef)
      this.inputtedParentRef.closeOverlay();
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval); // Clear the interval when component is destroyed
    }
  }
  ngOnChanges() {
    this.updateCategories();
  }

  private async getNotifications() {
    if (this.parentRef?.user?.id) {
      this.startLoading();
      await this.notificationService.getNotifications(this.parentRef.user.id).then(res => {
        if (res) {
          this.notifications = res;
          this.unreadNotifications = this.notifications?.filter(x => x.isRead == false).length;
          this.updateCategories(false);
          this.updatePagination();  
        }
      });
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


  private updatePagination() {
    let notificationsToPaginate;

    if (this.filterCategory === 'All') {
      notificationsToPaginate = this.notifications || [];
    } else if (this.filterCategory === 'Unread') {
      notificationsToPaginate = this.notifications?.filter(n => !n.isRead) || [];
    } else {
      notificationsToPaginate = this.notifications?.filter(n => this.getNotificationCategory(n) === this.filterCategory) || [];
    }

    if (!notificationsToPaginate || notificationsToPaginate.length === 0) {
      this.paginatedNotifications = [];
      this.totalPages = 1;
      this.currentPage = 1;
      return;
    }

    this.totalPages = Math.ceil(notificationsToPaginate.length / this.itemsPerPage);

    // Ensure currentPage is within valid bounds
    if (this.currentPage > this.totalPages) {
      this.currentPage = this.totalPages > 0 ? this.totalPages : 1;
    }

    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    this.paginatedNotifications = notificationsToPaginate.slice(startIndex, endIndex);
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.updatePagination();
    }
    this.scrollToTopNotification();
  }

  previousPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.updatePagination();
    }
    this.scrollToTopNotification();
  }


  private scrollToTopNotification() {
    const notificationsListSubContainer = document.getElementsByClassName("notificationsListSubContainer")[0];
    if (notificationsListSubContainer) {
      notificationsListSubContainer.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  }

  onItemsPerPageChange() { 
    this.itemsPerPage = Number(this.itemsPerPage);
    this.currentPage = 1; // Reset to first page when items per page changes
    this.updatePagination();
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
  goToCryptoHub(notification?: UserNotification) { 
    let selectedCoin = notification?.text?.match(/\b(XBT|BTC|XRP|SOL|ETH|XDG|Doge|Dogecoin|Ethereum|Solana)\b/i)?.[0] || 'Bitcoin';
    if (selectedCoin == "XBT" || selectedCoin == "BTC") {
      selectedCoin = "Bitcoin";
    }
    else if (selectedCoin == "SOL" || selectedCoin == "Solana") {
      selectedCoin = "Solana";
    }
    else if (selectedCoin == "XDG" || selectedCoin == "Doge" || selectedCoin == "Dogecoin") {
      selectedCoin = "Dogecoin";
    }
    else if (selectedCoin == "ETH" || selectedCoin == "Ethereum") {
      selectedCoin = "Ethereum";
    }
    console.log("opening crypto hub with ", selectedCoin);
    this.createComponent("Crypto-Hub", { currentSelectedCoin: selectedCoin }); 
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
      const commentId = notification.commentId; 
      this.parentRef?.closeOverlay();
      this.parentRef?.createComponent("User", { 
        "userId": userProfileId,
        "storyId": storyId,
        "commentId": commentId,
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
    if (!parent || !parent.user || !this.notifications) return;

    if (notification) {
      // Single notification delete - ensure ID exists
      if (notification.id === undefined) return;

      await this.notificationService.deleteNotifications(parent.user.id ?? 0, [notification.id]);
      this.notifications = this.notifications.filter(x => x.id !== notification.id);
      if (!notification.isRead) {
        this.unreadNotifications--;
      }
    } else {
      // Delete all or filtered notifications
      let notificationsToDelete = [...this.notifications];

      if (this.filterCategory === 'Unread') {
        notificationsToDelete = notificationsToDelete.filter(n => !n.isRead);
      } else if (this.filterCategory !== 'All') {
        notificationsToDelete = notificationsToDelete.filter(n => this.getNotificationCategory(n) === this.filterCategory);
      }

      // Get only valid IDs
      const validNotifications = notificationsToDelete.filter(n => n.id !== undefined);
      const ids = validNotifications.map(n => n.id as number); // Safe cast since we filtered undefined

      if (ids.length > 0) {
        await this.notificationService.deleteNotifications(parent.user.id ?? 0, ids);

        // Remove deleted notifications
        const idSet = new Set(ids);
        this.notifications = this.notifications.filter(n => !idSet.has(n.id as number));

        // Update unread count
        this.unreadNotifications -= validNotifications.filter(n => !n.isRead).length;
      }
    }

    this.updateCategories(false);
    this.updatePagination();
    parent.navigationComponent.setNotificationNumber(this.unreadNotifications);
  }
  async read(notification?: UserNotification, forceRead: boolean = false) {
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (!parent || !parent.user || !this.notifications) return;

    if (notification) {
      // Single notification read/unread - ensure ID exists
      if (notification.id === undefined) return;

      if (notification.isRead && !forceRead) {
        notification.isRead = false;
        this.unreadNotifications++;
        await this.notificationService.unreadNotifications(parent.user.id ?? 0, [notification.id]);
      } else if (!notification.isRead) {
        notification.isRead = true;
        this.unreadNotifications--;
        await this.notificationService.readNotifications(parent.user.id ?? 0, [notification.id]);
      }
    } else {
      // Read all or filtered notifications
      let notificationsToRead = [...this.notifications];

      if (this.filterCategory === 'Unread') {
        notificationsToRead = notificationsToRead.filter(n => !n.isRead);
      } else if (this.filterCategory !== 'All') {
        notificationsToRead = notificationsToRead.filter(n => this.getNotificationCategory(n) === this.filterCategory);
      }

      // Get only valid unread notifications
      const unreadNotifications = notificationsToRead
        .filter(n => !n.isRead && n.id !== undefined);

      if (unreadNotifications.length > 0) {
        const ids = unreadNotifications.map(n => n.id as number);
        await this.notificationService.readNotifications(parent.user.id ?? 0, ids);

        unreadNotifications.forEach(n => n.isRead = true);
        this.unreadNotifications -= unreadNotifications.length;

        if (this.parentRef?.navigationComponent) {
          this.parentRef.navigationComponent.tradeNotifsCount = 0;
        }
      }
    }

    this.updateCategories(false);
    parent.navigationComponent.setNotificationNumber(this.unreadNotifications, notification);
  }

  notificationTextClick(notification: UserNotification) { 
    if (!notification.isRead) { 
      this.read(notification, true);
      if (notification.text?.includes('Executed Trade') && this.parentRef?.navigationComponent) {
        this.parentRef.navigationComponent.tradeNotifsCount--;
      }
    } 
    if (notification.text?.toLowerCase().includes('captured') || notification.text?.includes('base at')) {
      this.parentRef?.createComponent('Bug-Wars');
    } else if (notification.text?.includes('BugWars')) {
      this.parentRef?.createComponent('Bug-Wars');
    } else if (notification.text?.includes('Shared a note')) {
      this.parentRef?.createComponent('Notepad');
    } else if (notification.text?.includes('Executed Trade')) { 
      this.goToCryptoHub(notification);
    } else if (notification.fileId) {
      this.goToFileId(notification)
    } else if (notification.userProfileId) {
      this.viewProfileByNotification(notification);
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

      // onMessage(this.messaging, (payload: any) => {
      //   alert(`${payload}`);
      // });

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

  getShowClearAll() {
    if (!this.notifications || this.notifications.length === 0) return false;

    if (this.filterCategory === 'All') {
      return this.notifications.length > 0;
    } else if (this.filterCategory === 'Unread') {
      return true; // Always show "Read All" when filtering unread notifications
    } else {
      return this.notifications.some(x => this.getNotificationCategory(x) === this.filterCategory);
    }
  }

  getShowReadAll() {
    if (!this.notifications || this.notifications.length === 0) return false;

    if (this.filterCategory === 'All') {
      return this.notifications.some(x => !x.isRead);
    } else if (this.filterCategory === 'Unread') {
      return true; // Always show "Read All" when filtering unread notifications
    } else {
      return this.notifications.some(x => !x.isRead && this.getNotificationCategory(x) === this.filterCategory);
    }
  }

  updateCategories(resetFilter: boolean = true) {
    if (!this.notifications) {
      this.categories = [{ name: 'All', count: 0 }, { name: 'Unread', count: 0 }];
      if (resetFilter) this.filterCategory = 'All';
      return;
    }

    // Store current counts before update
    const currentCounts = new Map(this.categories.map(c => [c.name, c.count]));

    // Calculate new counts
    const newCounts: { [key: string]: number } = {
      All: this.notifications.length,
      Unread: this.notifications.filter(n => !n.isRead).length
    };

    this.notifications.forEach(n => {
      const category = this.getNotificationCategory(n);
      newCounts[category] = (newCounts[category] || 0) + 1;
    });

    // Update categories while preserving order and existing objects where possible
    const newCategories = this.categories.map(c => {
      return { ...c, count: newCounts[c.name] || 0 };
    });

    // Add any new categories that weren't there before
    Object.keys(newCounts).forEach(name => {
      if (!newCategories.some(c => c.name === name)) {
        newCategories.push({ name, count: newCounts[name] });
      }
    });

    this.categories = newCategories;

    if (resetFilter) {
      this.filterCategory = 'All';
    }
  }

  getNotificationCategory(notification: UserNotification): string {
    const text = notification.text?.toLowerCase() || '';

    if (text.includes('executed trade')) return 'Crypto-Hub';
    if (text.includes('chat')) return 'Chat';
    if (!text.includes('profile') && (text.includes('post') || text.includes('comment'))) return 'Social';
    if (text.includes('profile') || text.includes('friend request') || text.includes('following')) return 'User';
    if (text.includes('bugwars') || text.includes('captured')) return 'Bug-Wars';
    if (text.includes('shared a note')) return 'Notepad';

    return 'Other';
  }
  get filteredNotifications(): UserNotification[] {
    if (this.filterCategory === 'All') return this.paginatedNotifications;
    if (this.filterCategory === 'Unread') return this.paginatedNotifications.filter(n => !n.isRead);
    return this.paginatedNotifications.filter(n => this.getNotificationCategory(n) === this.filterCategory);
  }
  onFilterChange(event: Event): void {
    this.currentPage = 1;
    const select = event.target as HTMLSelectElement;
    this.filterCategory = select.value;  
    this.updatePagination();
     
  }
}
