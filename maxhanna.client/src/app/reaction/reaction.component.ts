import { ChangeDetectionStrategy, Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { ReactionService } from '../../services/reaction.service';
import { User } from '../../services/datacontracts/user/user';
import { Reaction } from '../../services/datacontracts/reactions/reaction';
import { AppComponent } from '../app.component';
import { NotificationService } from '../../services/notification.service';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { Story } from '../../services/datacontracts/social/story';
import { FileComment } from '../../services/datacontracts/file/file-comment';
import { Message } from '../../services/datacontracts/chat/message';
import { ChildComponent } from '../child.component';
import { UserEventService } from '../../services/user-event.service';

@Component({
  selector: 'app-reaction',
  templateUrl: './reaction.component.html',
  styleUrl: './reaction.component.css',
  standalone: false
})
export class ReactionComponent extends ChildComponent implements OnInit {
  @ViewChild('reactionFilter') reactionFilter!: ElementRef;

  reactionsDisplay: Reaction[] = [];
  filteredCurrentReactions: Reaction[] = [];
  reactionCount = 0;
  showReactionChoices = false;
  showReactions = false;
  reactionLoading = false;
  userReaction = '';
  reactionId = Math.random() * 10000000000000;
  get reactions() : {type : string, emoji: string, label: string}[] { 
    let reac = [];
    for (let emoKey of Object.keys(this.parentRef?.emojiMap ?? [])) {
      reac.push({ type: emoKey.replace(':', ''), emoji: this.parentRef?.emojiMap[emoKey] ?? '', label: emoKey.replace(':', '').replace('_', ' ') })
    }
    return reac || []; 
  };
 
  filteredReactions = [...this.reactions];

  @Input() component?: any;
  @Input() commentId?: number;
  @Input() storyId?: number;
  @Input() messageId?: number;
  @Input() fileId?: number;
  @Input() user?: User;
  @Input() inputtedParentRef?: AppComponent;
  @Input() userProfileId?: number;
  @Input() showSpan: boolean = false;
  @Input() showSpanBorder: boolean = false;
  @Input() currentReactions?: Reaction[] = [];
  @Input() coloredBg = true;
  constructor(private reactionService: ReactionService, 
    private notificationService: NotificationService, 
    private userEventService: UserEventService) {
    super(); 
  }

  ngOnInit() {
    if (!this.currentReactions || this.currentReactions.length === 0) {
      // Only load file reactions if this is a file-level reaction (not a comment/story/message)
      if (this.fileId && !this.commentId && !this.storyId && !this.messageId) {
        this.loadReactions();
      }
    }
    this.getReactionsListDisplay();
  }

  private async loadReactions() {
    try {
      const res = await fetch('/file/getfilereactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.fileId),
      });
      if (res.ok) {
        const data = await res.json();
        this.currentReactions = data || [];
        this.getReactionsListDisplay();
      }
    } catch (e) {
      console.error('Failed to load reactions', e);
    }
  }

  async deleteReaction(reaction: Reaction) {
    if (!reaction || !reaction.id) return;
    if (!confirm('Delete your reaction?')) return;
    const res: any = await this.reactionService.deleteReaction(reaction.id, this.user?.id ?? 0);
    if (res === true || res === 'true') {
      const newList = this.currentReactions?.filter(r => r.id !== reaction.id) ?? [];
      this.currentReactions = newList;
      this.filteredCurrentReactions = newList;
    } else {
      this.notificationService.createNotifications({ fromUserId: this.user?.id ?? 0, message: 'Could not delete reaction', toUserIds: [] });
    }
  }

  async selectReaction(reaction: string) {
    if (this.reactionLoading) return;
    if (this.userHasReacted() && this.currentReactions && this.currentReactions.some(x => x.user?.id == this.inputtedParentRef?.user?.id && x.type && x.type == reaction)) {
      this.parentRef?.showNotification("Cannot react the same way twice.");
      return;
    }
    this.reactionLoading = true;
    let tmpReaction = new Reaction();
    tmpReaction.userProfileId = this.userProfileId;
    // Only set the ID for the entity type this reaction is targeting — prevent cross-entity leaks
    if (this.commentId) {
      tmpReaction.commentId = this.commentId;
      tmpReaction.fileId = undefined;
      tmpReaction.storyId = undefined;
      tmpReaction.messageId = undefined;
    } else if (this.storyId) {
      tmpReaction.storyId = this.storyId;
      tmpReaction.commentId = undefined;
      tmpReaction.fileId = undefined;
      tmpReaction.messageId = undefined;
    } else if (this.messageId) {
      tmpReaction.messageId = this.messageId;
      tmpReaction.commentId = undefined;
      tmpReaction.fileId = undefined;
      tmpReaction.storyId = undefined;
    } else if (this.fileId) {
      tmpReaction.fileId = this.fileId;
      tmpReaction.commentId = undefined;
      tmpReaction.storyId = undefined;
      tmpReaction.messageId = undefined;
    }
    tmpReaction.user = this.user ?? new User(0, "Anonymous");
    tmpReaction.type = reaction;
    tmpReaction.timestamp = new Date();

    const res = await this.reactionService.addReaction(tmpReaction);
    if (res) {
      tmpReaction.id = parseInt(res);
      const newList = [tmpReaction, ...(this.currentReactions ?? [])];
      this.currentReactions = newList;
      this.getReactionsListDisplay();
    } 
    await this.userEventService.insertUserEvent((this.user?.id ?? 0), 'reaction_added', `${reaction} Reaction`,
      this.userProfileId ?? this.storyId ?? this.fileId ?? this.commentId);

    this.sendNotification();
    this.showReactionChoices = false;
    if (this.inputtedParentRef) {
      this.inputtedParentRef.closeOverlay();
    }
    this.userReaction = reaction;
    this.reactionLoading = false;
  }
  private sendNotification() {
    const fromUser = this.user ?? new User(0, "Anonymous");
    let targetNotificationUserIds: number[] = [];
    let notificationData: any = {
      fromUserId: fromUser.id,
      commentId: this.commentId,
      storyId: this.storyId,
      fileId: this.component.fileId ?? this.fileId,
      chatId: this.messageId ? (this.component as Message).chatId : undefined,
      message: `New reaction from ${fromUser.username}`,
      userProfileId: this.userProfileId,
    };

    console.log("Sending notification for component:", this.component, this.commentId, this.storyId, this.messageId, this.fileId);

    if (this.commentId) {
      targetNotificationUserIds = [(this.component as FileComment).user?.id ?? 0];
      notificationData = { ...notificationData, toUserIds: targetNotificationUserIds };
    } else if (this.storyId) {
      targetNotificationUserIds = [(this.component as Story).user?.id ?? 0];
      notificationData = { ...notificationData, toUserIds: targetNotificationUserIds };
    } else if (this.messageId) {
      const sender = (this.component as Message).sender;
      targetNotificationUserIds = [sender.id ?? 0];
      notificationData = { ...notificationData, toUserIds: targetNotificationUserIds };
    } else if (this.fileId && (this.component as FileEntry).user?.id !== 0) {
      targetNotificationUserIds = [(this.component as FileEntry).user?.id!];
      notificationData = { ...notificationData, toUserIds: targetNotificationUserIds };
    }
    if (targetNotificationUserIds.length > 0) {
      this.notificationService.createNotifications(notificationData);
    }
  }

  getReactionsListDisplay() { 
    if (this.currentReactions && this.currentReactions.length > 0) {
      this.reactionCount = this.currentReactions.length;
      this.reactionsDisplay = [];
      for (const react of this.currentReactions) {
        if (!this.reactionsDisplay.some(x => x.type === react.type)) {
          this.reactionsDisplay.push(react);
        }
      }
      const foundReaction = this.currentReactions.find(x => (x.user?.id ?? 0) === (this.user?.id ?? 0));
      if (foundReaction) {
        this.userReaction = foundReaction.type ?? '';
      }
    } 
    return [...this.reactions]; 
  }
  reactionDisplayOnClick() {
    this.showReactionChoices = !this.showReactionChoices;
    if (this.inputtedParentRef) {
      if (!this.showReactionChoices) {
        this.inputtedParentRef.closeOverlay();
      } else {
        this.inputtedParentRef.showOverlay();
      }
    }
  }


  closeReactionDisplay() {
    this.showReactionChoices = false;
    if (this.inputtedParentRef) {
      this.inputtedParentRef.closeOverlay();
    }
  }

  hideReactionChoicesDiv = () => {
    const reactionChoicesDiv = document.getElementById('reactionChoicesDiv') as HTMLDivElement;
    if (reactionChoicesDiv) {
      reactionChoicesDiv.style.display = 'none'; // Hide the div
    }
    window.removeEventListener('scroll', this.hideReactionChoicesDiv);
  };

  reactionButtonOnClick(event: Event) {
    this.showReactionChoices = true;
    if (this.inputtedParentRef) {
      this.inputtedParentRef.showOverlay();
    }
    event.stopPropagation();
  }
  showReactionsOnClick() {
    if (!this.reactionCount) return;
    this.showReactions = true;
    this.filteredCurrentReactions = this.currentReactions ?? [];
    if (this.inputtedParentRef) {
      this.inputtedParentRef.showOverlay();
    }
  }
  closeReactionsPanel() {
    this.showReactions = false;

    if (this.inputtedParentRef) {
      this.inputtedParentRef.closeOverlay();
    }
  }

  getReactionCount(type?: string) {
    if (!type || !this.currentReactions) return 0;
    return this.currentReactions.filter(r => r.type === type).length;
  }
  replaceReactionType(type?: string) {
    //console.log("Replacing reaction type:", type);
    if (type) {
      const t = type.toLowerCase();
      const reaction = this.reactions.find(r => r.type === t);
      //console.log("Found reaction:", reaction);
      return reaction ? reaction.emoji : '';
    }
    //console.log("No reaction type provided, returning empty string.");
    return '';
  }

  replaceReactionLabel(type?: string) {
    //console.log("Replacing reaction type:", type);
    if (type) {
      const t = type.toLowerCase();
      const reaction = this.reactions.find(r => r.type === t);
      //console.log("Found reaction:", reaction);
      return reaction ? reaction.label : '';
    }
    //console.log("No reaction type provided, returning empty string.");
    return '';
  }

  userHasReacted(): boolean {
    if (this.currentReactions) {
      const user = this.user ?? this.inputtedParentRef?.user;
      return this.currentReactions!.some(reaction => (reaction.user?.id ?? 0) === (user?.id ?? 0));
    }
    return false;
  }
  getUserReaction(): string {
    if (this.currentReactions) {
      const react = this.currentReactions.find(reaction => (reaction.user?.id ?? 0) === (this.user?.id ?? 0));
      return this.replaceReactionType(react?.type ?? "");
    }
    return '';
  }
  get reactionButtonTitle(): string {
    const acted = this.userHasReacted();

    if (acted) {
      return `Change Reaction (${this.replaceReactionLabel(this.userReaction)})`;
    } else {
      return 'Add Reaction';
    }
  }
  searchForReaction() {
    const lowerSearch = this.reactionFilter.nativeElement.value.toLowerCase().trim();
    this.filteredReactions = this.reactions.filter(reaction =>
      reaction.label.toLowerCase().includes(lowerSearch) ||
      reaction.type.toLowerCase().includes(lowerSearch)
    );
  }
  getReactionSummary() {
    const summary: { [key: string]: number } = {};
    this.currentReactions?.forEach((reaction: Reaction) => {
      if (reaction.type) {
        summary[reaction.type] = (summary[reaction.type] || 0) + 1;
      }
    });
    return Object.entries(summary).map(([type, count]) => ({ type, count }));
  }
  filterByReactionType(type: string) {
    // Toggle filter: if already filtered by this type, reset; otherwise, filter
    if (
      this.filteredCurrentReactions.length === this.currentReactions?.filter(r => r.type === type).length &&
      this.filteredCurrentReactions.every(r => r.type === type)
    ) {
      this.filteredCurrentReactions = this.currentReactions ?? [];
    } else {
      this.filteredCurrentReactions = this.currentReactions?.filter(reaction => reaction.type === type) ?? [];
    }
  }
  get activeSummaryType(): string | null {
    if (
      this.filteredCurrentReactions.length > 0 &&
      this.filteredCurrentReactions.every(r => r.type === this.filteredCurrentReactions[0].type)
    ) {
      return this.filteredCurrentReactions[0].type ?? null;
    }
    return null;
  }
}
