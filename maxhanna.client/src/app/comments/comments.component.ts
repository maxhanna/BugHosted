import { Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { AppComponent } from '../app.component';
import { CommentService } from '../../services/comment.service';
import { ChildComponent } from '../child.component';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { User } from '../../services/datacontracts/user/user';
import { FileComment } from '../../services/datacontracts/file/file-comment';
import { NotificationService } from '../../services/notification.service';
import { Story } from '../../services/datacontracts/social/story';
import { MediaSelectorComponent } from '../media-selector/media-selector.component';

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

  @ViewChild('addCommentInput') addCommentInput!: ElementRef<HTMLInputElement>;

  @Input() inputtedParentRef?: AppComponent;
  @Input() commentList: FileComment[] = [];
  @Input() showComments = false;
  @Input() showCommentsHeader = true;
  @Input() type: "" | "Social" | "File" | "Comment" = "";
  @Input() component_id: number = 0;
  @Input() component: any = undefined;
  @Input() comment_id?: number = undefined;
  @Input() userProfileId?: number = undefined;
  @Input() automaticallyShowSubComments = true;
  @Input() canReply = true;
  @Input() debpth = 0;
  @Output() commentAddedEvent = new EventEmitter<FileComment>();
  @Output() commentRemovedEvent = new EventEmitter<FileComment>();
  @Output() commentHeaderClickedEvent = new EventEmitter<boolean>(this.showComments);
  @Output() subCommentCountUpdatedEvent = new EventEmitter<any>();

  commentCount = 0;

  @ViewChild('subCommentComponent') subCommentComponent!: CommentsComponent;
  @ViewChild('commentInputAreaMediaSelector') commentInputAreaMediaSelector!: MediaSelectorComponent;

  constructor(private commentService: CommentService, private notificationService: NotificationService, private sanitizer: DomSanitizer) {
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

  async addComment(comment: string) { 
    const parent = this.inputtedParentRef ?? this.parentRef;
    this.showCommentLoadingOverlay = true;
    clearTimeout(this.debounceTimer);
    const commentsWithEmoji = parent?.replaceEmojisInMessage(comment);
    const userProfileId = this.userProfileId ?? this.component?.userProfileId ?? undefined;
    const fileId = this.type === 'File' ? this.component_id : undefined;
    const storyId = this.type === 'Social' ? this.component_id : undefined;
    const commentId = this.type === 'Comment' ? this.comment_id : undefined;
    const filesToSend = this.selectedFiles;
    this.selectedFiles = [];
    const currentDate = new Date();
    const location = await parent?.getLocation();
    const tmpComment = new FileComment();
    tmpComment.user = parent?.user ?? new User(0, "Anonymous");
    tmpComment.commentText = commentsWithEmoji;
    tmpComment.date = currentDate;
    tmpComment.fileId = fileId;
    tmpComment.storyId = storyId;
    tmpComment.commentId = commentId;
    tmpComment.commentFiles = filesToSend;
    tmpComment.country = location?.country;
    tmpComment.city = location?.city;
    tmpComment.userProfileId = userProfileId;
    tmpComment.ip = location?.ip;
    if (!this.commentList) { this.commentList = []; }

    this.debounceTimer = setTimeout(async () => {
      this.commentAddedEvent.emit(tmpComment as FileComment);
      this.addAsyncComment(tmpComment, currentDate);
      this.stopLoadingComment(this.component_id);
    }, 2000);
  }

  async addAsyncComment(comment: FileComment, currentDate: Date) { 
    const parent = this.inputtedParentRef ?? this.parentRef;
    const user = parent?.user;
    parent?.updateLastSeen();
    const res = await this.commentService.addComment(
      comment.commentText ?? "",
      user?.id,
      comment.fileId,
      comment.storyId,
      comment.commentId,
      comment.userProfileId,
      comment.commentFiles,
      comment.city,
      comment.country,
      comment.ip,
    );

    if (res && res.toLowerCase().includes("success")) {
      if (!this.commentList) {
        this.commentList = [];
      }
      if (this.commentList.find(x => x.date == currentDate)) {
        this.commentList.find(x => x.date == currentDate)!.id = parseInt(res.split(" ")[0]);
      } else {
        this.commentList.push(comment);
      }
      if (this.comment_id) {
        this.commentList.push(comment);
      }
      this.replyingToCommentIds = [];
      this.editingComments = [];

      this.ngOnInit();
    }
    this.sendNotifications(comment);
  }
  private async sendNotifications(comment: FileComment, text?: string, replyingTo?: User[], newCommentId?: number) {
    const parent = this.inputtedParentRef ?? this.parentRef;
    const user = parent?.user;

    const replyingToUser = replyingTo ?? [this.component?.user];
    const isStory = this.type == "Social" || this.component?.storyId;
    const fromUserId = user?.id ?? 0;
    const message = text ?? (!comment || !comment.commentText) ? (isStory || this.userProfileId) ? "Social Post Comment" : "File Comment"
      : comment.commentText.length > 50 ? comment.commentText.slice(0, 50) + "…"
        : comment.commentText;
    if (replyingToUser) {
      const notificationData = {
        fromUserId: fromUserId,
        toUserIds: replyingToUser.map((x : User) => x.id) as number[],
        message: message,
        storyId: comment.storyId ?? this.component.storyId,
        fileId: comment.fileId,
        commentId: newCommentId ?? comment.commentId,
        userProfileId: comment.userProfileId,
      };
      this.notificationService.createNotifications(notificationData);
    }
    const mentionnedUsers = await parent?.getUsersByUsernames(comment.commentText ?? "");
    if (mentionnedUsers && mentionnedUsers.length > 0) { 
      const mentionnedUserIds = mentionnedUsers.filter(x => !replyingToUser.filter((y: User) => y.id != x.id)).map(x => x.id);
      if (mentionnedUserIds.length > 0) {
        const notificationData: any = {
          fromUserId: fromUserId,
          toUserIds: mentionnedUserIds,
          message: "You were mentionned!",
          commentId: comment.commentId,
          storyId: comment.storyId ?? this.component.storyId,
          fileId: comment.fileId,
        };
        this.notificationService.createNotifications(notificationData);
      }
    }
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

  async startLoadingComment() {
    const comment = this.addCommentInput.nativeElement.value;
    if ((!comment || comment.trim() == '') && (!this.selectedFiles || this.selectedFiles.length == 0)) { return alert("Comment cannot be empty!"); }
    this.showCommentLoadingOverlay = true;

    this.addComment(comment)
  }

  stopLoadingComment(fileId: number) {
    this.showCommentLoadingOverlay = false;
    setTimeout(() => { this.addCommentInput.nativeElement.value = ''; }, 1);
  }

  editComment(comment: FileComment) {
    console.log(comment);
    if (!this.editingComments.includes(comment.id)) {
      this.editingComments.push(comment.id);
    } else {
      this.editingComments = this.editingComments.filter(x => x !== comment.id);
    }
    this.closeOptionsPanel();
  }
  async confirmEditComment(comment: FileComment) {
    let message = (document.getElementById('commentTextTextarea' + comment.id) as HTMLTextAreaElement).value.trim();
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
    const input = this.addCommentInput.nativeElement;
    if (input) {
      if (input.value.trim() != "") {
        input.value += "\n ";
      }
      input.value += `[Quoting {${comment.user.username}|${comment.user.id}|${comment.date}}: ${comment.commentText?.trim()}] \n`;
    }
    input.focus();
    const length = input.value.length;
    input.setSelectionRange(length, length);
    input.scrollTop = input.scrollHeight;
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

  async replyToComment(comment: FileComment) { 
    const parent = this.inputtedParentRef ?? this.parentRef;
    const user = parent?.user ?? new User(0, "Anonymous");
    parent?.updateLastSeen();

    const element = document.getElementById('commentReplyInput' + comment.id) as HTMLTextAreaElement;
    let text = element.value;
    text = parent?.replaceEmojisInMessage(text) ?? text;
    const filesToSend = this.selectedFiles;
    this.selectedFiles = [];
    if (text) {

      const location = await parent?.getLocation();
      const res = await this.commentService.addComment(text, user.id, undefined, undefined, comment.id, undefined, filesToSend, location?.city, location?.country, location?.ip);
      if (res) {
        element.value = "";
        const id = parseInt(res.split(' ')[0]);
        let tmpC = new FileComment();
        tmpC.id = id;
        tmpC.commentText = text;
        tmpC.user = user;
        tmpC.commentFiles = filesToSend;
        tmpC.city = location?.city;
        tmpC.country = location?.country;
        if (!comment.comments) { comment.comments = []; }
        comment.comments.push(tmpC);
        if (this.commentInputAreaMediaSelector) {
          this.commentInputAreaMediaSelector.selectedFiles = [];
        }
        this.replyingToCommentIds = this.replyingToCommentIds.filter(x => x != comment.id);
        const repliedUsers = [
          ...new Set([
            ...comment.comments
              .filter(c => c.user.id !== user.id)
              .map(c => c.user),
            comment.user
          ])
        ];
        if (repliedUsers.length > 0) {
          this.sendNotifications(comment, text, repliedUsers, id); 
        }
      }
    }
  }
}
