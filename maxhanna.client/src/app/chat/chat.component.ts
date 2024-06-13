import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { UserService } from '../../services/user.service';
import { ChatService } from '../../services/chat.service';
import { Message } from '../../services/datacontracts/message';
import { User } from '../../services/datacontracts/user';
import { ChatNotification } from '../../services/datacontracts/chat-notification';

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css']
})
export class ChatComponent extends ChildComponent implements OnInit, OnDestroy {
  users: Array<User> = [];
  isPanelExpanded: boolean = true;
  currentChatUser: User | null = null;
  chatHistory: Message[] = [];
  @ViewChild('newMessage') newMessage!: ElementRef<HTMLInputElement>;
  @ViewChild('chatWindow') chatWindow!: ElementRef;
  hasManuallyScrolled = false;
  private pollingInterval: any;
  private chatInfoInterval: any;

  notifications: ChatNotification[] = [];
  emojiMap: { [key: string]: string } =
    { ":)": "😊", ":(": "☹️", ";)": "😉", ":D": "😃", "XD": "😆", ":P": "😛", ":O": "😮", "B)": "😎", ":/": "😕", ":'(": "😢", "<3": "❤️", "</3": "💔", ":*": "😘", "O:)": "😇", "3:)": "😈", ":|": "😐", ":$": "😳", "8)": "😎", "^_^": "😊", "-_-": "😑", ">_<": "😣", ":'D": "😂", ":3": "😺", ":v": "✌️", ":S": "😖", ":b": "😛", ":x": "😶", ":X": "🤐", ":Z": "😴", "*_*": "😍", ":@": "😡", ":#": "🤬", ">:(": "😠", ":&": "🤢", ":T": "😋", "T_T": "😭", "Q_Q": "😭", ":1": "😆", "O_O": "😳", "*o*": "😍", "T-T": "😭", ";P": "😜", ":B": "😛", ":W": "😅", ":L": "😞", ":E": "😲", ":M": "🤔", ":C": "😏", ":I": "🤓", ":Q": "😮", ":F": "😇", ":G": "😵", ":H": "😱", ":J": "😜", ":K": "😞", ":Y": "😮", ":N": "😒", ":U": "😕", ":V": "😈", ":wave:": "👋", ":ok:": "👌", ":thumbsup:": "👍", ":thumbsdown:": "👎", ":clap:": "👏", ":star:": "⭐", ":star2:": "🌟", ":dizzy:": "💫", ":sparkles:": "✨", ":boom:": "💥", ":fire:": "🔥", ":droplet:": "💧", ":sweat_drops:": "💦", ":dash:": "💨", ":cloud:": "☁️", ":sunny:": "☀️", ":umbrella:": "☂️", ":snowflake:": "❄️", ":snowman:": "⛄", ":zap:": "⚡", ":cyclone:": "🌀", ":fog:": "🌫️", ":rainbow:": "🌈", ":heart:": "❤️", ":blue_heart:": "💙", ":green_heart:": "💚", ":yellow_heart:": "💛", ":purple_heart:": "💜", ":black_heart:": "🖤", ":white_heart:": "🤍", ":orange_heart:": "🧡", ":broken_heart:": "💔", ":heartbeat:": "💓", ":heartpulse:": "💗", ":two_hearts:": "💕", ":sparkling_heart:": "💖", ":cupid:": "💘", ":gift_heart:": "💝", ":revolving_hearts:": "💞", ":heart_decoration:": "💟", ":peace:": "☮️", ":cross:": "✝️", ":star_and_crescent:": "☪️", ":om:": "🕉️", ":wheel_of_dharma:": "☸️", ":yin_yang:": "☯️", ":orthodox_cross:": "☦️", ":star_of_david:": "✡️", ":six_pointed_star:": "🔯", ":menorah:": "🕎", ":infinity:": "♾️", ":wavy_dash:": "〰️", ":congratulations:": "㊗️", ":secret:": "㊙️", ":red_circle:": "🔴", ":orange_circle:": "🟠", ":yellow_circle:": "🟡", ":green_circle:": "🟢", ":blue_circle:": "🔵", ":purple_circle:": "🟣", ":brown_circle:": "🟤", ":black_circle:": "⚫", ":white_circle:": "⚪", ":red_square:": "🟥", ":orange_square:": "🟧", ":yellow_square:": "🟨", ":green_square:": "🟩", ":blue_square:": "🟦", ":purple_square:": "🟪", ":brown_square:": "🟫", ":black_large_square:": "⬛", ":white_large_square:": "⬜", ":black_medium_square:": "◼️", ": black_medium_small_square: ": "◾", ": white_medium_small_square: ": "◽", ": black_small_square: ": "▪️", ": white_small_square: ": "▫️", ": large_orange_diamond: ": "🔶", ": large_blue_diamond: ": "🔷", ": small_orange_diamond: ": "🔸", ": small_blue_diamond: ": "🔹", ": red_triangle_pointed_up: ": "🔺", ": red_triangle_pointed_down: ": "🔻", ": diamond_shape_with_a_dot_inside: ": "💠", ": radio_button: ": "🔘", ": white_square_button: ": "🔳", ": black_square_button: ": "🔲", ": checkered_flag: ": "🏁", ": triangular_flag_on_post: ": "🚩", ": crossed_flags: ": "🎌", ": black_flag: ": "🏴", ": white_flag: ": "🏳️", ": rainbow_flag: ": "🏳️‍🌈", ": pirate_flag: ": "🏴‍☠️"};

  constructor(private userService: UserService, private chatService: ChatService) {
    super();
  }

  async ngOnInit() {
    this.getChatInfo();
    this.users = await this.userService.getAllUsers(this.parentRef?.user!);
    this.chatInfoInterval = setInterval(() => this.getChatInfo(), 30 * 1000); // every 30 seconds
  }

  ngOnDestroy() {
    this.currentChatUser = null;
    clearInterval(this.pollingInterval);
    clearInterval(this.chatInfoInterval);
  }
  async getChatInfo() {
    this.notifications = await this.chatService.getChatNotificationsByUser(this.parentRef?.user!);
  }
  pollForMessages() {
    if (this.currentChatUser) {
      this.pollingInterval = setInterval(async () => {
        if (!this.isComponentInView()) {
          clearInterval(this.pollingInterval);
          return;
        }
        try {
          const res = await this.chatService.getMessageHistory(this.parentRef?.user!, this.currentChatUser);
          if (res && res.status && res.status == "404") {
            this.chatHistory = [];
            return;
          }
          this.chatHistory = res;
          this.scrollToBottomIfNeeded();
        } catch { }
      }, 5000);
    }
  }

  scrollToBottomIfNeeded() {
    setTimeout(() => {
      if (this.chatWindow) {
        const chatWindow = this.chatWindow.nativeElement;
        if (!this.hasManuallyScrolled) {
          chatWindow.scrollTop = chatWindow.scrollHeight;
        }
      }
    }, 1);
  }

  onScroll() {
    if (this.chatWindow) {
      const chatWindow = this.chatWindow.nativeElement;
      const isScrolledToBottom = chatWindow.scrollHeight - chatWindow.clientHeight <= chatWindow.scrollTop + 1;
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

  async openChat(user: User | null) {
    if (!user) { return; }

    this.isPanelExpanded = true;
    this.chatHistory = [];
    this.currentChatUser = user;
    if (this.notifications) {
      const numberOfNotifs = this.notifications.filter(x => x.senderId == user.id).length;
      const numberOfNotifTotal = parseInt(this.parentRef!.navigationItems.filter(x => x.title == "Chat")[0].content!) ?? 0;
      const grantTotal = numberOfNotifTotal - numberOfNotifs;
      this.notifications = this.notifications.filter(x => x.senderId != user.id);
      this.parentRef!.navigationItems.filter(x => x.title == "Chat")[0].content = (grantTotal == 0 ? '' : grantTotal + '');
    }
    const res = await this.chatService.getMessageHistory(this.parentRef?.user!, this.currentChatUser);
    if (res && res.status && res.status == "404") {
      this.chatHistory = [];
      this.togglePanel();
      return;
    }
    this.chatHistory = res;
    this.scrollToBottomIfNeeded();
    this.pollForMessages(); // Restart polling when opening a new chat
    this.togglePanel();
  }

  closeChat() {
    this.currentChatUser = null;
    this.chatHistory = [];
    clearInterval(this.pollingInterval);
    this.togglePanel();
  }

  replaceEmojisInMessage(msg: string) {
    const escapedKeys = Object.keys(this.emojiMap).map(key => key.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'));
    const regex = new RegExp(escapedKeys.join("|"), "g");

    return msg.replace(regex, match => this.emojiMap[match]);
  }

  async sendMessage() {
    let msg = this.newMessage.nativeElement.value.trim();

    if (msg) {
      msg = this.replaceEmojisInMessage(msg);
      try {
        var newMsg = new Message(0, this.parentRef?.user!, this.currentChatUser!, msg, new Date());
        this.chatHistory.push(newMsg);
        this.newMessage.nativeElement.value = '';
        this.scrollToBottomIfNeeded();
        await this.chatService.sendMessage(this.parentRef?.user!, this.currentChatUser!, msg);
      } catch (error) {
        console.error(error);
      }
    }
  }
}
