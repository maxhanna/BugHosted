import { Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component'; 
import { ChatService } from '../../services/chat.service';
import { Message } from '../../services/datacontracts/chat/message'; 
import { ChatNotification } from '../../services/datacontracts/chat/chat-notification'; 
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { User } from '../../services/datacontracts/user/user';
import { AppComponent } from '../app.component';

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css']
})
export class ChatComponent extends ChildComponent implements OnInit, OnDestroy {
  users: Array<User> = [];
  isPanelExpanded: boolean = true;
  currentChatUser: User | undefined = undefined;
  currentChatUsers: User[] | undefined = undefined;
  chatHistory: Message[] = [];
  attachedFiles: FileEntry[] = [];
  selectedUsers: User[] = []
  @ViewChild('newMessage') newMessage!: ElementRef<HTMLInputElement>;
  @ViewChild('chatWindow') chatWindow!: ElementRef;
  hasManuallyScrolled = false;
  private pollingInterval: any;

  @Input() selectedUser?: User;
  @Input() inputtedParentRef?: AppComponent;
  @Output() closeChatEvent = new EventEmitter<void>();

  emojiMap: { [key: string]: string } =
  {
    ":)":"😊", ":(":"☹️", ";)":"😉", ":D":"😃", "XD":"😆", ":P":"😛", ":O":"😮", "B)":"😎", ":/":"😕", ":'(":"😢", "<3":"❤️", "</3":"💔",
    ":*":"😘", "O:)":"😇", "3:)":"😈", ":|":"😐", ":$":"😳", "8)":"😎", "^_^":"😊", "-_-":"😑", ">_<":"😣", ":'D":"😂", ":3":"😺", ":v":
      "✌️", ":S":"😖", ":b":"😛", ":x":"😶", ":X":"🤐", ":Z":"😴", "*_*":"😍", ":@":"😡", ":#":"🤬", ">:(":"😠", ":&":"🤢", ":T":"😋",
    "T_T":"😭", "Q_Q":"😭", ":1":"😆", "O_O":"😳", "*o*":"😍", "T-T":"😭", ";P":"😜", ":B":"😛", ":W":"😅", ":L":"😞", ":E":"😲", ":M":"🤔",
    ":C":"😏", ":I":"🤓", ":Q":"😮", ":F":"😇", ":G":"😵", ":H":"😱", ":J":"😜", ":K":"😞", ":Y":"😮", ":N":"😒", ":U":"😕", ":V":"😈",
    ":wave:":"👋", ":ok:":"👌", ":thumbsup:":"👍", ":thumbsdown:":"👎", ":clap:":"👏", ":star:":"⭐", ":star2:":"🌟", ":dizzy:":"💫",
    ":sparkles:":"✨", ":boom:":"💥", ":fire:":"🔥", ":droplet:":"💧", ":sweat_drops:":"💦", ":dash:":"💨", ":cloud:":"☁️", ":sunny:":"☀️",
    ":umbrella:":"☂️", ":snowflake:":"❄️", ":snowman:":"⛄", ":zap:":"⚡", ":cyclone:":"🌀", ":fog:":"🌫️", ":rainbow:":"🌈", ":heart:":"❤️",
    ":blue_heart:":"💙", ":green_heart:":"💚", ":yellow_heart:":"💛", ":purple_heart:":"💜", ":black_heart:":"🖤", ":white_heart:":"🤍",
    ":orange_heart:":"🧡", ":broken_heart:":"💔", ":heartbeat:":"💓", ":heartpulse:":"💗", ":two_hearts:":"💕", ":sparkling_heart:":"💖",
    ":cupid:":"💘", ":gift_heart:":"💝", ":revolving_hearts:":"💞", ":heart_decoration:":"💟", ":peace:":"☮️", ":cross:":"✝️", ":star_and_crescent:":"☪️",
    ":om:":"🕉️", ":wheel_of_dharma:":"☸️", ":yin_yang:":"☯️", ":orthodox_cross:":"☦️", ":star_of_david:":"✡️", ":six_pointed_star:":"🔯", ":menorah:":"🕎",
    ":infinity:":"♾️", ":wavy_dash:":"〰️", ":congratulations:":"㊗️", ":secret:":"㊙️", ":red_circle:":"🔴", ":orange_circle:":"🟠", ":yellow_circle:":"🟡",
    ":green_circle:":"🟢", ":blue_circle:":"🔵", ":purple_circle:":"🟣", ":brown_circle:":"🟤", ":black_circle:":"⚫", ":white_circle:":"⚪",
    ":red_square:":"🟥", ":orange_square:":"🟧", ":yellow_square:":"🟨", ":green_square:":"🟩", ":blue_square:":"🟦", ":purple_square:":"🟪",
    ":brown_square:":"🟫", ":black_large_square:":"⬛", ":white_large_square:":"⬜", ":black_medium_square:":"◼️", ":black_medium_small_square: ":"◾",
    ":white_medium_small_square:":"◽", ":black_small_square: ":"▪️", ":white_small_square: ":"▫️", ":large_orange_diamond: ":"🔶", ":large_blue_diamond: ":"🔷",
    ":small_orange_diamond:":"🔸", ":small_blue_diamond:":"🔹", ":red_triangle_pointed_up:":"🔺", ":red_triangle_pointed_down:":"🔻", ":diamond_shape_with_a_dot_inside:":"💠",
    ":radio_button: ":"🔘", ":white_square_button: ":"🔳", ":black_square_button: ":"🔲", ":checkered_flag: ":"🏁", ":triangular_flag_on_post: ":"🚩",
    ":crossed_flags:":"🎌", ":black_flag:":"🏴", ":white_flag:":"🏳️", ":rainbow_flag:":"🏳️‍🌈", ":pirate_flag:" : "🏴‍☠️"
  };

  pageNumber = 1;
  pageSize = 10;
  totalPages = 1; 
  totalPagesArray: number[] = [];


  constructor( private chatService: ChatService) {
    super();
  }

  async ngOnInit() {
    if (this.selectedUser) {
      if (this.inputtedParentRef) {
        this.parentRef = this.inputtedParentRef;
      }
      console.log("on init");
      await this.openChat(this.selectedUser);
    }
  }

  ngOnDestroy() {
    this.currentChatUser = undefined;
    clearInterval(this.pollingInterval); 
  }

  pollForMessages() {
     if (this.currentChatUser) {
      this.pollingInterval = setInterval(async () => {
        if (!this.isComponentInView()) {
          clearInterval(this.pollingInterval);
          return;
        }
        if (this.currentChatUser && this.pageNumber == 1) {
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
    if (!this.currentChatUser) return;
    try { 
      const res = await this.chatService.getMessageHistory(
        this.parentRef?.user!,
        [this.currentChatUser!],
        pageNumber,
        pageSize);
      if (res && res.status && res.status == "404") {
        this.chatHistory = [];
        return;
      }
      if (res) {
        // Concatenate new messages that are not already in chatHistory
        const newMessages = res.messages.filter((newMessage: Message) => !this.chatHistory.some((existingMessage: Message) => existingMessage.id === newMessage.id));
        this.chatHistory = [...this.chatHistory, ...newMessages];
        this.pageNumber = res.currentPage; 

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
  async openChat(user?: User) {
    if (!user) { return; }
    this.startLoading();
    console.log("loading messages");
    this.isPanelExpanded = true;
    this.chatHistory = [];
    this.currentChatUser = user;
    const res = await this.chatService.getMessageHistory(this.parentRef?.user ? this.parentRef.user : null, [this.currentChatUser], undefined, this.pageSize);

    this.getChatNotifications();
    this.stopLoading();
    if (res && res.status && res.status == "404") {
      this.chatHistory = [];
      this.togglePanel();
      return;
    }
    if (res) {
      this.chatHistory = (res.messages as Message[]).reverse();
      this.pageNumber = res.currentPage;
      this.totalPages = res.totalPages;
      this.totalPagesArray = Array(this.totalPages).fill(0).map((_, i) => i + 1);
      setTimeout(() => {
        this.scrollToBottomIfNeeded();
        this.pollForMessages();
      }, 410);
    }

    this.togglePanel();
  }

  async openGroupChat() {
    if (!this.selectedUsers || this.selectedUsers.length == 0) { return alert("You must select more than one user."); }
    this.startLoading();
    console.log("loading messages");
    this.isPanelExpanded = true;
    this.chatHistory = [];
    this.currentChatUsers = this.selectedUsers;
    const res = await this.chatService.getMessageHistory(this.parentRef?.user ? this.parentRef.user : null, this.currentChatUsers, undefined, this.pageSize);

    this.getChatNotifications();
    this.stopLoading();
    if (res && res.status && res.status == "404") {
      this.chatHistory = [];
      this.togglePanel();
      return;
    }
    if (res) {
      this.chatHistory = (res.messages as Message[]).reverse();
      this.pageNumber = res.currentPage;
      this.totalPages = res.totalPages;
      this.totalPagesArray = Array(this.totalPages).fill(0).map((_, i) => i + 1);
      setTimeout(() => {
        this.scrollToBottomIfNeeded();
        this.pollForMessages();
      }, 410);
    }

    this.togglePanel();
  }

  async getChatNotifications() { 
    if (this.parentRef?.user || this.inputtedParentRef?.user) {
      const res = await this.chatService.getChatNotifications(this.parentRef && this.parentRef.user ? this.parentRef.user : this.inputtedParentRef!.user!);
      console.log(res);
      console.log("thats chat notifs");
      if (res && res != 0 && res != "NaN") {
        if (this.parentRef) {
          this.parentRef.navigationItems.filter(x => x.title == "Chat")[0].content = res + '';
        } else {
          this.inputtedParentRef!.navigationItems.filter(x => x.title == "Chat")[0].content = res + ''; 
        }
      } else {
        if (this.parentRef) {
          this.parentRef.navigationItems.filter(x => x.title == "Chat")[0].content = '';
        } else {
          this.inputtedParentRef!.navigationItems.filter(x => x.title == "Chat")[0].content = '';
        }
      } 
    }
    
  }

  closeChat() {
    this.closeChatEvent.emit();
    this.hasManuallyScrolled = false;
    this.currentChatUser = undefined;
    this.currentChatUsers = undefined;
    this.chatHistory = [];
    this.pageNumber = 0;
    this.totalPages = 0;
    this.totalPagesArray = new Array<number>();
    clearInterval(this.pollingInterval);
    this.togglePanel();
  } 
  async sendMessage() {
    let msg = this.newMessage.nativeElement.value.trim();
    console.log("sendMessage");
    if (msg) {
      msg = this.replaceEmojisInMessage(msg);
    }
    if (msg.trim() == "" && (!this.attachedFiles || this.attachedFiles.length == 0)) {
      return alert("Message content cannot be empty.");
    }
    try {
      this.newMessage.nativeElement.value = '';
      await this.chatService.sendMessage(this.parentRef?.user!, this.currentChatUser!, msg, this.attachedFiles);
      this.attachedFiles = [];
      await this.getMessageHistory();
    } catch (error) {
      console.error(error);
    } 
  } 
  selectFile(files: FileEntry[]) { 
    this.attachedFiles = files;
  }
  userSelectClickEvent(users: User[] | undefined) {
    if (!users) this.selectedUsers = [];
    else this.selectedUsers = users; 
  }
  getCommaSeperatedGroupChatUserNames() {
    return this.currentChatUsers?.map(user => user.username).join(', ') ?? this.currentChatUser?.username;
  }
}
