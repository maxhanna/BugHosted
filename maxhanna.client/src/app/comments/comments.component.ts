import { Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { AppComponent } from '../app.component';
import { CommentService } from '../../services/comment.service';
import { ChildComponent } from '../child.component';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { User } from '../../services/datacontracts/user/user';
import { FileComment } from '../../services/datacontracts/file/file-comment';
import { NotificationService } from '../../services/notification.service';
import { MediaSelectorComponent } from '../media-selector/media-selector.component';
import { ChatService } from '../../services/chat.service';
import { EncryptionService } from '../../services/encryption.service';
import { TextToSpeechService } from '../../services/text-to-speech.service';

@Component({
  selector: 'app-comments',
  templateUrl: './comments.component.html',
  styleUrl: './comments.component.css',
  standalone: false
})
export class CommentsComponent extends ChildComponent implements OnInit {
  showCommentLoadingOverlay = false;
  isOptionsPanelOpen = false;
  optionsComment: FileComment | undefined;
  editingComments: number[] = []
  selectedFiles: FileEntry[] = [];
  minimizedComments: Set<number> = new Set<number>();
  commentCount = 0;
  activeCommentId: number | null = null;
  breadcrumbComments: FileComment[] = [];
  originalCommentList: FileComment[] = [];
  activeBreadcrumbCommentId: number | null = null;

  @ViewChild('addCommentInput') addCommentInput!: ElementRef<HTMLInputElement>;
  @ViewChild('subCommentComponent') subCommentComponent!: CommentsComponent;
  @ViewChild('commentInputAreaMediaSelector') commentInputAreaMediaSelector!: MediaSelectorComponent;

  @Input() inputtedParentRef?: AppComponent;
  @Input() commentList: FileComment[] = [];
  @Input() showComments = false;
  @Input() showCommentsHeader = true;
  @Input() type: "" | "Social" | "File" | "Comment" = "";
  @Input() quoteMessage = "";
  @Input() component_id: number = 0;
  @Input() component: any = undefined;
  @Input() comment_id?: number = undefined;
  @Input() userProfile?: User = undefined;
  @Input() automaticallyShowSubComments = true;
  @Input() canReply = true;
  @Input() depth = 0;
  @Input() replyingToCommentId?: number;
  @Output() commentAddedEvent = new EventEmitter<FileComment>();
  @Output() commentRemovedEvent = new EventEmitter<FileComment>();
  @Output() commentHeaderClickedEvent = new EventEmitter<boolean>(this.showComments);
  @Output() subCommentCountUpdatedEvent = new EventEmitter<any>();
  @Output() quoteMessageEvent = new EventEmitter<string>();
  @Output() replyingToCommentEvent = new EventEmitter<number>();
  @Output() togglingSubComments = new EventEmitter<number>();

  constructor(
    private commentService: CommentService,
    private encryptionService: EncryptionService,
    private textToSpeechService: TextToSpeechService) {
    super();
    if (!this.inputtedParentRef && this.parentRef) {
      this.inputtedParentRef = this.parentRef;
    }
  }

  ngOnInit() {
    this.clearSubCommentsToggled();
  }

  override viewProfile(user: User) {
    this.parentRef = this.inputtedParentRef;
    super.viewProfile(user);
  }

  async deleteComment(comment: FileComment) {
    if (!confirm("Are you sure?")) { return };

    this.showCommentLoadingOverlay = true;
    this.commentList = this.commentList.filter(x => x.id != comment.id);
    this.deleteCommentAsync(comment);
    this.showCommentLoadingOverlay = false;
    this.closeOptionsPanel();
  }

  async deleteCommentAsync(comment: FileComment) {
    const parent = this.inputtedParentRef ?? this.parentRef;
    const user = parent?.user;
    if (!user?.id || !parent) { return alert("You must be logged in to delete a comment!"); }
    parent.updateLastSeen();
    const res = await this.commentService.deleteComment(user.id, comment.id);
    if (res) {
      this.commentList = this.commentList.filter(x => x.id != comment.id);
      const tgtSubcomment = document.getElementById('subComment' + comment.id);
      if (tgtSubcomment) {
        tgtSubcomment.remove();
      }
      parent.showNotification(res);
      this.commentRemovedEvent.emit(comment as FileComment);
    }
  }

  async selectFile(files: FileEntry[]) {
    this.selectedFiles = files.flatMap(fileArray => fileArray);
  }

  editComment(comment: FileComment) {
    console.log(comment);
    if (!this.editingComments.includes(comment.id)) {
      this.editingComments.push(comment.id);
    } else {
      this.editingComments = this.editingComments.filter(x => x !== comment.id);
    }
    this.closeOptionsPanel();
    this.replyingToCommentId = undefined;
    this.replyingToCommentEvent.emit();
  }

  async confirmEditComment(comment: FileComment) {
    let message = (document.getElementById('commentTextTextarea' + comment.id) as HTMLTextAreaElement).value.trim();
    message = this.encryptionService.encryptContent(message, comment.user.id + "");
    this.editingComments = this.editingComments.filter(x => x != comment.id);
    const parent = this.parentRef ?? this.inputtedParentRef;
    if (message && parent?.user) {
      parent.updateLastSeen();
      this.commentService.editComment(parent.user.id ?? 0, comment.id, message).then(res => {
        if (res) {
          parent.showNotification(res);
        }
      });
      comment.commentText = message;
    } else {
      alert("Error, contact an administrator.");
    }
  }

  getTextForDOM(text: string, component_id: number) {
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent) {
      return parent.getTextForDOM(text, component_id);
    } else return "Error fetching parent component.";
  }

  createClickableUrls(text?: string): SafeHtml {
    return this.getTextForDOM(text ?? "", this.component_id);
  }

  showOptionsPanel(comment: FileComment) {
    if (this.isOptionsPanelOpen) {
      this.closeOptionsPanel();
      return;
    }
    this.isOptionsPanelOpen = true;
    this.optionsComment = comment;
    if (this.parentRef) {
      this.parentRef.showOverlay();
    }
    else if (this.inputtedParentRef) {
      this.inputtedParentRef.showOverlay();
    }
  }

  closeOptionsPanel() {
    this.isOptionsPanelOpen = false;
    this.optionsComment = undefined;
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent) {
      parent.closeOverlay();
    }
  }

  showSubComments(commentId: number) {
    if (this.replyingToCommentId === commentId) {
      // Cancel reply
      this.replyingToCommentId = undefined;
      this.replyingToCommentEvent.emit(undefined);
    } else {
      // Set new active reply
      this.replyingToCommentId = commentId;
      this.replyingToCommentEvent.emit(commentId);
    }
  }
  commentHeaderClicked() {
    this.showComments = !this.showComments;
    this.commentHeaderClickedEvent.emit(this.showComments);
  }
  quote(comment: FileComment) {
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent) {
      parent.closeOverlay();
    }

    const commentText = this.encryptionService.decryptContent(
      comment.commentText?.trim() || "",
      comment.user.id + ""
    );

    const message = `[Quoting {${comment.user.username}|${comment.user.id}|${comment.date}}: ${commentText}] \n`;
    this.setQuoteMessage(message);
    this.quoteMessageEvent.emit(message);
  }
  setQuoteMessage(message: string) {
    this.quoteMessage = message;
  }
  getTotalCommentCount(comment?: FileComment): number {
    const countSubComments = (c: FileComment): number => {
      let subCount = 0;
      if (c.comments && c.comments.length) {
        subCount += c.comments.length;
        for (let sub of c.comments) {
          subCount += countSubComments(sub); // Recursively count deeper
        }
      }
      return subCount;
    };

    if (comment) {
      // Only count *this comment’s subcomments*
      return countSubComments(comment);
    } else {
      // Count *all top-level + subs* (header case)
      let count = 0;
      for (let c of this.commentList) {
        count++; // include the comment itself
        count += countSubComments(c);
      }
      return count;
    }
  }


  clearSubCommentsToggled(commentId?: number) {
    if (this.depth > 0) {
      console.log("clearing subcomments", commentId);
      for (let c of this.commentList) {
        if (c.id == commentId) continue;
        this.minimizedComments.add(c.id);
      }
    }
  }

  commentPosted(event: { results: any, content: any, originalContent: string }, parentComment?: FileComment) {
    const commentAdded = event.content.comment as FileComment;
    commentAdded.id = parseInt(event.results.split(" ")[0]);
    if (!parentComment) {
      this.commentAddedEvent.emit(commentAdded);
    } else {
      if (!parentComment.comments) { parentComment.comments = []; }
      parentComment.comments.push(commentAdded);
    }
    this.replyingToCommentId = undefined;
    this.replyingToCommentEvent.emit(this.replyingToCommentId);
  }
  expandComment(comment: FileComment) {
    if (this.depth === 0) {
      // Inline expand/collapse at top level
      if (this.minimizedComments.has(comment.id)) {
        this.minimizedComments.delete(comment.id);
      } else {
        this.minimizedComments.add(comment.id);
      }
      return;
    }

    // Breadcrumb mode
    if (this.breadcrumbComments.length === 0) {
      this.originalCommentList = [...this.commentList]; // save top-level
    }

    this.breadcrumbComments.push(comment);
    this.activeCommentId = comment.id;
    this.activeBreadcrumbCommentId = comment.id; // flag which comment is expanded
    this.commentList = comment.comments || [];
  }
  navigateToComment(commentId: number | null) {
    if (commentId === null) {
      this.commentList = this.originalCommentList;
      this.breadcrumbComments = [];
      this.activeCommentId = null;
      this.activeBreadcrumbCommentId = null;
      return;
    }

    // breadcrumb navigation
    const index = this.breadcrumbComments.findIndex(c => c.id === commentId);
    if (index !== -1) {
      this.breadcrumbComments = this.breadcrumbComments.slice(0, index + 1);

      let currentLevel = this.originalCommentList;
      for (let i = 0; i <= index; i++) {
        const breadcrumb = this.breadcrumbComments[i];
        const found = currentLevel.find(c => c.id === breadcrumb.id);
        if (found) {
          currentLevel = found.comments || [];
        }
      }
      this.commentList = currentLevel;
      this.activeCommentId = commentId;
      this.activeBreadcrumbCommentId = commentId;
    }
  }
  
  toggleSubcomments(commentId: number) {
    if (this.depth === 0) {
      const comment = this.commentList.find(c => c.id === commentId);
      if (comment) {
        this.expandComment(comment); // breadcrumb expansion
      }
    } else {
      this.togglingSubComments.emit(commentId);
      setTimeout(() => {
        if (this.minimizedComments.has(commentId)) {
          this.minimizedComments.delete(commentId);
        } else {
          this.minimizedComments.add(commentId);
        }
      }, 500);
    }
  } 
  get filteredComments(): FileComment[] {
    if (!this.commentList) return [];
    if (!this.activeBreadcrumbCommentId) return this.commentList;
    return this.commentList.filter(c => c.id === this.activeBreadcrumbCommentId);
  }
  decryptText(encryptedText: any, parentId: any): string {
    return this.encryptionService.decryptContent(encryptedText, parentId + "");
  }
  speakMessage(message: string) {
    this.textToSpeechService.speakMessage(message);
  }
  stopSpeaking() {
    this.textToSpeechService.stopSpeaking();
  }
  isTextToSpeechSpeaking() {
    return this.textToSpeechService.isSpeaking;
  }
  async copyAllText(comment: FileComment) { 
    this.closeOptionsPanel();
    const parent = this.inputtedParentRef ?? this.parentRef;
    try {
      const text = this.decryptText(comment.commentText, comment.user.id);
      await navigator.clipboard.writeText(text);
      parent?.showNotification("Text copied to Clipboard!");
    } catch (err) {
      console.error('Failed to copy text: ', err);
      parent?.showNotification('Failed to copy text. Please select and copy manually.');
    }
  } 
}
