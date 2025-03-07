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
@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css'],
})
export class ChatComponent extends ChildComponent implements OnInit, OnDestroy {
  users: Array<User> = [];
  isPanelExpanded: boolean = true;
  currentChatUsers: User[] | undefined = undefined;
  currentChatId?: number;
  chatHistory: Message[] = [];
  attachedFiles: FileEntry[] = [];
  selectedUsers: User[] = []
  isPlayingYoutubeVideo = false;
  @ViewChild('newMessage') newMessage!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('chatWindow') chatWindow!: ElementRef;
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
  showUserList = true;
  app?: any;
  messaging?: any;

  constructor(private chatService: ChatService, private notificationService: NotificationService) {
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

  async ngOnInit() {
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
      const res = await this.chatService.getChatUsersByChatId(user, this.chatId);
      if (res) {
        this.selectedUsers = res;
        await this.openChat(this.selectedUsers);
      }
    }
  }

  ngOnDestroy() {
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
      const res = await this.chatService.getMessageHistory(
        user,
        this.currentChatUsers,
        this.currentChatId,
        pageNumber,
        pageSize);
      if (res && res.status && res.status == "404") {
        this.chatHistory = [];
        return;
      }
      if (res) {
        const newMessages = res.messages.filter((newMessage: Message) => !this.chatHistory.some((existingMessage: Message) => existingMessage.id === newMessage.id));
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
  private playSoundIfNewMessage(newMessages: Message[]) {
    const user = this.inputtedParentRef?.user ?? this.parentRef?.user ?? new User(0, "Anonymous");
    const receivedNewMessages = newMessages.length > 0 && newMessages.some(x => x.sender.id != user.id);

    if (receivedNewMessages) {
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
    const date = new Date(timestamp);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${month}/${day} ${hours}:${minutes}`;
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
    await this.getMessageHistory(this.pageNumber, this.pageSize);
  }
  async openChat(users?: User[]) {
    if (!users) { return; }
    this.startLoading();
    this.isPanelExpanded = true;
    this.showUserList = false;
    this.chatHistory = [];
    this.currentChatId = undefined;
    const user = this.getChatUsers(users);
    if (!this.currentChatUsers) return;

    const res = await this.chatService.getMessageHistory(user, this.currentChatUsers, undefined, undefined, this.pageSize);

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


      this.requestNotificationPermission();
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
  }

  async sendMessage() {
    if (!this.currentChatUsers || this.currentChatUsers.length == 0) return;
    let msg = this.newMessage.nativeElement.value.trim();
    if (msg) {
      msg = this.replaceEmojisInMessage(msg);
    }
    if (msg.trim() == "" && (!this.attachedFiles || this.attachedFiles.length == 0)) {
      return alert("Message content cannot be empty.");
    }
    let chatUsers = this.currentChatUsers;
    if (this.parentRef && this.parentRef.user && !chatUsers.includes(this.parentRef.user)) {
      chatUsers.push(this.parentRef.user);
    }
    try {
      setTimeout(() => {
        this.newMessage.nativeElement.value = '';
        this.newMessage.nativeElement.innerHTML = '';
        this.newMessage.nativeElement.textContent = '';
      }, 10);
      const user = this.parentRef?.user ?? new User(0, "Anonymous");
      await this.chatService.sendMessage(user, chatUsers, this.currentChatId, msg, this.attachedFiles);
      this.removeAllAttachments();
      this.attachedFiles = [];
      await this.getMessageHistory();
      this.notificationService.createNotifications(
        { fromUser: user, toUser: chatUsers.filter(x => x.id != user.id), message: msg, chatId: this.currentChatId }
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
    this.isDisplayingChatMembersPanel = true;
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent) {
      parent.showOverlay();
    }
  }
  closeChatMembersPanel() {
    this.isDisplayingChatMembersPanel = false;
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent) {
      parent.isShowingOverlay = false;
    }
  }
  addChatMember(users?: User[]) {
    if (!users) return;
    console.log(users);
    console.log(this.currentChatUsers);
    if (users.some(user => this.currentChatUsers?.some(z => z.id === user.id))) {
      alert("Duplicate users found. Aborting.");
      return;
    }
    this.selectedUsers = this.selectedUsers.concat(users);
    this.selectedUsers = this.filterUniqueUsers(this.selectedUsers);
    this.openGroupChat();
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
        const parent = this.inputtedParentRef ?? this.parentRef;
        const body = payload.notification.body;
        const title = payload.notification.title;
        parent?.showNotification(`${title}: ${body}`);
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

  getTextForDOM(text?: string, componentId?: any) {
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent) {
      return parent.getTextForDOM(text, componentId);
    } else return "Error fetching parent component.";
  }

  playYoutubeVideo() {
    this.isPlayingYoutubeVideo = true;
    const videoId = (document.getElementById('youtubeVideoIdInput') as HTMLInputElement).value;
    setTimeout(() => {
      let target = document.getElementById(`youtubeIframe`) as HTMLIFrameElement;
      if (!target || !videoId) return;
      target.style.visibility = 'visible';
      target.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1`;
      setTimeout(() => {
        if (target && !this.isElementInViewport(target)) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 200);
    }, 50);
  }

  filterUniqueUsers(users: User[]): User[] {
    return users.filter((user, index, self) =>
      index === self.findIndex(u => (u.id === user.id || u.username === user.username))
    );
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
