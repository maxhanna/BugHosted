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
import { EncryptionService } from '../../services/encryption.service';

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
  selectedUsers: User[] = []
  isEditing: number[] = [];
  showPostInput = false;
  hasManuallyScrolled = false;
  pageNumber = 1;
  pageSize = 10;
  totalPages = 1;
  totalPagesArray: number[] = [];
  isDisplayingChatMembersPanel = false;
  isMenuPanelOpen = false;
  showUserList = true;
  app?: any;
  messaging?: any;
  ghostReadEnabled = false;
  notificationsEnabled?: boolean = undefined;
  firstMessageDetails: { content: string } | null = null;
  quoteMessage = "";
  private pollingInterval: any;
  private isChangingPage = false;
  private isInitialLoad = false;
  isLoadingPreviousPage = false;
  private inviewDebounceTimeout: any;

  @ViewChild('newMessage') newMessage!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('newMessageTmpInput') newMessageTmpInput!: ElementRef<HTMLInputElement>;
  @ViewChild('chatWindow') chatWindow!: ElementRef;
  @ViewChild('changePageMenuSelect') changePageMenuSelect!: ElementRef<HTMLSelectElement>;
  @ViewChild(MediaSelectorComponent) attachmentSelector!: MediaSelectorComponent;

  @Input() selectedUser?: User;
  @Input() chatId?: number;
  @Input() inputtedParentRef?: AppComponent;
  @Output() closeChatEvent = new EventEmitter<void>();

  constructor(
    private chatService: ChatService,
    private notificationService: NotificationService,
    private userService: UserService,
    private encryptionService: EncryptionService) {
    super();

    const parent = this.inputtedParentRef ?? this.parentRef;
    parent?.addResizeListener();
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
        pageSize
      );
      if (res && res.status && res.status == "404") {
        if (this.chatHistory.length > 0) {
          this.chatHistory = [];
        }
        return;
      }
      if (res) {
        let hasChanges = false;
        const newMessages: Message[] = [];
        const updatedChatHistory = [...this.chatHistory];

        res.messages.forEach((incomingMessage: Message) => {
          const existingIndex = updatedChatHistory.findIndex(
            (existingMessage: Message) => existingMessage.id === incomingMessage.id
          );
          if (existingIndex !== -1) {
            // Update only if content or relevant fields differ
            const existing = updatedChatHistory[existingIndex];
            if (
              existing.content !== incomingMessage.content || existing.timestamp !== incomingMessage.timestamp
            ) {
              updatedChatHistory[existingIndex] = { ...incomingMessage };
              hasChanges = true;
            }
          } else {
            newMessages.push({ ...incomingMessage });
            hasChanges = true;
          }
        });

        if (hasChanges) {
          // Append new messages and sort
          this.chatHistory = [...updatedChatHistory, ...newMessages].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
          this.updateSeenStatus(res);
          if (!this.isChangingPage) {
            this.playSoundIfNewMessage(newMessages);
          }
          this.pageNumber = res.currentPage;
          if (!this.currentChatId && res.messages[0]?.chatId) {
            this.currentChatId = res.messages[0].chatId;

            if (this.firstMessageDetails) {
              const encryptedContent = this.encryptContent(this.firstMessageDetails.content);
              if (encryptedContent !== res.messages[0].content) {
                await this.chatService.editMessage(
                  res.messages[0].id,
                  user.id,
                  encryptedContent
                ).then(editRes => {
                  if (editRes) {
                    this.parentRef?.showNotification(`First message encrypted successfully.`);
                    // Refresh message history to reflect the edited message
                    this.getMessageHistory(this.pageNumber, this.pageSize);
                  } else {
                    this.parentRef?.showNotification(`Failed to encrypt first message.`);
                  }
                });
              }
              // Clear firstMessageDetails after processing
              this.firstMessageDetails = null;
            }
          }
          this.scrollToBottomIfNeeded();
        }
        this.isChangingPage = false;
        setTimeout(() => {
          // After messages load, update any poll results in DOM if the parent has poll data
          try {
            const parent = this.inputtedParentRef ?? this.parentRef;
            const anyParent: any = parent as any;
            if (anyParent && anyParent.storyResponse && anyParent.storyResponse.polls) {
              this.updateChatPollsInDOM(anyParent.storyResponse.polls);
            }
          } catch (e) {
            // ignore
          }
          this.isInitialLoad = true;
        }, 1000);
      }
    } catch (error) {
      console.error('Error fetching message history:', error);
    }
  }
  private updateSeenStatus(res: any) {
    res.messages.forEach((newMessage: Message) => {
      const existingMessage = this.chatHistory.find((msg: Message) => msg.id === newMessage.id);
      if (existingMessage) {
        existingMessage.seen = newMessage.seen;
      }
    });
  }

  updateChatPollsInDOM(polls: any[]) {
    if (!polls || polls.length === 0) return;
    for (const poll of polls) {
      try {
        if (!poll || !poll.componentId) continue;
        // chat messages may not use a consistent prefix, but many use message content without id; we'll target any element with that id
        if (!poll.componentId.startsWith('messageText') && !poll.componentId.startsWith('chatMessage')) continue;

        const tgt = document.getElementById(poll.componentId);
        if (!tgt) continue;

        let html = '<div class="pollResults">';
        html += `<div class="pollQuestion">${poll.question}</div>`;
        for (const opt of poll.options) {
          const pct = opt.percentage ?? 0;
          const votes = opt.voteCount ?? 0;
          html += `
            <div class="pollOption">
              <div class="pollOptionText">${opt.text} <span class="pollVotes">(${votes} votes, ${pct}%)</span></div>
              <div class="pollBarContainer"><div class="pollBar" style="width:${pct}%"></div></div>
            </div>`;
        }
        const hasVoted = poll.userVotes && poll.userVotes.length > 0;
        if (hasVoted) {
          html += `<div class="pollControls"><button onclick="(window as any).handlePollDeleteClicked && (window as any).handlePollDeleteClicked('${poll.componentId.replace(/[^0-9]/g, '')}', '${poll.componentId}')">Delete vote</button></div>`;
        }
        html += '</div>';
        tgt.innerHTML = html;
      } catch (ex) {
        console.warn('Error updating chat poll for', poll.componentId, ex);
        continue;
      }
    }
  // poll injection only; notification handling happens elsewhere
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
    this.isInitialLoad = false;
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
      this.isInitialLoad = true;
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
    this.firstMessageDetails = null;
    this.isPanelExpanded = true;

    const parent = this.inputtedParentRef ?? this.parentRef;
    parent?.closeOverlay();
  }

  async loadPreviousPage() {
    if (!this.isInitialLoad || this.isLoadingPreviousPage || this.pageNumber >= this.totalPages) {
      return; // Prevent loading during initial load, while already loading, or if no more pages
    }

    // Debounce to prevent rapid triggers
    if (this.inviewDebounceTimeout) {
      clearTimeout(this.inviewDebounceTimeout);
    }

    this.inviewDebounceTimeout = setTimeout(async () => {
      this.isLoadingPreviousPage = true;
      const currentScrollHeight = this.chatWindow.nativeElement.scrollHeight;
      const currentScrollTop = this.chatWindow.nativeElement.scrollTop;

      try {
        const previousPage = this.pageNumber + 1; // Load the next page (older messages)
        const res = await this.chatService.getMessageHistory(
          this.parentRef?.user?.id ?? 0,
          this.currentChatUsers!.map(x => x?.id ?? 0),
          this.currentChatId,
          previousPage,
          this.pageSize
        );

        if (res && res.messages) {
          const newMessages = (res.messages as Message[]).reverse();
          this.chatHistory = [...newMessages, ...this.chatHistory]; // Prepend new messages
          this.pageNumber = res.currentPage;
          this.totalPages = res.totalPages;
          this.totalPagesArray = Array(this.totalPages).fill(0).map((_, i) => i + 1);

          // Adjust scroll position to keep the same messages in view
          requestAnimationFrame(() => {
            const newScrollHeight = this.chatWindow.nativeElement.scrollHeight;
            this.chatWindow.nativeElement.scrollTop = currentScrollTop + (newScrollHeight - currentScrollHeight);
          });
        }
      } catch (error) {
        console.error('Error loading previous page:', error);
      } finally {
        this.isLoadingPreviousPage = false;
      }
    }, 200); // 200ms debounce
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
  safeStringify(obj: any) {
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) {
          return "[Circular]";
        }
        seen.add(value);
      }
      return value;
    });
  }

  encryptContent(msg: string) {
    try {
      return this.encryptionService.encryptContent(msg, this.currentChatId ? this.currentChatId + "" : undefined);
    } catch (error) {
      console.error('Encryption error:', error);
      return msg;
    }
  }

  decryptContent(encryptedContent: string) {
    try {
      return this.encryptionService.decryptContent(encryptedContent, this.currentChatId ? this.currentChatId + "" : undefined);
    } catch (error) {
      console.error('Decryption error:', error);
      return encryptedContent;
    }
  }

  async requestNotificationPermission() {
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (!parent?.user || !parent.user.id) {
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
      if (this.notificationsEnabled == undefined) {
        if (Notification.permission === 'default') {
          const permission = await Notification.requestPermission();
          if (permission === "granted") {
            const token = await getToken(this.messaging, { vapidKey: "BOdqEEb-xWiCvKqILbKr92U6ETC3O0SmpbpAtulpvEqNMMRq79_0JidqqPgrzOLDo_ZnW3Xh7PNMwzP9uBQSCyA" });
            await this.subscribeToNotificationTopic(token);
            this.userService.updateNotificationsEnabled(parent.user.id, true);
          } else {
            //console.log('User declined notification permission');
            this.userService.updateNotificationsEnabled(parent.user.id, false);
          }
        } else if (Notification.permission === 'granted') {
          const token = await getToken(this.messaging, { vapidKey: "BOdqEEb-xWiCvKqILbKr92U6ETC3O0SmpbpAtulpvEqNMMRq79_0JidqqPgrzOLDo_ZnW3Xh7PNMwzP9uBQSCyA" });
          await this.subscribeToNotificationTopic(token);
          this.userService.updateNotificationsEnabled(parent.user.id, true);
        } else {
          //console.log('User denied notification permission');
          this.userService.updateNotificationsEnabled(parent.user.id, false);
        }
      } else {
        //console.log("User has already enabled or disabled notifications.");
      }
    } catch (error) {
      console.log('Error requesting notification permission:', error);
    }
  }

  getTextForDOM(text?: string, componentId?: any) {
    const parent = this.inputtedParentRef ?? this.parentRef;
    return parent?.getTextForDOM(text, componentId);
  }

  filterUniqueUsers(users: User[]): User[] {
    return users.filter((user, index, self) =>
      index === self.findIndex(u => (u.id === user.id || u.username === user.username))
    );
  }

  quote(message: Message) {
    this.quoteMessage = `[Quoting {${message.sender.username}|${message.sender.id}|${message.timestamp}}: ${this.decryptContent(message.content)}] \n`;
    setTimeout(() => {
      if (this.newMessage && this.newMessage.nativeElement) {
        const input = this.newMessage.nativeElement;
        input.focus();
        const length = input.value.length;
        input.setSelectionRange(length, length);
        input.scrollTop = input.scrollHeight;
      }
    }, 50);
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
  async edit(message: Message) {
    if (!this.isEditing.some(id => id === message.id)) {
      this.isEditing.push(message.id);
    }
  }
  async stopEdit(message: Message) {
    if (this.isEditing.some(id => id === message.id)) {
      this.isEditing = this.isEditing.filter(x => x != message.id);
    }
  }
  async acceptEdit(message: Message) {
    if (this.isEditing.some(id => id === message.id)) {
      this.isEditing = this.isEditing.filter(x => x != message.id);
    }
    const tmpMessage = this.encryptContent((document.getElementById(`editTextArea${message.id}`) as HTMLTextAreaElement).value.trim());
    if (tmpMessage == message.content) {
      return;
    }
    this.chatService.editMessage(message.id, this.parentRef?.user?.id, tmpMessage).then(res => {
      if (res) {
        this.parentRef?.showNotification(`Message #${message.id} edited successfully.`);
        this.getMessageHistory();
      } else {
        this.parentRef?.showNotification(`Failed to edit message #${message.id}.`);
      }
    });
  }
  async leaveChat(chatId: number) {
    if (!this.parentRef?.user?.id) { return alert("Must be logged in."); }
    if (!confirm("Warning: This chat will be archived and only reappear if you get a new message. Proceed?")) { return; }
    this.chatService.leaveChat(this.parentRef.user.id, chatId).then(res => {
      if (res) {
        this.parentRef?.showNotification(`You've left chat#${chatId}.`);
        this.closeChat();
      }
    });
  }
  openPostInputPopup() {
    const msg = this.newMessageTmpInput.nativeElement.value;
    this.showPostInput = true;
    this.parentRef?.showOverlay();
    setTimeout(() => {
      this.newMessage.nativeElement.value = msg;
      this.newMessage.nativeElement.focus();
    }, 50);
  }
  closePostInputPopup() {
    console.log("closing post input popup");
    const msg = this.newMessage.nativeElement.value;
    this.showPostInput = false;
    this.parentRef?.closeOverlay();
    setTimeout(() => {
      this.newMessageTmpInput.nativeElement.value = msg;
    }, 50);
  }

  async chatMessagePosted(event: { results: any, originalContent: string }) {
    await this.getMessageHistory().then(x => {
      setTimeout(() => {
        this.chatWindow.nativeElement.scrollTop = this.chatWindow.nativeElement.scrollHeight;
      }, 250);
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
}
