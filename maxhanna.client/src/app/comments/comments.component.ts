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
  @Input() inputtedParentRef?: AppComponent;
  @Input() commentList: Comment[] = [];
  @Input() type: string = '' || "Social" || "File";
  @Input() component_id: number = 0;
  debounceTimer: any;
  showComments = true;
  showCommentLoadingOverlay = false;
  upvotedCommentIds: number[] = []
  downvotedCommentIds: number[] = []
  selectedFiles: FileEntry[] = [];
  @ViewChild('addCommentInput') addCommentInput!: ElementRef<HTMLInputElement>;
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

    // Set a new debounce timer
    this.debounceTimer = setTimeout(async () => {
      // Determine the component ID based on the type
      const fileId = this.type === 'File' ? this.component_id : undefined;
      const storyId = this.type === 'Social' ? this.component_id : undefined;

      // Send the comment to the server
      const res = await this.commentService.addComment(comment, this.inputtedParentRef?.user, fileId, storyId, this.selectedFiles);

      // Check if the response indicates success
      if (res && res.toLowerCase().includes("success")) {
        // Create a new Comment object
        const tmpComment = new Comment();
        tmpComment.id = parseInt(res.split(" ")[0]);
        tmpComment.user = this.inputtedParentRef?.user ?? new User(0, "Anonymous");
        tmpComment.commentText = comment;

        // Set the appropriate ID based on the type
        if (this.type === "Social") {
          tmpComment.storyId = this.component_id;
        } else if (this.type === "File") {
          tmpComment.fileId = this.component_id;
        }
        this.commentList.unshift(tmpComment);
      }

      // Stop the loading indicator for the current component
      this.stopLoadingComment(this.component_id);
    }, 2000); // Debounce delay in milliseconds
  }
  async selectFile(files: FileEntry[]) {
    this.selectedFiles = files;
  }
  async startLoadingComment() {
    this.showCommentLoadingOverlay = true;
    const comment = this.addCommentInput.nativeElement.value;

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
