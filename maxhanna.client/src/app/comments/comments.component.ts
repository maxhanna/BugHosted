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
  replyingToCommentIds: number[] = []
  selectedFiles: FileEntry[] = [];
  minimizedComments: Set<number> = new Set<number>();
  quoteMessage = "";
  commentCount = 0; 

  @ViewChild('addCommentInput') addCommentInput!: ElementRef<HTMLInputElement>; 
  @ViewChild('subCommentComponent') subCommentComponent!: CommentsComponent;
  @ViewChild('commentInputAreaMediaSelector') commentInputAreaMediaSelector!: MediaSelectorComponent;

  @Input() inputtedParentRef?: AppComponent;
  @Input() commentList: FileComment[] = [];
  @Input() showComments = false;
  @Input() showCommentsHeader = true;
  @Input() type: "" | "Social" | "File" | "Comment" = "";
  @Input() component_id: number = 0;
  @Input() component: any = undefined;
  @Input() comment_id?: number = undefined;
  @Input() userProfile?: User = undefined;
  @Input() automaticallyShowSubComments = true;
  @Input() canReply = true;
  @Input() debpth = 0;
  @Output() commentAddedEvent = new EventEmitter<FileComment>();
  @Output() commentRemovedEvent = new EventEmitter<FileComment>();
  @Output() commentHeaderClickedEvent = new EventEmitter<boolean>(this.showComments);
  @Output() subCommentCountUpdatedEvent = new EventEmitter<any>();
 
  constructor(
    private commentService: CommentService, 
    private encryptionService: EncryptionService)
  {
    super();
    if (!this.inputtedParentRef && this.parentRef) {
      this.inputtedParentRef = this.parentRef;
    }
  }

  ngOnInit() {

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
    this.replyingToCommentIds = [];
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
    if (this.replyingToCommentIds.includes(commentId)) {
      this.replyingToCommentIds = this.replyingToCommentIds.filter(x => x != commentId);
      return;
    }
    this.replyingToCommentIds.push(commentId);
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
    const commentText = this.encryptionService.decryptContent(comment.commentText?.trim() || "", comment.user.id + "");
    this.quoteMessage = `[Quoting {${comment.user.username}|${comment.user.id}|${comment.date}}: ${commentText}] \n`; 
  }
  getTotalCommentCount(): number {
    if (!this.commentList || this.commentList.length === 0) return 0;
    let count = 0;

    const countSubComments = (comment: FileComment): number => {
      let subCount = 0;
      if (comment.comments && comment.comments.length) {
        subCount += comment.comments.length;
        for (let sub of comment.comments) {
          subCount += countSubComments(sub); // Recursively count deeper sub-comments
        }
      }
      return subCount;
    };

    for (let comment of this.commentList) {
      count++; // Count main comment
      count += countSubComments(comment); // Count its sub-comments
    }

    return count;
  }
 
  toggleSubcomments(commentId: number) {
    if (this.minimizedComments.has(commentId)) {
      this.minimizedComments.delete(commentId);
    } else {
      this.minimizedComments.add(commentId);
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
    this.replyingToCommentIds = [];
  }

  decryptText(encryptedText: any, parentId: any): string { 
    return this.encryptionService.decryptContent(encryptedText, parentId + "");
  }
}
