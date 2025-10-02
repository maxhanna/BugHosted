import { Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild, AfterViewInit } from '@angular/core';
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
import { Poll } from '../../services/datacontracts/social/poll';

@Component({
  selector: 'app-comments',
  templateUrl: './comments.component.html',
  styleUrl: './comments.component.css',
  standalone: false
})
export class CommentsComponent extends ChildComponent implements OnInit, AfterViewInit {
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
  @Input() fileId?: number = undefined;
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

  ngAfterViewInit(): void {
    this.scheduleCommentPollRender();
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
    this.scheduleCommentPollRender();
  }

  private scheduleCommentPollRender() {
    setTimeout(() => {
      this.updateCommentPollsInDOM();
    }, 120);
  }

  private collectAllCommentPolls(): Poll[] {
    const result: Poll[] = [];
    const recurse = (comments: FileComment[]) => {
      for (const c of comments) {
        if (c.polls && c.polls.length) result.push(...c.polls);
        if (c.comments && c.comments.length) recurse(c.comments);
      }
    };
    try { recurse(this.commentList || []); } catch { }
    return result;
  }

  // Update comment poll HTML in the DOM using polls attached directly to each comment
  updateCommentPollsInDOM() {
    const polls = this.collectAllCommentPolls();
    if (!polls.length) return;
    // Deduplicate by componentId to avoid double-rendering
    const pollsMap = new Map<string, Poll>();
    for (const p of polls) {
      if (!p?.componentId) continue;
      if (!p.componentId.startsWith('commentText')) continue;
      if (!pollsMap.has(p.componentId)) pollsMap.set(p.componentId, p);
    }
    const currentUser = this.inputtedParentRef?.user ?? this.parentRef?.user;
    const currentUserId = currentUser?.id ?? 0;
    const currentUserName = currentUser?.username ?? '';

    for (const poll of pollsMap.values()) {
      try {
        const tgt = document.getElementById(poll.componentId);
        if (!tgt) continue; // wait for retry
        // If we've already cleaned & rendered a poll container for this comment, just update existing container
        const existingContainer = tgt.parentElement?.querySelector(`.comment-poll-container[data-poll-for="${poll.componentId}"]`);
        const question = poll.question ?? '';

        // Collect option texts for cleanup
        const optionTexts: string[] = Array.isArray(poll.options) ? poll.options.map((o: any) => (o && (o.text || o.Text || o.value || o.Value || o)) ?? '').filter((s: string) => !!s) : [];

        // Only attempt to strip original markup once unless no container yet
        if (!tgt.getAttribute('data-poll-cleaned') || !existingContainer) {
          try { this.stripPollMarkupFromElement(tgt, question, optionTexts); } catch { }
        }

        // Determine vote status
        let hasCurrentUserVoted = false;
        try {
          if (poll.userVotes?.length) {
            for (const v of poll.userVotes) {
              if (!v) continue;
              if ((v.userId && v.userId === currentUserId)) {
                hasCurrentUserVoted = true;
                break;
              }
              const uname = (v.username || '').toString();
              if (uname
                && currentUserName
                && uname.toLowerCase() === currentUserName.toLowerCase()) {
                hasCurrentUserVoted = true;
                break;
              }
            }
          }
        } catch { hasCurrentUserVoted = false; }

        let html = '';

        if (hasCurrentUserVoted) {
          console.log("debug: user has voted", poll);
          html += '<div class="pollResults">'
          html += `<div class="pollQuestion">${question}</div>`;
          let totalVotes = 0;
          if (poll.options?.length) {
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
          if (poll.userVotes?.length) {
            html += '<div class="pollVoters">Voters: ';
            const voterSpans: string[] = [];
            for (const v of poll.userVotes) {
              const uname = v.username ?? '';
              voterSpans.push(`<span class=\"pollVoter\" onclick=\"(function(){var mi=document.getElementById('mentionInput'); if(mi) mi.value='@${uname}';})();\">@${uname}</span>`);
            }
            html += voterSpans.join(', ');
            html += '</div>';
          }
          html += `<div class="pollControls"><button onclick="(function(){var pc=document.getElementById('pollComponentId'); if(pc) pc.value='${poll.componentId}'; var pq=document.getElementById('pollQuestion'); if(pq) pq.value='${this.escapeHtmlAttribute(question)}'; document.getElementById('pollDeleteButton').click();})();">Delete vote</button></div>`;
          html += '</div>';        
        }

        let pollContainer: HTMLElement | null = existingContainer as HTMLElement | null;
        try {
          if (!pollContainer) {
            pollContainer = document.createElement('div');
            pollContainer.className = 'comment-poll-container';
            pollContainer.setAttribute('data-poll-for', poll.componentId);
            if (tgt.parentNode) tgt.parentNode.insertBefore(pollContainer, tgt.nextSibling);
          }
          pollContainer.innerHTML = html;
          tgt.setAttribute('data-poll-cleaned', '1');
        } catch {
          try { tgt.innerHTML = html; tgt.setAttribute('data-poll-cleaned', '1'); } catch { }
        }

        try {
          const pq = document.getElementById('pollQuestion') as HTMLInputElement | null;
          const pc = document.getElementById('pollComponentId') as HTMLInputElement | null;
          if (pq) pq.value = question;
          if (pc) pc.value = poll.componentId;
        } catch { }
      } catch (ex) {
        // Continue with other polls
        // console.warn('Error rendering comment poll', poll?.componentId, ex);
        continue;
      }
    }
  }

  // Robustly strip poll lines from the original comment content
  private stripPollMarkupFromElement(el: HTMLElement, question: string, optionTexts: string[]) {
    if (!el) return;
    const q = (question || '').trim().toLowerCase();
    const opts = new Set(optionTexts.map(o => (o || '').trim().toLowerCase()).filter(Boolean));

    // If element already cleaned, skip
    if (el.getAttribute('data-poll-cleaned') === '1') return;

    // Strategy:
    // 1. Try removing child nodes that exactly match question/option text.
    // 2. If a single text node contains all poll lines, rebuild it without those lines.
    const nodesToRemove: ChildNode[] = [];
    el.childNodes.forEach(n => {
      const text = (n.textContent || '').trim().toLowerCase();
      if (!text) return;
      if (text === q || opts.has(text)) nodesToRemove.push(n);
    });
    if (nodesToRemove.length) {
      nodesToRemove.forEach(n => n.parentNode?.removeChild(n));
    } else if (el.childNodes.length === 1) {
      const single = el.childNodes[0];
      const raw = (single.textContent || '');
      const lines = raw.split(/\r?\n|<br\s*\/?>/i);
      if (lines.some(l => l.trim().toLowerCase() === q) && lines.some(l => opts.has(l.trim().toLowerCase()))) {
        const kept = lines.filter(l => {
          const low = l.trim().toLowerCase();
          if (!low) return false;
          if (low === q) return false;
          if (opts.has(low)) return false;
          return true;
        });
        (single as any).textContent = kept.join('\n');
      }
    }

    // Secondary pass: regex removal inside innerHTML if artifacts remain
    let html = el.innerHTML;
    const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const removeLine = (val: string) => {
      if (!val) return;
      const esc = escapeRegex(val.trim());
      // remove paragraphs containing it
      html = html.replace(new RegExp(`<p[^>]*>\\s*${esc}\\s*</p>`, 'gi'), '');
      // remove standalone occurrences followed/preceded by breaks
      html = html.replace(new RegExp(`${esc}\\s*<br\\s*/?>`, 'gi'), '');
      html = html.replace(new RegExp(`<br\\s*/?>\\s*${esc}`, 'gi'), '');
    };
    removeLine(question);
    optionTexts.forEach(removeLine);
    el.innerHTML = html;
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
