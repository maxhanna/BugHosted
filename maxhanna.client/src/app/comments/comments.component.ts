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
  @Input() storyId?: number = undefined;
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
    if (this.depth == 0) {
      this.decryptCommentsRecursively(this.commentList);
    }
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
      comment.commentText = this.encryptionService.decryptContent(message, comment.user.id + "");
    } else {
      alert("Error, contact an administrator.");
    }
  }

  getTextForDOM(text: string, component_id: any) {
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (!parent) return "Error fetching parent component.";

    let componentIdStr: string;
    if (component_id === null || component_id === undefined || component_id === '') {
      componentIdStr = '';
    } else if (typeof component_id === 'number') {
      componentIdStr = 'commentText' + component_id;
    } else if (typeof component_id === 'string') {
      componentIdStr = component_id.startsWith('commentText') ? component_id : 'commentText' + component_id;
    } else {
      componentIdStr = String(component_id);
    }

    return parent.getTextForDOM(text, componentIdStr);
  }

  createClickableUrls(text?: string, commentId?: number): SafeHtml {
    // Pass the raw numeric id when available so getTextForDOM can normalize it.
    const idToPass = commentId !== undefined ? commentId : (this.component_id ?? undefined);
    return this.getTextForDOM(text ?? "", idToPass as any);
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

    const commentText = comment.commentText?.trim();

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
      for (let c of this.commentList) {
        if (c.id == commentId) continue;
        this.minimizedComments.add(c.id);
      }
    }
  }

  commentPosted(event: { results: any, content: any, originalContent: string }, parentComment?: FileComment) {
    const commentAdded = event.content.comment as FileComment;
    commentAdded.id = parseInt(event.results.split(" ")[0]);
    commentAdded.commentText = this.encryptionService.decryptContent(commentAdded.commentText ?? "", commentAdded.user.id + "");
    if (!parentComment) {
      this.commentAddedEvent.emit(commentAdded);
    } else {
      if (!parentComment.comments) { parentComment.comments = []; }
      parentComment.comments.push(commentAdded);
    }
    this.replyingToCommentId = undefined;
    this.replyingToCommentEvent.emit(this.replyingToCommentId);
    // After a new comment is added, try to update any polls in the DOM for this comment
    try {
      const parent = this.inputtedParentRef ?? this.parentRef;
      const anyParent: any = parent as any;
      if (anyParent && anyParent.storyResponse && anyParent.storyResponse.polls) {
        this.updateCommentPollsInDOM(anyParent.storyResponse.polls);
      }
    } catch (e) {
      console.warn('Failed to update comment polls in DOM', e);
    }
  }

  // Update comment poll HTML in the DOM when poll results are available in the storyResponse
  updateCommentPollsInDOM(polls: any[]) {
    if (!polls || polls.length === 0) return;
    for (const poll of polls) {
      try {
        if (!poll || !poll.componentId) continue;
        // We're only interested in comment component IDs here
        if (!poll.componentId.startsWith('commentText')) continue;

        const tgt = document.getElementById(poll.componentId);
        if (!tgt) continue;

        const question = poll.question ?? '';

        // Determine if current user has voted on this poll
        const currentUser = this.inputtedParentRef?.user ?? this.parentRef?.user;
        const currentUserId = currentUser?.id ?? 0;
        const currentUserName = currentUser?.username ?? '';
        let hasCurrentUserVoted = false;
        try {
          if (poll.userVotes && poll.userVotes.length) {
            for (const v of poll.userVotes) {
              if (!v) continue;
              if ((v.userId && +v.userId === +currentUserId) || (v.UserId && +v.UserId === +currentUserId)) { hasCurrentUserVoted = true; break; }
              if ((v.id && +v.id === +currentUserId) || (v.user && v.user.id && +v.user.id === +currentUserId)) { hasCurrentUserVoted = true; break; }
              const uname = (v.username || v.Username || (v.user && v.user.username) || '').toString();
              if (uname && currentUserName && uname.toLowerCase() === currentUserName.toLowerCase()) { hasCurrentUserVoted = true; break; }
            }
          }
        } catch { hasCurrentUserVoted = false; }

        let html = '<div class="pollResults">';
        html += `<div class="pollQuestion">${question}</div>`;

        if (!hasCurrentUserVoted) {
          // Render checkboxes (same structure as SocialComponent) so clicking registers a vote immediately
          html += `<div class="poll-options">`;
          if (poll.options && poll.options.length) {
            for (const [i, opt] of (poll.options || []).entries()) {
              const optText = (opt && (opt.text || opt.Text || opt.value || opt.Value || opt)) ?? '';
              const escapedOpt = ('' + optText).replace(/'/g, "");
              const pollId = `poll_${poll.componentId}_${i}`;
              const inputId = `poll-option-${pollId}`;
              html += `
                <div class="poll-option">
                  <input type="checkbox" value="${escapedOpt}" id="${inputId}" name="${inputId}"
                    onClick="document.getElementById('pollCheckId').value='${inputId}';document.getElementById('pollQuestion').value='${question}';document.getElementById('pollComponentId').value='${poll.componentId}';document.getElementById('pollCheckClickedButton').click()">
                  <label for="${inputId}" onclick="document.getElementById('pollCheckId').value='${inputId}';document.getElementById('pollQuestion').value='${question}';document.getElementById('pollComponentId').value='${poll.componentId}';document.getElementById('pollCheckClickedButton').click()">${optText}</label>
                </div>`;
            }
          }
          html += `</div>`;
        } else {
          // User has voted: show results + voters
          let totalVotes = 0;
          if (poll.options && poll.options.length) {
            for (const opt of poll.options) {
              const pct = opt.percentage ?? 0;
              const votes = opt.voteCount ?? 0;
              totalVotes += votes;
              html += `
                <div class="pollOption">
                  <div class="pollOptionText">${opt.text} <span class="pollVotes">(${votes} votes, ${pct}%)</span></div>
                  <div class="pollBarContainer"><div class="pollBar" style="width:${pct}%"></div></div>
                </div>`;
            }
          }
          html += `<div class="pollTotal">Total votes: ${totalVotes}</div>`;

          if (poll.userVotes && poll.userVotes.length > 0) {
            html += '<div class="pollVoters">Voters: ';
            const voterSpans: string[] = [];
            for (const v of poll.userVotes) {
              const uname = v.username ?? v.userName ?? v.user_name ?? (v.user && v.user.username) ?? '';
              voterSpans.push(`<span class=\"pollVoter\" onclick=\"(function(){var mi=document.getElementById('mentionInput'); if(mi) mi.value='@${uname}';})();\">@${uname}</span>`);
            }
            html += voterSpans.join(', ');
            html += '</div>';
          }

          // Delete control
          html += `<div class="pollControls"><button onclick="(function(){var pc=document.getElementById('pollComponentId'); if(pc) pc.value='${poll.componentId}'; var pq=document.getElementById('pollQuestion'); if(pq) pq.value='${this.escapeHtmlAttribute(question)}'; document.getElementById('pollDeleteButton').click();})();">Delete vote</button></div>`;
        }

        html += '</div>';

        // Insert poll HTML into a dedicated container after the comment text to avoid breaking comment nesting
        let pollContainer: HTMLElement | null = null;
        try {
          pollContainer = tgt.parentElement?.querySelector('.comment-poll-container') as HTMLElement | null;
          if (!pollContainer) {
            pollContainer = document.createElement('div');
            pollContainer.className = 'comment-poll-container';
            // insert after tgt
            if (tgt.parentNode) {
              tgt.parentNode.insertBefore(pollContainer, tgt.nextSibling);
            }
          }
          if (pollContainer) {
            pollContainer.innerHTML = html;
          }
        } catch (e) {
          // fallback: replace tgt content if insertion fails
          try { tgt.innerHTML = html; } catch {} 
        }

        // Pre-populate hidden inputs
        try {
          const pq = document.getElementById('pollQuestion') as HTMLInputElement | null;
          const pc = document.getElementById('pollComponentId') as HTMLInputElement | null;
          if (pq) pq.value = question;
          if (pc) pc.value = poll.componentId;
        } catch (e) {}
      } catch (ex) {
        console.warn('Error updating poll for', poll.componentId, ex);
        continue;
      }
    }
  }

  // Helper to escape single quotes/double quotes for inline attribute usage
  private escapeHtmlAttribute(input: string): string {
    if (!input) return '';
    return input.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\"/g, '\\\"');
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
  speakMessage(message?: string) {
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
      const text = comment.commentText;
      await navigator.clipboard.writeText(text ?? "");
      parent?.showNotification("Text copied to Clipboard!");
    } catch (err) {
      console.error('Failed to copy text: ', err);
      parent?.showNotification('Failed to copy text. Please select and copy manually.');
    }
  }
  private decryptCommentsRecursively(comments: FileComment[]): void {
    comments.forEach(comment => {
      if (comment.commentText) {
        try {
          comment.commentText = this.encryptionService.decryptContent(
            comment.commentText,
            comment.user.id + ""
          );
        } catch (ex) {
          console.error(`Failed to decrypt comment ID ${comment.id}: ${ex}`);
        }
      }

      // Recurse into child comments if they exist
      if (comment.comments && comment.comments.length > 0) {
        this.decryptCommentsRecursively(comment.comments);
      }
    });
  }
}
