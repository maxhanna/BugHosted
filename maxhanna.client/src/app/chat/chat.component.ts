import { Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { ChatService } from '../../services/chat.service';
import { Message } from '../../services/datacontracts/chat/message';
import { ChatNotification } from '../../services/datacontracts/chat/chat-notification';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { User } from '../../services/datacontracts/user/user';
import { AppComponent } from '../app.component';
import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, Messaging } from "firebase/messaging";
import { NotificationService } from '../../services/notification.service';
<<<<<<< HEAD
import { MediaSelectorComponent } from '../media-selector/media-selector.component';
=======
>>>>>>> 37a4811 (general fixes)

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
  @ViewChild('newMessage') newMessage!: ElementRef<HTMLInputElement>;
  @ViewChild('chatWindow') chatWindow!: ElementRef;
  @ViewChild(MediaSelectorComponent) attachmentSelector!: MediaSelectorComponent;
  hasManuallyScrolled = false;
  private pollingInterval: any;

  @Input() selectedUser?: User;
  @Input() chatId?: number;
  @Input() inputtedParentRef?: AppComponent;
  @Output() closeChatEvent = new EventEmitter<void>();

  emojiMap: { [key: string]: string } =
    {
      ":)": "😊", ":(": "☹️", ";)": "😉", ":D": "😃", "XD": "😆", ":P": "😛", ":O": "😮", "B)": "😎", ":/": "😕", ":'(": "😢", "<3": "❤️", "</3": "💔",
      ":*": "😘", "O:)": "😇", "3:)": "😈", ":|": "😐", ":$": "😳", "8)": "😎", "^_^": "😊", "-_-": "😑", ">_<": "😣", ":'D": "😂", ":3": "😺", ":v":
        "✌️", ":S": "😖", ":b": "😛", ":x": "😶", ":X": "🤐", ":Z": "😴", "*_*": "😍", ":@": "😡", ":#": "🤬", ">:(": "😠", ":&": "🤢", ":T": "😋",
      "T_T": "😭", "Q_Q": "😭", ":1": "😆", "O_O": "😳", "*o*": "😍", "T-T": "😭", ";P": "😜", ":B": "😛", ":W": "😅", ":L": "😞", ":E": "😲", ":M": "🤔",
      ":C": "😏", ":I": "🤓", ":Q": "😮", ":F": "😇", ":G": "😵", ":H": "😱", ":J": "😜", ":K": "😞", ":Y": "😮", ":N": "😒", ":U": "😕", ":V": "😈",
      ":wave:": "👋", ":ok:": "👌", ":thumbsup:": "👍", ":thumbsdown:": "👎", ":clap:": "👏", ":star:": "⭐", ":star2:": "🌟", ":dizzy:": "💫",
      ":sparkles:": "✨", ":boom:": "💥", ":fire:": "🔥", ":droplet:": "💧", ":sweat_drops:": "💦", ":dash:": "💨", ":cloud:": "☁️", ":sunny:": "☀️",
      ":umbrella:": "☂️", ":snowflake:": "❄️", ":snowman:": "⛄", ":zap:": "⚡", ":cyclone:": "🌀", ":fog:": "🌫️", ":rainbow:": "🌈", ":heart:": "❤️",
      ":blue_heart:": "💙", ":green_heart:": "💚", ":yellow_heart:": "💛", ":purple_heart:": "💜", ":black_heart:": "🖤", ":white_heart:": "🤍",
      ":orange_heart:": "🧡", ":broken_heart:": "💔", ":heartbeat:": "💓", ":heartpulse:": "💗", ":two_hearts:": "💕", ":sparkling_heart:": "💖",
      ":cupid:": "💘", ":gift_heart:": "💝", ":revolving_hearts:": "💞", ":heart_decoration:": "💟", ":peace:": "☮️", ":cross:": "✝️", ":star_and_crescent:": "☪️",
      ":om:": "🕉️", ":wheel_of_dharma:": "☸️", ":yin_yang:": "☯️", ":orthodox_cross:": "☦️", ":star_of_david:": "✡️", ":six_pointed_star:": "🔯", ":menorah:": "🕎",
      ":infinity:": "♾️", ":wavy_dash:": "〰️", ":congratulations:": "㊗️", ":secret:": "㊙️", ":red_circle:": "🔴", ":orange_circle:": "🟠", ":yellow_circle:": "🟡",
      ":green_circle:": "🟢", ":blue_circle:": "🔵", ":purple_circle:": "🟣", ":brown_circle:": "🟤", ":black_circle:": "⚫", ":white_circle:": "⚪",
      ":red_square:": "🟥", ":orange_square:": "🟧", ":yellow_square:": "🟨", ":green_square:": "🟩", ":blue_square:": "🟦", ":purple_square:": "🟪",
      ":brown_square:": "🟫", ":black_large_square:": "⬛", ":white_large_square:": "⬜", ":black_medium_square:": "◼️", ":black_medium_small_square: ": "◾",
      ":white_medium_small_square:": "◽", ":black_small_square: ": "▪️", ":white_small_square: ": "▫️", ":large_orange_diamond: ": "🔶", ":large_blue_diamond: ": "🔷",
      ":small_orange_diamond:": "🔸", ":small_blue_diamond:": "🔹", ":red_triangle_pointed_up:": "🔺", ":red_triangle_pointed_down:": "🔻", ":diamond_shape_with_a_dot_inside:": "💠",
      ":radio_button: ": "🔘", ":white_square_button: ": "🔳", ":black_square_button: ": "🔲", ":checkered_flag: ": "🏁", ":triangular_flag_on_post: ": "🚩",
      ":crossed_flags:": "🎌", ":black_flag:": "🏴", ":white_flag:": "🏳️", ":rainbow_flag:": "🏳️‍🌈", ":pirate_flag:": "🏴‍☠️"
    };

  pageNumber = 1;
  pageSize = 10;
  totalPages = 1;
  totalPagesArray: number[] = [];
  isDisplayingChatMembersPanel = false;

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
        alert(`Message received in the foreground: ${payload}`);
      }); 

      console.log('Current Notification Permission:', Notification.permission);

      if (Notification.permission === 'default') {
        // Ask for permission
        const permission = await Notification.requestPermission();
        console.log('User responded with:', permission);
        if (permission === "granted") {
          const token = await getToken(this.messaging, { vapidKey: "BOdqEEb-xWiCvKqILbKr92U6ETC3O0SmpbpAtulpvEqNMMRq79_0JidqqPgrzOLDo_ZnW3Xh7PNMwzP9uBQSCyA" });
          console.log('FCM Token:', token);
          await this.subscribeToChatTopic(token); 
        } else {
          console.log('Notification permission denied');
        }
      } else {
        console.log('Permission already:', Notification.permission);
        const token = await getToken(this.messaging, { vapidKey: "BOdqEEb-xWiCvKqILbKr92U6ETC3O0SmpbpAtulpvEqNMMRq79_0JidqqPgrzOLDo_ZnW3Xh7PNMwzP9uBQSCyA" });
        await this.subscribeToChatTopic(token);
      }  
    } catch (error) {
<<<<<<< HEAD
      //console.log('Error requesting notification permission:', error);
=======
      console.log('Error requesting notification permission:', error);
>>>>>>> 37a4811 (general fixes)
    }
  }


  private async subscribeToChatTopic(token: string) { 
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent && parent?.user?.id) {
      this.notificationService.subscribeToTopic(parent.user, token, "notification" + parent.user.id).then(res => {
        console.log(res);
      });
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
          this.getMessageHistory();
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
        this.chatHistory = [...this.chatHistory, ...newMessages];
        this.pageNumber = res.currentPage;
        if (!this.currentChatId && (res.messages[0] as Message).chatId) {
          this.currentChatId = (res.messages[0] as Message).chatId;
        }
        this.scrollToBottomIfNeeded();
      }
    } catch { }
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

  changePage(event: any) {
    this.pageNumber = +event.target.value;
    this.chatHistory = [];
    this.getMessageHistory(this.pageNumber, this.pageSize);
  }
  async openChat(users?: User[]) {
    if (!users) { return; }
    this.startLoading();
    this.isPanelExpanded = true;
    this.chatHistory = [];
    this.currentChatId = undefined;
    const user = this.parentRef?.user ? this.parentRef.user : new User(0, "Anonymous");
    this.currentChatUsers = users;
    if (!this.currentChatUsers.some(x => x.id == user.id)) {
      this.currentChatUsers.push(user);
    }
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



  closeChat() {
    this.closeChatEvent.emit();
    this.hasManuallyScrolled = false;
    this.currentChatUsers = undefined;
    this.chatHistory = [];
    this.pageNumber = 0;
    this.totalPages = 0;
    this.totalPagesArray = new Array<number>();
    clearInterval(this.pollingInterval);
    this.togglePanel();
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
      this.newMessage.nativeElement.value = '';
      const user = this.parentRef?.user ?? new User(0, "Anonymous");
      await this.chatService.sendMessage(user, chatUsers, this.currentChatId, msg, this.attachedFiles);
<<<<<<< HEAD
      this.removeAllAttachments(); 
=======
      this.attachedFiles = [];
>>>>>>> 37a4811 (general fixes)
      await this.getMessageHistory();
      this.notificationService.notifyUsers(user, chatUsers);
    } catch (error) {
      console.error(error);
    }
  }
<<<<<<< HEAD

  private removeAllAttachments() {
    this.attachedFiles = [];
    this.attachmentSelector.removeAllFiles();
  }

=======
>>>>>>> 37a4811 (general fixes)
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
      parent.showOverlay = true;
    }
  }
  closeChatMembersPanel() {
    this.isDisplayingChatMembersPanel = false;
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent) {
      parent.showOverlay = false;
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
    this.openGroupChat();
  }
}
