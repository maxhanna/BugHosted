import { Component, ElementRef, EventEmitter, Input, OnInit, Output, SecurityContext, ViewChild } from '@angular/core';
import { AppComponent } from '../app.component';
import { CommentService } from '../../services/comment.service';
import { ChildComponent } from '../child.component';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { User } from '../../services/datacontracts/user/user';
import { FileComment } from '../../services/datacontracts/file/file-comment';
import { NotificationService } from '../../services/notification.service';
import { Story } from '../../services/datacontracts/social/story';

@Component({
  selector: 'app-comments',
  templateUrl: './comments.component.html',
  styleUrl: './comments.component.css'
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
  @Input() type: string = '' || "Social" || "File" || "Comment";
  @Input() component_id: number = 0;
  @Input() component: any = undefined;
  @Input() comment_id?: number = undefined;
  @Input() automaticallyShowSubComments = true;
  @Output() commentAddedEvent = new EventEmitter<FileComment>();
  @Output() commentRemovedEvent = new EventEmitter<FileComment>();
  @Output() commentHeaderClickedEvent = new EventEmitter<boolean>(this.showComments);
  @Output() subCommentCountUpdatedEvent = new EventEmitter<any>();

  commentCount = 0;

  @ViewChild('subCommentComponent') subCommentComponent!: CommentsComponent; 

  constructor(private commentService: CommentService, private notificationService: NotificationService, private sanitizer: DomSanitizer) {
    super();
  }

  ngOnInit() { 
    if (this.comment_id) { 
      this.commentService.getCommentDataByIds(this.comment_id).then(res => { 
        this.commentList = res;
        this.subCommentCountUpdatedEvent.emit({ commentCount: this.commentList.length, comment_id: this.comment_id });
      });
    } 
  }

  override viewProfile(user: User) {
    this.parentRef = this.inputtedParentRef;
    super.viewProfile(user);
  }

  async addComment(comment: string) {
    console.log("adding comment " + comment);
    this.showCommentLoadingOverlay = true;
    clearTimeout(this.debounceTimer);
    const commentsWithEmoji = this.replaceEmojisInMessage(comment);

    const fileId = this.type === 'File' ? this.component_id : undefined;
    const storyId = this.type === 'Social' ? this.component_id : undefined;
    const commentId = this.type === 'Comment' ? this.comment_id : undefined;
    const filesToSend = this.selectedFiles;
    this.selectedFiles = [];
    const currentDate = new Date();
    const tmpComment = new FileComment();
    tmpComment.user = this.inputtedParentRef?.user ?? new User(0, "Anonymous");
    tmpComment.commentText = commentsWithEmoji;
    tmpComment.date = currentDate;
    tmpComment.fileId = fileId;
    tmpComment.storyId = storyId;
    tmpComment.commentId = commentId;
    tmpComment.commentFiles = filesToSend;
    if (!this.commentList) { this.commentList = []; }

    this.debounceTimer = setTimeout(async () => {
      this.commentAddedEvent.emit(tmpComment as FileComment);
      this.addAsyncComment(tmpComment, currentDate);
      this.stopLoadingComment(this.component_id);
    }, 2000);
  }

  async addAsyncComment(comment: FileComment, currentDate: Date) {
    const res = await this.commentService.addComment(comment.commentText ?? "", this.inputtedParentRef?.user, comment.fileId, comment.storyId, comment.commentId, comment.commentFiles);

    if (res && res.toLowerCase().includes("success")) {
      if (!this.commentList) {
        this.commentList = [];
      }
      if (this.commentList.find(x => x.date == currentDate)) {
        this.commentList.find(x => x.date == currentDate)!.id = parseInt(res.split(" ")[0]);
        console.log("op found the bugger"); 
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
  private sendNotifications(comment: FileComment) {
    const isStory = this.type == "Social";
    const isFile = this.type == "File";
    const isFileComment = this.type == "Comment";
    const tmpComponent = isStory ? (this.component as Story)
      : isFile ? (this.component as FileEntry)
      : isFileComment ? (this.component as FileComment) 
      : undefined; 

    if (this.inputtedParentRef && tmpComponent?.user) {
      const notificationData: any = {
        fromUser: this.inputtedParentRef.user ?? new User(0, "Anonymous"),
        toUser: [tmpComponent.user],
        message: isStory ? "Social Post Comment" : "File Comment",
        ...(isStory && { storyId: comment.storyId }),
        ...(isFile && { fileId: comment.fileId }),
        ...(isFileComment && { commentId: comment.commentId })
      };
      console.log(this);
      this.notificationService.createNotifications(notificationData);
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
    if (!this.inputtedParentRef?.user) { return alert("You must be logged in to delete a comment!"); }

    const res = await this.commentService.deleteComment(this.inputtedParentRef?.user, comment.id);
    if (res && res.includes("success")) {
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
    if (!this.editingComments.includes(comment.id)) {
      this.editingComments.push(comment.id);
    } else {
      this.editingComments = this.editingComments.filter(x => x !== comment.id);
    }
    this.closeOptionsPanel();
  }
  async confirmEditComment(comment: FileComment) {
    let message = (document.getElementById('commentTextTextarea' + comment.id) as HTMLTextAreaElement).value;

    console.log(message, this.comment_id);
    this.editingComments = this.editingComments.filter(x => x != comment.id);
    if (document.getElementById('commentText' + comment.id) && this.inputtedParentRef && this.inputtedParentRef.user) {
      this.commentService.editComment(this.inputtedParentRef.user, comment.id, message).then(res => {
        if (res) {
          this.inputtedParentRef?.showNotification(res);
        }
      });
      comment.commentText = message;
      console.log("commentText" + comment.id + " exists");
    } else {
      console.log("commentText" + comment.id + " doesnt exist");
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
  changedCommentCount(event: any) { 
    if (document.getElementById("commentIdCount" + event.comment_id)) {
      document.getElementById("commentIdCount" + event.comment_id)!.innerHTML = "Repl" + (event.commentCount > 0 ? 'ies:<span class="commentCountSpan">' + event.commentCount + "</span>" : 'y') + "";
      if (this.automaticallyShowSubComments) {
        (document.getElementById('subCommentComponent' + event.comment_id) as HTMLDivElement).style.display = ((event.commentCount > 0) ? "block" : "none"); 
      }
    }
  }
  showSubComments(commentId: number) {
    console.log(commentId);
    const currElement = (document.getElementById('subCommentComponent' + commentId) as HTMLDivElement);
    console.log(currElement); 
    const shouldDisplay = !(currElement.style.display == "block")
    currElement.style.display = shouldDisplay ? "block" : "none";
    if (shouldDisplay) {
      setTimeout(() => {
        if (currElement && !this.isElementInViewport(currElement)) {
          currElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
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
    const input = this.addCommentInput.nativeElement;
    if (input) {
      input.value += `[Quoting {${comment.user.username}|${comment.user.id}|${comment.date}}: ${comment.commentText}] \n`;
    }
    input.focus();
  }
  async replyToComment(comment: FileComment) {
    const element = document.getElementById('commentReplyInput' + comment.id) as HTMLTextAreaElement;
    const text = element.value;
    const currentDate = new Date();
    if (text) {
      console.log(text);
      const user = this.parentRef?.user ?? this.inputtedParentRef?.user ?? new User(0, "Anonymous");
      const res = await this.commentService.addComment(text, user, undefined, undefined, comment.id, undefined);
      if (res) {
        console.log(res); 
        console.log(this.commentList); 
        if (this.commentList.find(x => x.date == currentDate)) {
          this.commentList.find(x => x.date == currentDate)!.id = parseInt(res.split(" ")[0]);
          console.log("found a bugger");
        } 
      }
    }
  } 
}
