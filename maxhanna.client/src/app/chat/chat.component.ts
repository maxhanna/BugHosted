import { Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { ChatService } from '../../services/chat.service';
import { Message } from '../../services/datacontracts/chat/message';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { User } from '../../services/datacontracts/user/user';
import { AppComponent } from '../app.component';
import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, Messaging } from "firebase/messaging";
import { NotificationService } from '../../services/notification.service';
import { MediaSelectorComponent } from '../media-selector/media-selector.component';
import { UserService } from '../../services/user.service';
import { UserSettings } from '../../services/datacontracts/user/user-settings';
@Component({
    selector: 'app-chat',
    templateUrl: './chat.component.html',
    styleUrls: ['./chat.component.css'],
    standalone: false
})
export class ChatComponent extends ChildComponent implements OnInit, OnDestroy {
  users: Array<User> = [];
  isPanelExpanded: boolean = true;
  currentChatUsers: User[] | undefined = undefined;
  currentChatId?: number;
  chatHistory: Message[] = [];
  attachedFiles: FileEntry[] = [];
  selectedUsers: User[] = [] 
  @ViewChild('newMessage') newMessage!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('chatWindow') chatWindow!: ElementRef;
  @ViewChild('changePageMenuSelect') changePageMenuSelect!: ElementRef<HTMLSelectElement>;
  @ViewChild(MediaSelectorComponent) attachmentSelector!: MediaSelectorComponent;
  hasManuallyScrolled = false;
  private pollingInterval: any;
  private isChangingPage = false;

  @Input() selectedUser?: User;
  @Input() chatId?: number;
  @Input() inputtedParentRef?: AppComponent;
  @Output() closeChatEvent = new EventEmitter<void>();

  pageNumber = 1;
  pageSize = 10;
  totalPages = 1;
  totalPagesArray: number[] = [];
  isDisplayingChatMembersPanel = false;
  isMenuPanelOpen= false;
  showUserList = true;
  app?: any;
  messaging?: any;
  ghostReadEnabled = false;
  notificationsEnabled?: boolean = undefined;

  constructor(private chatService: ChatService, private notificationService: NotificationService, private userService: UserService) {
    super();

    const parent = this.parentRef ?? this.inputtedParentRef;
    parent?.addResizeListener(); 
  }

  async ngOnInit() {
    let notificationsEnabled = false;
    if (this.selectedUser) {
      if (this.inputtedParentRef) {
        this.parentRef = this.inputtedParentRef;
      }
      await this.openChat([this.selectedUser]);
    }
    if (this.chatId) {
      let user = this.parentRef?.user ?? this.inputtedParentRef?.user;
      if (!user) {
        user = new User(0, "Anonymous");
      }
      const res = await this.chatService.getChatUsersByChatId(this.chatId);
      if (res) {
        this.selectedUsers = res;
        await this.openChat(this.selectedUsers);
      }
    }
    let user = this.parentRef?.user ?? this.inputtedParentRef?.user;
    if (user) {
      this.userService.getUserSettings(user.id ?? 0).then((res?: UserSettings) => {
        if (res) {
          this.notificationsEnabled = res.notificationsEnabled;
          if (this.notificationsEnabled == undefined || this.notificationsEnabled) {
            this.requestNotificationPermission();
          } 
        }
      })
    }
  }
  
  ngOnDestroy() {
    this.inputtedParentRef?.removeResizeListener();
    this.parentRef?.removeResizeListener();
    this.currentChatUsers = undefined;
    clearInterval(this.pollingInterval);
  }

  pollForMessages() {
    if (this.currentChatUsers) {
      this.pollingInterval = setInterval(async () => {
        if (!this.isComponentInView()) {
          clearInterval(this.pollingInterval);
          return;
        }
        if (this.currentChatUsers) {
          this.getMessageHistory(this.pageNumber, this.pageSize);
        }
      }, 5000);
    }
  }

  scrollToBottomIfNeeded() {
    if (this.chatWindow) {
      const chatWindow = this.chatWindow.nativeElement;

      // Using requestAnimationFrame to ensure the scroll happens after the DOM is fully painted
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (!this.hasManuallyScrolled) {
            chatWindow.scrollTop = chatWindow.scrollHeight;
          }
        }, 0);
      });
    }
  }

  async getMessageHistory(pageNumber?: number, pageSize: number = 10) {
    if (!this.currentChatUsers) return;
    try {
      const user = this.parentRef?.user ? this.parentRef.user : new User(0, "Anonymous");
      if (!this.currentChatUsers.some(x => x.id == user.id)) {
        this.currentChatUsers.push(user);
      }
      const receiverUserIds: number[] = this.currentChatUsers.map(x => x?.id ?? 0);

      const res = await this.chatService.getMessageHistory(
        user.id,
        receiverUserIds,
        this.currentChatId,
        pageNumber,
        pageSize);
      if (res && res.status && res.status == "404") {
        this.chatHistory = [];
        return;
      }
      if (res) { 
        const newMessages = res.messages.filter((newMessage: Message) => !this.chatHistory.some((existingMessage: Message) => existingMessage.id === newMessage.id));
        this.updateSeenStatus(res);
        if (!this.isChangingPage) {
          this.playSoundIfNewMessage(newMessages);
        }
        this.isChangingPage = false;

        this.chatHistory = [...this.chatHistory, ...newMessages];
        this.pageNumber = res.currentPage;
        if (!this.currentChatId && (res.messages[0] as Message).chatId) {
          this.currentChatId = (res.messages[0] as Message).chatId;
        }
        this.chatHistory.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        this.scrollToBottomIfNeeded();
      }
    } catch { }
  }
    private updateSeenStatus(res: any) {
        res.messages.forEach((newMessage: Message) => {
            const existingMessage = this.chatHistory.find((msg: Message) => msg.id === newMessage.id);
            if (existingMessage) {
                existingMessage.seen = newMessage.seen;
            }
        });
    }

  private playSoundIfNewMessage(newMessages: Message[]) {
    const user = this.inputtedParentRef?.user ?? this.parentRef?.user ?? new User(0, "Anonymous");
    const receivedNewMessages = newMessages.length > 0 && newMessages.some(x => x.sender.id != user.id);

    if (receivedNewMessages) {
      console.log("playing sound!", new Date());
      const notificationSound = new Audio("https://bughosted.com/assets/Uploads/Users/Max/arcade-ui-30-229499.mp4");
      notificationSound.play().catch(error => console.error("Error playing notification sound:", error));
    }
  }

  onScroll() {
    if (this.chatWindow) {
      const chatWindow = this.chatWindow.nativeElement;
      const isScrolledToBottom = chatWindow.scrollHeight - chatWindow.clientHeight <= chatWindow.scrollTop + 60;
      this.hasManuallyScrolled = !isScrolledToBottom;
    }
  }
  formatTimestamp(timestamp: Date) {
    const parent = this.inputtedParentRef ?? this.parentRef;
    return parent?.formatTimestamp(timestamp)
  }

  isComponentInView(): boolean {
    return this.parentRef!.componentsReferences.filter(x => x.componentType == ChatComponent).length > 0;
  }

  togglePanel() {
    this.isPanelExpanded = !this.isPanelExpanded;
  }

  async changePage(event: any) {
    this.pageNumber = +event.target.value;
    this.chatHistory = [];
    this.isChangingPage = true;
    this.closeMenuPanel();
    await this.getMessageHistory(this.pageNumber, this.pageSize);
  }
  async openChat(users?: User[]) {
    if (!users) { return; }
    setTimeout(() => { 
      const parent = this.parentRef ?? this.inputtedParentRef;
      parent?.addResizeListener();
      parent?.updateLastSeen();
    }, 50);

    this.startLoading();
    this.isPanelExpanded = true;
    this.showUserList = false;
    this.chatHistory = [];
    this.currentChatId = undefined;
    users = this.filterUniqueUsers(users);
    const user = this.getChatUsers(users);
    if (!this.currentChatUsers) return;
    const receiverUserIds: number[] = this.currentChatUsers.map(x => x?.id ?? 0);

    const res = await this.chatService.getMessageHistory(user.id, receiverUserIds, undefined, undefined, this.pageSize);

    if (res && res.status && res.status == "404") {
      this.chatHistory = [];
      this.togglePanel();
      return;
    }
    if (res && res.messages) {
      this.chatHistory = (res.messages as Message[]).reverse();
      this.pageNumber = res.currentPage;
      this.totalPages = res.totalPages;
      this.totalPagesArray = Array(this.totalPages).fill(0).map((_, i) => i + 1);
      const message0 = (res.messages[0] as Message);

      if (!this.currentChatId && message0.chatId) {
        this.currentChatId = message0.chatId;
      } 
    }
    setTimeout(() => {
      this.scrollToBottomIfNeeded();
      this.pollForMessages();
    }, 410);
    this.togglePanel();

    this.stopLoading();
  }



  private getChatUsers(users: User[]) {
    const user = this.parentRef?.user ? this.parentRef.user : new User(0, "Anonymous");
    this.currentChatUsers = users;
    if (!this.currentChatUsers.some(x => x.id == user.id)) {
      this.currentChatUsers.push(user);
    }
    this.currentChatUsers = this.filterUniqueUsers(this.currentChatUsers);
    return user;
  }

  closeChat() {
    this.closeChatEvent.emit();
    this.hasManuallyScrolled = false;
    this.currentChatUsers = undefined;
    this.chatHistory = [];
    this.pageNumber = 0;
    this.totalPages = 0;
    this.totalPagesArray = new Array<number>();
    clearInterval(this.pollingInterval);
    this.showUserList = true;
    this.isPanelExpanded = true;

    const parent = this.inputtedParentRef ?? this.parentRef;
    parent?.closeOverlay();
  }

  async sendMessage() {
    if (!this.currentChatUsers || this.currentChatUsers.length == 0) return;
    let msg = this.newMessage.nativeElement.value.trim();
    if (msg && this.parentRef) {
      msg = this.parentRef.replaceEmojisInMessage(msg);
    }
    if (msg.trim() == "" && (!this.attachedFiles || this.attachedFiles.length == 0)) {
      return alert("Message content cannot be empty.");
    }
    let chatUsersIds: number[] = [];
    this.currentChatUsers.forEach(x => chatUsersIds.push(x.id ?? 0));
    if (this.parentRef && this.parentRef.user && !this.currentChatUsers.find(x => x.id == this.parentRef?.user?.id)) {
      chatUsersIds.push(this.parentRef.user?.id ?? 0);
    }
    try {
      setTimeout(() => {
        this.newMessage.nativeElement.value = '';
        this.newMessage.nativeElement.innerHTML = '';
        this.newMessage.nativeElement.textContent = '';
      }, 10); 
      await this.chatService.sendMessage(this.parentRef?.user?.id ?? 0, chatUsersIds, this.currentChatId, msg, this.attachedFiles);
      this.removeAllAttachments();
      this.attachedFiles = [];
      await this.getMessageHistory().then(x => { 
        setTimeout(() => {
          this.chatWindow.nativeElement.scrollTop = this.chatWindow.nativeElement.scrollHeight;
        }, 250); 
      });
      this.notificationService.createNotifications(
        { fromUserId: this.parentRef?.user?.id ?? 0, toUserIds: chatUsersIds.filter(x => x != (this.parentRef?.user?.id ?? 0)), message: msg, chatId: this.currentChatId }
      );
    } catch (error) {
      console.error(error);
    }
  }
  private removeAllAttachments() {
    this.attachedFiles = [];
    this.attachmentSelector.removeAllFiles();
  }

  selectFile(files: FileEntry[]) {
    this.attachedFiles = files;
  }
  userSelectClickEvent(users: User[] | undefined) {
    if (!users) this.selectedUsers = [];
    else this.selectedUsers = users;
  }
  groupChatEvent(users: User[] | undefined) {
    if (!users) {
      this.selectedUsers = [];
      return;
    }
    else this.selectedUsers = users;
    this.openGroupChat();
  }
  singleUserSelected(user?: User) {
    if (!user) return;
    this.openChat([user]);
  }

  async openGroupChat() {
    if (!this.selectedUsers || this.selectedUsers.length == 0) { return alert("You must select more than one user."); }
    this.openChat(this.selectedUsers);
  }
  getCommaSeperatedGroupChatUserNames() {
    if (this.currentChatUsers) {
      return this.chatService.getCommaSeparatedGroupChatUserNames(this.currentChatUsers, this.parentRef?.user);
    }
    else return "";
  }
  getChatUsersWithoutCurrentUser() {
    const parent = this.parentRef ?? this.inputtedParentRef;
    return this.currentChatUsers?.filter(x => x.id != (parent?.user?.id ?? 0));
  }

  displayChatMembers() { 
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent) {
      parent.closeOverlay();
      setTimeout(() => {
        this.isDisplayingChatMembersPanel = true;
        parent.showOverlay();
      }, 10);
    }
  }
  closeChatMembersPanel() {
    this.isDisplayingChatMembersPanel = false;
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent) {
      parent.closeOverlay();
    }
  }
  addChatMember(users?: User[]) {
    if (!users) return; 
    if (users.some(user => this.currentChatUsers?.some(z => z.id === user.id))) {
      alert("Duplicate users found. Aborting.");
      return;
    }
    this.selectedUsers = this.selectedUsers.concat(users);
    this.selectedUsers = this.filterUniqueUsers(this.selectedUsers);
    this.openGroupChat();
  }

  async requestNotificationPermission() {
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (!parent?.user || !parent.user.id) {
      return;
    }
    const currentUrl = window.location.href;
    if (currentUrl.includes(":8000/")) {
      return;
    }  
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
      //onMessage(this.messaging, (payload: any) => {
      //  const parent = this.inputtedParentRef ?? this.parentRef;
      //  const body = payload.notification.body;
      //  const title = payload.notification.title;
      //  parent?.showNotification(`${title}: ${body}`);
      //});

      console.log('Current Notification Permission:', Notification.permission);
      if (this.notificationsEnabled == undefined) {
        if (Notification.permission === 'default') {
          const permission = await Notification.requestPermission();
          if (permission === "granted") {
            const token = await getToken(this.messaging, { vapidKey: "BOdqEEb-xWiCvKqILbKr92U6ETC3O0SmpbpAtulpvEqNMMRq79_0JidqqPgrzOLDo_ZnW3Xh7PNMwzP9uBQSCyA" });
            await this.subscribeToNotificationTopic(token);
            this.userService.updateNotificationsEnabled(parent.user.id, true);
          } else {
            console.log('User declined notification permission');
            this.userService.updateNotificationsEnabled(parent.user.id, false);
          }
        } else if (Notification.permission === 'granted') {
          const token = await getToken(this.messaging, { vapidKey: "BOdqEEb-xWiCvKqILbKr92U6ETC3O0SmpbpAtulpvEqNMMRq79_0JidqqPgrzOLDo_ZnW3Xh7PNMwzP9uBQSCyA" });
          await this.subscribeToNotificationTopic(token);
          this.userService.updateNotificationsEnabled(parent.user.id, true);
        } else {
          console.log('User denied notification permission');
          this.userService.updateNotificationsEnabled(parent.user.id, false);
        }
      } else {
        console.log("User has already enabled or disabled notifications.");
      }
    } catch (error) {
      console.log('Error requesting notification permission:', error);
    }
  }

  getTextForDOM(text?: string, componentId?: any) {
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent) {
      return parent.getTextForDOM(text, componentId);
    } else return "Error fetching parent component.";
  }
   
  filterUniqueUsers(users: User[]): User[] {
    return users.filter((user, index, self) =>
      index === self.findIndex(u => (u.id === user.id || u.username === user.username))
    );
  }

  quote(message: Message) {
    if (this.newMessage.nativeElement.value.trim() != "") {
      this.newMessage.nativeElement.value += "\n ";
    }
    this.newMessage.nativeElement.value += `[Quoting {${message.sender.username}|${message.sender.id}|${message.timestamp}}: ${message.content}] \n`;
    this.newMessage.nativeElement.focus();
  }

  showMenuPanel() {
    if (this.isMenuPanelOpen) {
      this.closeMenuPanel();
      return;
    }
    setTimeout(() => {
      if (this.changePageMenuSelect && this.changePageMenuSelect.nativeElement) {
        this.changePageMenuSelect.nativeElement.value = this.pageNumber.toString();
      }
    }, 50);

    this.isMenuPanelOpen = true;
    const parent = this.inputtedParentRef ?? this.parentRef;
    parent?.showOverlay(); 
  }
  closeMenuPanel() {
    this.isMenuPanelOpen = false;
    const parent = this.inputtedParentRef ?? this.parentRef;
    parent?.closeOverlay(); 
  }
  async enableGhostRead() {
    const parent = this.inputtedParentRef ?? this.parentRef;
    const user = parent?.user;
    if (!user || !user.id) return alert("You must be logged in to enable Ghost Read."); 
    this.userService.updateGhostRead(user.id, !this.ghostReadEnabled).then(res => {
      if (res) {
        parent.showNotification(res);
        this.ghostReadEnabled = !this.ghostReadEnabled;
      }
    });
  }
  getUtcTimestampString(date?: Date) {
    if (!date) return "";
    const parent = this.inputtedParentRef ?? this.parentRef;
    return parent?.convertUtcToLocalTime(date) ?? date;
  }
  private async subscribeToNotificationTopic(token: string) {
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent?.user?.id) {
      this.notificationService.subscribeToTopic(parent.user.id, token, "notification" + parent.user.id);
    }
  }
  getChatUsersWithoutSelf() {
    const user = this.inputtedParentRef?.user ?? this.parentRef?.user;
    return this.currentChatUsers?.filter(x => x.id != user?.id);
  }
}
