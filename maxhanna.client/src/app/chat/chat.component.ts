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
    this.chatHistory = [];
    this.currentChatUser = user;
    const res = await this.chatService.getMessageHistory(this.parentRef?.user!, this.currentChatUser);
    if (res && res.status && res.status == "404") {
      this.chatHistory = [];
      return;
    }
    this.chatHistory = res;
    this.scrollToBottomIfNeeded();
    this.pollForMessages(); // Restart polling when opening a new chat
  }

  closeChat() {
    this.currentChatUser = null;
    this.chatHistory = [];
    clearInterval(this.pollingInterval);
  }

  async sendMessage() {
    const msg = this.newMessage.nativeElement.value.trim();
    if (msg) {
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
