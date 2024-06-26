import { Component, ElementRef, Input, ViewChild } from '@angular/core';
import { AppComponent } from '../app.component';
import { CommentService } from '../../services/comment.service';
import { Comment } from '../../services/datacontracts/comment';
import { User } from '../../services/datacontracts/user';
import { FileEntry } from '../../services/datacontracts/file-entry';
import { ChildComponent } from '../child.component';

@Component({
  selector: 'app-comments',
  templateUrl: './comments.component.html',
  styleUrl: './comments.component.css'
})
export class CommentsComponent extends ChildComponent {
  debounceTimer: any;
  showComments = true;
  showCommentLoadingOverlay = false;
  upvotedCommentIds: number[] = []
  downvotedCommentIds: number[] = []
  selectedFiles: FileEntry[] = [];
  emojiMap: { [key: string]: string } =
    { ":)": "😊", ":(": "☹️", ";)": "😉", ":D": "😃", "XD": "😆", ":P": "😛", ":O": "😮", "B)": "😎", ":/": "😕", ":'(": "😢", "<3": "❤️", "</3": "💔", ":*": "😘", "O:)": "😇", "3:)": "😈", ":|": "😐", ":$": "😳", "8)": "😎", "^_^": "😊", "-_-": "😑", ">_<": "😣", ":'D": "😂", ":3": "😺", ":v": "✌️", ":S": "😖", ":b": "😛", ":x": "😶", ":X": "🤐", ":Z": "😴", "*_*": "😍", ":@": "😡", ":#": "🤬", ">:(": "😠", ":&": "🤢", ":T": "😋", "T_T": "😭", "Q_Q": "😭", ":1": "😆", "O_O": "😳", "*o*": "😍", "T-T": "😭", ";P": "😜", ":B": "😛", ":W": "😅", ":L": "😞", ":E": "😲", ":M": "🤔", ":C": "😏", ":I": "🤓", ":Q": "😮", ":F": "😇", ":G": "😵", ":H": "😱", ":J": "😜", ":K": "😞", ":Y": "😮", ":N": "😒", ":U": "😕", ":V": "😈", ":wave:": "👋", ":ok:": "👌", ":thumbsup:": "👍", ":thumbsdown:": "👎", ":clap:": "👏", ":star:": "⭐", ":star2:": "🌟", ":dizzy:": "💫", ":sparkles:": "✨", ":boom:": "💥", ":fire:": "🔥", ":droplet:": "💧", ":sweat_drops:": "💦", ":dash:": "💨", ":cloud:": "☁️", ":sunny:": "☀️", ":umbrella:": "☂️", ":snowflake:": "❄️", ":snowman:": "⛄", ":zap:": "⚡", ":cyclone:": "🌀", ":fog:": "🌫️", ":rainbow:": "🌈", ":heart:": "❤️", ":blue_heart:": "💙", ":green_heart:": "💚", ":yellow_heart:": "💛", ":purple_heart:": "💜", ":black_heart:": "🖤", ":white_heart:": "🤍", ":orange_heart:": "🧡", ":broken_heart:": "💔", ":heartbeat:": "💓", ":heartpulse:": "💗", ":two_hearts:": "💕", ":sparkling_heart:": "💖", ":cupid:": "💘", ":gift_heart:": "💝", ":revolving_hearts:": "💞", ":heart_decoration:": "💟", ":peace:": "☮️", ":cross:": "✝️", ":star_and_crescent:": "☪️", ":om:": "🕉️", ":wheel_of_dharma:": "☸️", ":yin_yang:": "☯️", ":orthodox_cross:": "☦️", ":star_of_david:": "✡️", ":six_pointed_star:": "🔯", ":menorah:": "🕎", ":infinity:": "♾️", ":wavy_dash:": "〰️", ":congratulations:": "㊗️", ":secret:": "㊙️", ":red_circle:": "🔴", ":orange_circle:": "🟠", ":yellow_circle:": "🟡", ":green_circle:": "🟢", ":blue_circle:": "🔵", ":purple_circle:": "🟣", ":brown_circle:": "🟤", ":black_circle:": "⚫", ":white_circle:": "⚪", ":red_square:": "🟥", ":orange_square:": "🟧", ":yellow_square:": "🟨", ":green_square:": "🟩", ":blue_square:": "🟦", ":purple_square:": "🟪", ":brown_square:": "🟫", ":black_large_square:": "⬛", ":white_large_square:": "⬜", ":black_medium_square:": "◼️", ": black_medium_small_square: ": "◾", ": white_medium_small_square: ": "◽", ": black_small_square: ": "▪️", ": white_small_square: ": "▫️", ": large_orange_diamond: ": "🔶", ": large_blue_diamond: ": "🔷", ": small_orange_diamond: ": "🔸", ": small_blue_diamond: ": "🔹", ": red_triangle_pointed_up: ": "🔺", ": red_triangle_pointed_down: ": "🔻", ": diamond_shape_with_a_dot_inside: ": "💠", ": radio_button: ": "🔘", ": white_square_button: ": "🔳", ": black_square_button: ": "🔲", ": checkered_flag: ": "🏁", ": triangular_flag_on_post: ": "🚩", ": crossed_flags: ": "🎌", ": black_flag: ": "🏴", ": white_flag: ": "🏳️", ": rainbow_flag: ": "🏳️‍🌈", ": pirate_flag: ": "🏴‍☠️" };

  @ViewChild('addCommentInput') addCommentInput!: ElementRef<HTMLInputElement>;

  @Input() inputtedParentRef?: AppComponent;
  @Input() commentList: Comment[] = [];
  @Input() type: string = '' || "Social" || "File";
  @Input() component_id: number = 0;
  constructor(private commentService: CommentService) {
    super(); 
  }

  override viewProfile(user: User) {
    this.parentRef = this.inputtedParentRef;
    super.viewProfile(user);
  }

  async addComment(comment: string) {
    // Clear any existing debounce timer
    clearTimeout(this.debounceTimer);
    const commentsWithEmoji = this.replaceEmojisInMessage(comment);
    // Set a new debounce timer
    this.debounceTimer = setTimeout(async () => {
      // Determine the component ID based on the type
      const fileId = this.type === 'File' ? this.component_id : undefined;
      const storyId = this.type === 'Social' ? this.component_id : undefined;

      // Send the comment to the server
      const res = await this.commentService.addComment(commentsWithEmoji, this.inputtedParentRef?.user, fileId, storyId, this.selectedFiles);

      // Check if the response indicates success
      if (res && res.toLowerCase().includes("success")) {
        // Create a new Comment object
        const tmpComment = new Comment();
        tmpComment.id = parseInt(res.split(" ")[0]);
        tmpComment.user = this.inputtedParentRef?.user ?? new User(0, "Anonymous");
        tmpComment.commentText = commentsWithEmoji;
        tmpComment.upvotes = 0;
        tmpComment.downvotes = 0;
        tmpComment.date = new Date();
        tmpComment.fileId = fileId;
        tmpComment.storyId = storyId;
        tmpComment.commentFiles = this.selectedFiles;
        if (!this.commentList) {
          this.commentList = [];
        }
        this.commentList.unshift(tmpComment);
      }
      this.selectedFiles = [];
      this.stopLoadingComment(this.component_id);
    }, 2000);  
  }
  async selectFile(files: FileEntry[]) {
    this.selectedFiles = files;
  }
  async startLoadingComment() {
    const comment = this.addCommentInput.nativeElement.value;
    if ((!comment || comment.trim() == '') && (!this.selectedFiles || this.selectedFiles.length == 0)) { return alert("Comment cannot be empty!"); }
    this.showCommentLoadingOverlay = true;

    await this.addComment(comment)
  }
  stopLoadingComment(fileId: number) {
    this.showCommentLoadingOverlay = false;
    setTimeout(() => { this.addCommentInput.nativeElement.value = ''; }, 1);
  }
  async upvoteComment(comment: Comment) {
    if (!this.inputtedParentRef?.user) { return alert("You must be logged in to use this feature!"); }
    if (this.upvotedCommentIds.includes(comment.id)) { return alert("Cannot upvote twice!"); }

    try {
      const res = await this.commentService.upvoteComment(this.inputtedParentRef?.user, comment.id);
      if (res && res.toLowerCase().includes("success")) {
        comment.upvotes++;
        if (this.downvotedCommentIds.includes(comment.id)) {
          comment.downvotes!--;
        }
        this.downvotedCommentIds = this.downvotedCommentIds.filter(x => x != comment.id);
        this.upvotedCommentIds.push(comment.id);
      } else if (res && res.toLowerCase().includes("already")){
        alert("Cannot upvote twice!");
      }
    } catch (error) {
      console.error("Error upvoting comment:", error);
    }
  }
  async deleteComment(comment: Comment) {
    if (!this.inputtedParentRef?.user) { return alert("You must be logged in to delete a comment!"); }
    if (!confirm("Are you sure?")) { return };

    this.showCommentLoadingOverlay = true;
    const res = await this.commentService.deleteComment(this.inputtedParentRef?.user, comment.id);
    if (res && res.includes("success")) {
      this.commentList! = this.commentList.filter(x => x.id != comment.id);
    }
    this.showCommentLoadingOverlay = false;
  }
  async downvoteComment(comment: Comment) {
    if (!this.inputtedParentRef?.user) { return alert("You must be logged in to use this feature!"); }
    if (this.downvotedCommentIds.includes(comment.id)) { return alert("Cannot downvote twice!"); }

    try {
      const res = await this.commentService.downvoteComment(this.inputtedParentRef?.user, comment.id);
      if (res && res.includes("success")) {
        comment.downvotes++;
        if (this.upvotedCommentIds.includes(comment.id)) {
          comment.upvotes--;
        }
        this.upvotedCommentIds = this.upvotedCommentIds.filter(x => x != comment.id);
        this.downvotedCommentIds.push(comment.id);
      } else if (res && res.toLowerCase().includes("already")) {
        alert("Cannot upvote twice!");
      }
    } catch (error) {
      console.error("Error downvoting comment:", error);
    }
  }
  
}
