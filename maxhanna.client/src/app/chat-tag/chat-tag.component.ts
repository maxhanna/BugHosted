import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { AppComponent } from '../app.component';
import { ChildComponent } from '../child.component';
import { ChatService } from '../../services/chat.service';
import { PublicChatInfo } from '../../services/datacontracts/moderator/moderator';

@Component({
  selector: 'app-chat-tag',
  templateUrl: './chat-tag.component.html',
  styleUrl: './chat-tag.component.css',
  standalone: false
})
export class ChatTagComponent extends ChildComponent implements OnInit {
  @Input() chatId?: number;
  @Input() chat?: PublicChatInfo;
  @Input() inputtedParentRef?: AppComponent;
  @Input() displayMiniTag = false;
  @Input() displayHoverPicture = false;
  @Input() preventOpen = false;
  @Input() hideName = false;
  @Input() openInNewTab: boolean = false;
  @Output() chatLoaded = new EventEmitter<PublicChatInfo>();

  isHovering = false;
  hoverTimer: any;

  constructor(private chatService: ChatService) { super(); }

  async ngOnInit() {
    this.parentRef = this.inputtedParentRef;
    if (!this.chat && this.chatId) {
      const info = await this.chatService.getChatRoom(this.chatId);
      if (info && info.chatId) {
        this.chat = info;
        this.chatLoaded.emit(this.chat);
      }
    }
  }

  onChatTagHover(event: MouseEvent) {
    if (!this.chatId || !this.displayHoverPicture) return;
    this.isHovering = true;

    const btn = document.getElementById("showChatTagButton");
    const inputX = document.getElementById("showChatTagX") as HTMLInputElement;
    const inputY = document.getElementById("showChatTagY") as HTMLInputElement;
    (document.getElementById("showChatTagChatId") as HTMLInputElement).value = this.chatId?.toString() || "0";

    let newX = event.clientX + 150;
    let newY = event.clientY + 30;
    const tagWidth = 220;
    const tagHeight = 110;
    const offset = 5;

    if (newX + tagWidth > window.innerWidth) {
      newX = event.clientX - tagWidth;
    }
    if (newY + tagHeight > window.innerHeight) {
      newY = event.clientY - tagHeight - offset;
    }
    if (newX < 0) newX = offset;
    if (newY < 0) newY = offset;

    if (btn) {
      inputX.value = newX.toString();
      inputY.value = newY.toString();
      btn.click();
    } else {
      console.warn('DOM elements for chat tag not found');
    }

    clearTimeout(this.hoverTimer);
    this.hoverTimer = setTimeout(() => {
      if (!this.isHovering) {
        this.onChatTagLeave();
      }
    }, 1000);
  }

  onChatTagLeave() {
    if (!this.chatId) return;

    setTimeout(() => {
      this.isHovering = false;
      clearTimeout(this.hoverTimer);
      const btn = document.getElementById("hideChatTagButton");
      if (btn) {
        btn.click();
      }
    }, 500);
  }

  onChatTagClick(event: MouseEvent) {
    if (this.preventOpen) return;

    const id = this.chatId ?? this.chat?.chatId ?? 0;

    if (this.openInNewTab) {
      if (id && id !== 0) {
        const url = `https://bughosted.com/Chat/${id}`;
        try {
          window.open(url, '_blank', 'noopener');
        } catch (e) {
          window.location.href = url;
        }
      }
      return;
    }

    this.parentRef?.createComponent("Chat", { chatId: id });
  }
}
