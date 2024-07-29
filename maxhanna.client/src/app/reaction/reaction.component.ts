import { Component, Input, OnInit } from '@angular/core';
import { ReactionService } from '../../services/reaction.service'; 
import { User } from '../../services/datacontracts/user/user';
import { Reaction } from '../../services/datacontracts/reactions/reaction';

@Component({
  selector: 'app-reaction',
  templateUrl: './reaction.component.html',
  styleUrl: './reaction.component.css'
})
export class ReactionComponent implements OnInit {

  reactionsDisplay = ''; 
  reactionCount = 0;
  showReactionChoices = false;
  showReactions = false;
  userReaction = '';

  reactions = [
    { type: 'thumbs_up', emoji: '👍', label: 'Thumbs Up' },
    { type: 'heart', emoji: '❤️', label: 'Heart' },
    { type: 'laugh', emoji: '😂', label: 'Laugh' },
    { type: 'wow', emoji: '😮', label: 'Wow' },
    { type: 'sad', emoji: '😢', label: 'Sad' },
    { type: 'angry', emoji: '😡', label: 'Angry' },
    { type: 'thumbs_down', emoji: '👎', label: 'Thumbs Down' }
  ];

  @Input() commentId?: number; 
  @Input() storyId?: number;
  @Input() messageId?: number;
  @Input() fileId?: number;
  @Input() user?: User;
  @Input() currentReactions?: Reaction[] = [];
  constructor(private reactionService: ReactionService) { }

  ngOnInit() {
    this.getReactionsListDisplay();
  }
   
  async selectReaction(reaction: string) {
    if (this.userHasReacted() && this.currentReactions && this.currentReactions.some(x => x.type && x.type == reaction)) {
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

    const res = await this.reactionService.addReaction(tmpReaction);
    if (res && res.toLowerCase().includes('success')) {
      if (!this.user || this.user.id == 0) {
        this.currentReactions = this.currentReactions?.filter(x => x.user?.id != 0); 
      } else {
        this.currentReactions = this.currentReactions?.filter(x => x.user?.id != this.user?.id); 
      }
      if (!this.currentReactions)
        this.currentReactions = [];
      this.currentReactions.unshift(tmpReaction);
      this.getReactionsListDisplay();
    }
    this.showReactionChoices = false;
    this.userReaction = reaction;
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
  }
  showReactionsOnClick() {
    this.showReactions = !this.showReactions;
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
}
