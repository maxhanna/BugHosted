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
  isSubCommentsShowing = false;
  optionsComment: FileComment | undefined; 
  editingComments: number[] = []
  replyingToCommentIds: number[] = []
  selectedFiles: FileEntry[] = [];
  emojiMap: { [key: string]: string } =
    { ":)": "😊", ":(": "☹️", ";)": "😉", ":D": "😃", "XD": "😆", ":P": "😛", ":O": "😮", "B)": "😎", ":/": "😕", ":'(": "😢", "<3": "❤️", "</3": "💔", ":*": "😘", "O:)": "😇", "3:)": "😈", ":|": "😐", ":$": "😳", "8)": "😎", "^_^": "😊", "-_-": "😑", ">_<": "😣", ":'D": "😂", ":3": "😺", ":v": "✌️", ":S": "😖", ":b": "😛", ":x": "😶", ":X": "🤐", ":Z": "😴", "*_*": "😍", ":@": "😡", ":#": "🤬", ">:(": "😠", ":&": "🤢", ":T": "😋", "T_T": "😭", "Q_Q": "😭", ":1": "😆", "O_O": "😳", "*o*": "😍", "T-T": "😭", ";P": "😜", ":B": "😛", ":W": "😅", ":L": "😞", ":E": "😲", ":M": "🤔", ":C": "😏", ":I": "🤓", ":Q": "😮", ":F": "😇", ":G": "😵", ":H": "😱", ":J": "😜", ":K": "😞", ":Y": "😮", ":N": "😒", ":U": "😕", ":V": "😈", ":wave:": "👋", ":ok:": "👌", ":thumbsup:": "👍", ":thumbsdown:": "👎", ":clap:": "👏", ":star:": "⭐", ":star2:": "🌟", ":dizzy:": "💫", ":sparkles:": "✨", ":boom:": "💥", ":fire:": "🔥", ":droplet:": "💧", ":sweat_drops:": "💦", ":dash:": "💨", ":cloud:": "☁️", ":sunny:": "☀️", ":umbrella:": "☂️", ":snowflake:": "❄️", ":snowman:": "⛄", ":zap:": "⚡", ":cyclone:": "🌀", ":fog:": "🌫️", ":rainbow:": "🌈", ":heart:": "❤️", ":blue_heart:": "💙", ":green_heart:": "💚", ":yellow_heart:": "💛", ":purple_heart:": "💜", ":black_heart:": "🖤", ":white_heart:": "🤍", ":orange_heart:": "🧡", ":broken_heart:": "💔", ":heartbeat:": "💓", ":heartpulse:": "💗", ":two_hearts:": "💕", ":sparkling_heart:": "💖", ":cupid:": "💘", ":gift_heart:": "💝", ":revolving_hearts:": "💞", ":heart_decoration:": "💟", ":peace:": "☮️", ":cross:": "✝️", ":star_and_crescent:": "☪️", ":om:": "🕉️", ":wheel_of_dharma:": "☸️", ":yin_yang:": "☯️", ":orthodox_cross:": "☦️", ":star_of_david:": "✡️", ":six_pointed_star:": "🔯", ":menorah:": "🕎", ":infinity:": "♾️", ":wavy_dash:": "〰️", ":congratulations:": "㊗️", ":secret:": "㊙️", ":red_circle:": "🔴", ":orange_circle:": "🟠", ":yellow_circle:": "🟡", ":green_circle:": "🟢", ":blue_circle:": "🔵", ":purple_circle:": "🟣", ":brown_circle:": "🟤", ":black_circle:": "⚫", ":white_circle:": "⚪", ":red_square:": "🟥", ":orange_square:": "🟧", ":yellow_square:": "🟨", ":green_square:": "🟩", ":blue_square:": "🟦", ":purple_square:": "🟪", ":brown_square:": "🟫", ":black_large_square:": "⬛", ":white_large_square:": "⬜", ":black_medium_square:": "◼️", ": black_medium_small_square: ": "◾", ": white_medium_small_square: ": "◽", ": black_small_square: ": "▪️", ": white_small_square: ": "▫️", ": large_orange_diamond: ": "🔶", ": large_blue_diamond: ": "🔷", ": small_orange_diamond: ": "🔸", ": small_blue_diamond: ": "🔹", ": red_triangle_pointed_up: ": "🔺", ": red_triangle_pointed_down: ": "🔻", ": diamond_shape_with_a_dot_inside: ": "💠", ": radio_button: ": "🔘", ": white_square_button: ": "🔳", ": black_square_button: ": "🔲", ": checkered_flag: ": "🏁", ": triangular_flag_on_post: ": "🚩", ": crossed_flags: ": "🎌", ": black_flag: ": "🏴", ": white_flag: ": "🏳️", ": rainbow_flag: ": "🏳️‍🌈", ": pirate_flag: ": "🏴‍☠️" };

  @ViewChild('addCommentInput') addCommentInput!: ElementRef<HTMLInputElement>;

  @Input() inputtedParentRef?: AppComponent;
  @Input() commentList: FileComment[] = [];
  @Input() showComments = false;
  @Input() showCommentsHeader = true;
  @Input() type: string = '' || "Social" || "File" || "Comment";
  @Input() component_id: number = 0;
  @Input() component: any = undefined;
  @Input() comment_id?: number = undefined;
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
        this.showComments = true;
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
    this.sendNotifications(comment);

    if (res && res.toLowerCase().includes("success")) {
      if (!this.commentList) {
        this.commentList = [];
      }
      if (this.commentList.find(x => x.date == currentDate)) {
        this.commentList.find(x => x.date == currentDate)!.id = parseInt(res.split(" ")[0]);
      }
      if (this.comment_id) { 
        this.commentList.push(comment);
      }
      this.replyingToCommentIds = [];
      this.editingComments = [];
    }
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
    const message = (document.getElementById('commentTextTextarea' + comment.id) as HTMLTextAreaElement).value;
    this.editingComments = this.editingComments.filter(x => x != comment.id);
    if (document.getElementById('commentText' + comment.id) && this.inputtedParentRef && this.inputtedParentRef.user) {
      this.commentService.editComment(this.inputtedParentRef.user, comment.id, message);
      (document.getElementById('commentText' + comment.id) as HTMLDivElement).innerHTML = this.createClickableUrls(message).toString();
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
      this.parentRef.showOverlay = true;
    }
    else if (this.inputtedParentRef) {
      this.inputtedParentRef.showOverlay = true;
    }
  }
  closeOptionsPanel() {
    this.isOptionsPanelOpen = false;
    this.optionsComment = undefined;
    if (this.parentRef && this.parentRef.showOverlay) {
      this.parentRef.showOverlay = false;
    } else if (this.inputtedParentRef && this.inputtedParentRef.showOverlay) {
      this.inputtedParentRef.showOverlay = false;
    }
  }
  openReplyToComment(comment: FileComment) {
    if (this.replyingToCommentIds.includes(comment.id)) {
      this.replyingToCommentIds = this.replyingToCommentIds.filter(x => x != comment.id);
    } else {
      this.replyingToCommentIds.push(comment.id);
    }
  }
  changedCommentCount(event: any) { 
    if (document.getElementById("commentIdCount" + event.comment_id)) {
      document.getElementById("commentIdCount" + event.comment_id)!.innerHTML = "[Repl" + (event.commentCount > 0 ? 'ies:<span style="color:white">' + event.commentCount + "</span>" : 'y') + "]";
      (document.getElementById('subCommentComponent' + event.comment_id) as HTMLDivElement).style.display = ((event.commentCount > 0) ? "block" : "none"); 
    }
  }
  showSubComments(commentId: number) {
    const currElement = (document.getElementById('subCommentComponent' + commentId) as HTMLDivElement);
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
  async replyToComment(comment: FileComment) {
    const element = document.getElementById('commentReplyInput' + comment.id) as HTMLTextAreaElement;
    const text = element.value;
    if (text) {
      console.log(text);
      const user = this.parentRef?.user ?? this.inputtedParentRef?.user ?? new User(0, "Anonymous");
      const res = await this.commentService.addComment(text, user, undefined, undefined, comment.id, undefined);
      if (res) {
        console.log(res);
      }
    }
  }
}
