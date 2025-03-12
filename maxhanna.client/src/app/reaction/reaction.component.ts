import { Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
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

@Component({
  selector: 'app-reaction',
  templateUrl: './reaction.component.html',
  styleUrl: './reaction.component.css'
})
export class ReactionComponent extends ChildComponent implements OnInit {
  @ViewChild('reactionFilter') reactionFilter!: ElementRef;

  reactionsDisplay = '';
  reactionCount = 0;
  showReactionChoices = false;
  showReactions = false;
  userReaction = '';
  reactionId = Math.random() * 10000000000000;
  reactions = [
    { type: 'thumbs_up', emoji: '👍', label: 'Thumbs Up' },
    { type: 'thumbs_down', emoji: '👎', label: 'Thumbs Down' },
    { type: 'heart', emoji: '❤️', label: 'Heart' },
    { type: 'broken_heart', emoji: '💔', label: 'Broken Heart' },
    { type: 'laugh', emoji: '😂', label: 'Laugh' },
    { type: 'grin', emoji: '😁', label: 'Grin' },
    { type: 'rofl', emoji: '🤣', label: 'ROFL' },
    { type: 'joy', emoji: '😆', label: 'Joy' },
    { type: 'smile', emoji: '😊', label: 'Smile' },
    { type: 'wink', emoji: '😉', label: 'Wink' },
    { type: 'hug', emoji: '🤗', label: 'Hug' },
    { type: 'kiss', emoji: '😘', label: 'Kiss' },
    { type: 'love', emoji: '😍', label: 'Love' },
    { type: 'blush', emoji: '😳', label: 'Blush' },
    { type: 'wow', emoji: '😮', label: 'Wow' },
    { type: 'surprised', emoji: '😲', label: 'Surprised' },
    { type: 'thinking', emoji: '🤔', label: 'Thinking' },
    { type: 'neutral', emoji: '😐', label: 'Neutral' },
    { type: 'smirk', emoji: '😏', label: 'Smirk' },
    { type: 'cool', emoji: '😎', label: 'Cool' },
    { type: 'angry', emoji: '😡', label: 'Angry' },
    { type: 'rage', emoji: '🤬', label: 'Rage' },
    { type: 'crying', emoji: '😭', label: 'Crying' },
    { type: 'sad', emoji: '😢', label: 'Sad' },
    { type: 'sleepy', emoji: '😴', label: 'Sleepy' },
    { type: 'shocked', emoji: '😱', label: 'Shocked' },
    { type: 'relieved', emoji: '😌', label: 'Relieved' },
    { type: 'pray', emoji: '🙏', label: 'Pray' },
    { type: 'clap', emoji: '👏', label: 'Clap' },
    { type: 'fire', emoji: '🔥', label: 'Fire' },
    { type: '100', emoji: '💯', label: '100' },
    { type: 'celebrate', emoji: '🥳', label: 'Celebrate' },
    { type: 'party', emoji: '🎉', label: 'Party' },
    { type: 'muscle', emoji: '💪', label: 'Muscle' },
    { type: 'ok_hand', emoji: '👌', label: 'OK Hand' },
    { type: 'victory', emoji: '✌️', label: 'Victory' },
    { type: 'raised_hands', emoji: '🙌', label: 'Raised Hands' },
    { type: 'wave', emoji: '👋', label: 'Wave' },
    { type: 'eyes', emoji: '👀', label: 'Eyes' },
    { type: 'sunglasses', emoji: '🕶️', label: 'Sunglasses' },
    { type: 'robot', emoji: '🤖', label: 'Robot' },
    { type: 'ghost', emoji: '👻', label: 'Ghost' },
    { type: 'alien', emoji: '👽', label: 'Alien' },
    { type: 'skull', emoji: '💀', label: 'Skull' },
    { type: 'poop', emoji: '💩', label: 'Poop' },
    { type: 'money', emoji: '🤑', label: 'Money' },
    { type: 'sick', emoji: '🤢', label: 'Sick' },
    { type: 'clown', emoji: '🤡', label: 'Clown' },
    { type: 'nerd', emoji: '🤓', label: 'Nerd' },
    { type: 'angry_swear', emoji: '😤', label: 'Swearing' },
    { type: 'scream', emoji: '😨', label: 'Scream' },
    { type: 'rolling_eyes', emoji: '🙄', label: 'Rolling Eyes' },
    { type: 'bored', emoji: '😑', label: 'Bored' },
    { type: 'vomit', emoji: '🤮', label: 'Vomit' },
    { type: 'shushing', emoji: '🤫', label: 'Shushing' },
    { type: 'salute', emoji: '🫡', label: 'Salute' },
    { type: 'headphones', emoji: '🎧', label: 'Headphones' },
    { type: 'pizza', emoji: '🍕', label: 'Pizza' },
    { type: 'taco', emoji: '🌮', label: 'Taco' },
    { type: 'hamburger', emoji: '🍔', label: 'Hamburger' },
    { type: 'cake', emoji: '🎂', label: 'Cake' },
    { type: 'beer', emoji: '🍺', label: 'Beer' },
    { type: 'coffee', emoji: '☕', label: 'Coffee' },
    { type: 'money_bag', emoji: '💰', label: 'Money Bag' },
    { type: 'lightbulb', emoji: '💡', label: 'Lightbulb' },
    { type: 'trophy', emoji: '🏆', label: 'Trophy' },
    { type: 'medal', emoji: '🎖️', label: 'Medal' },
    { type: 'basketball', emoji: '🏀', label: 'Basketball' },
    { type: 'soccer', emoji: '⚽', label: 'Soccer' },
    { type: 'car', emoji: '🚗', label: 'Car' },
    { type: 'airplane', emoji: '✈️', label: 'Airplane' },
    { type: 'rocket', emoji: '🚀', label: 'Rocket' },
    { type: 'crown', emoji: '👑', label: 'Crown' },
    { type: 'diamond', emoji: '💎', label: 'Diamond' },
    { type: 'megaphone', emoji: '📢', label: 'Megaphone' },
    { type: 'explosion', emoji: '💥', label: 'Explosion' },
    { type: 'hammer', emoji: '🔨', label: 'Hammer' },
    { type: 'sword', emoji: '⚔️', label: 'Sword' },
    { type: 'shield', emoji: '🛡️', label: 'Shield' },
    { type: 'dragon', emoji: '🐉', label: 'Dragon' },
    { type: 'skull_crossbones', emoji: '☠️', label: 'Skull & Crossbones' },
    { type: 'alien_monster', emoji: '👾', label: 'Alien Monster' },
    { type: 'infinity', emoji: '♾️', label: 'Infinity' },
    { type: 'peace', emoji: '☮️', label: 'Peace' },
    { type: 'yin_yang', emoji: '☯️', label: 'Yin Yang' }
  ]; 
  filteredReactions = [...this.reactions]; 

  @Input() component?: any;
  @Input() commentId?: number;
  @Input() storyId?: number;
  @Input() messageId?: number;
  @Input() fileId?: number;
  @Input() user?: User;
  @Input() inputtedParentRef?: AppComponent;
  @Input() showSpan: boolean = false;
  @Input() currentReactions?: Reaction[] = [];
  constructor(private reactionService: ReactionService, private notificationService: NotificationService) { super(); }

  ngOnInit() {
    this.getReactionsListDisplay();
  }

  async selectReaction(reaction: string) { 
    if (this.userHasReacted() && this.currentReactions && this.currentReactions.some(x => x.user?.id == this.inputtedParentRef?.user?.id && x.type && x.type == reaction)) {
      this.showReactionChoices = false;
      return;
    }
    let tmpReaction = new Reaction();
    tmpReaction.messageId = this.messageId;
    tmpReaction.storyId = this.storyId;
    tmpReaction.commentId = this.commentId;
    tmpReaction.fileId = this.fileId;
    tmpReaction.user = this.user ?? new User(0, "Anonymous");
    tmpReaction.type = reaction;
    tmpReaction.timestamp = new Date();

    const res = await this.reactionService.addReaction(tmpReaction).then(res => {
      if (res) {
        tmpReaction.id = parseInt(res);
      
        this.currentReactions = this.currentReactions?.filter(x => x.user?.id != (this.user?.id ?? 0));
         
        if (!this.currentReactions) {
          this.currentReactions = [];
        }
        this.currentReactions.unshift(tmpReaction);
        this.getReactionsListDisplay();
      }
    });
   
    this.sendNotification();
    this.showReactionChoices = false;
    if (this.inputtedParentRef) {
      if (this.showReactionChoices) {
        this.inputtedParentRef.showOverlay();
      } else {
        this.inputtedParentRef.closeOverlay(); 
      } 
    }
    this.userReaction = reaction;
  }
  private sendNotification() {
    console.log("sendNotification");
    const fromUser = this.user ?? new User(0, "Anonymous");
    let targetNotificationUsers: User[] = [];
    let notificationData: any = { fromUser, message: `New reaction from ${fromUser.username}` };

    if (this.fileId && (this.component as FileEntry).user?.id !== 0) {
      targetNotificationUsers = [(this.component as FileEntry).user!];
      notificationData = { ...notificationData, toUser: targetNotificationUsers, fileId: this.fileId };
    } else if (this.storyId) {
      targetNotificationUsers = [(this.component as Story).user];
      notificationData = { ...notificationData, toUser: targetNotificationUsers, storyId: this.storyId };
    } else if (this.commentId) {
      targetNotificationUsers = [(this.component as FileComment).user];
      notificationData = { ...notificationData, toUser: targetNotificationUsers, commentId: this.commentId };
    } else if (this.messageId) {
      const sender = (this.component as Message).sender;
      targetNotificationUsers = [sender];
      notificationData = { ...notificationData, toUser: targetNotificationUsers, chatId: (this.component).chatId };
    }
    if (targetNotificationUsers.length > 0) {
      this.notificationService.createNotifications(notificationData);
    }
  }

  getReactionsListDisplay() {
    if (this.currentReactions && this.currentReactions.length > 0) {
      this.reactionCount = this.currentReactions.length;
      this.reactionsDisplay = this.currentReactions.map(x => this.replaceReactionType(x.type)).join(',');
      const foundReaction = this.currentReactions.find(x => (x.user?.id ?? 0) === (this.user?.id ?? 0));
      if (foundReaction) {
        this.userReaction = foundReaction.type ?? '';
      }
    }
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
    console.log("closed");
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


  showReactionsOnClick() {
    this.showReactions = true;
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
  replaceReactionType(type?: string) {
    if (type) {
      const t = type.toLowerCase();
      const reaction = this.reactions.find(r => r.type === t);
      return reaction ? reaction.emoji : '';
    }
    return '';
  }

  userHasReacted(): boolean {
    if (this.currentReactions) {
      return this.currentReactions!.some(reaction => (reaction.user?.id ?? 0) === (this.user?.id ?? 0));
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
  cancelClick(event: Event) {
    this.showReactionChoices = false;
    this.showReactions = false;
    event.stopPropagation();
  }
  searchForReaction() {
    const lowerSearch = this.reactionFilter.nativeElement.value.toLowerCase().trim();
    this.filteredReactions = this.reactions.filter(reaction =>
      reaction.label.toLowerCase().includes(lowerSearch) ||
      reaction.type.toLowerCase().includes(lowerSearch)
    );
  }
}
