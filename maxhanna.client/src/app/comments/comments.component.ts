import { Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild, AfterViewInit, OnChanges, SimpleChanges } from '@angular/core';
import { AppComponent } from '../app.component';
import { CommentService } from '../../services/comment.service';
import { ChildComponent } from '../child.component';
import { SafeHtml } from '@angular/platform-browser';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { User } from '../../services/datacontracts/user/user';
import { FileComment } from '../../services/datacontracts/file/file-comment';
import { MediaSelectorComponent } from '../media-selector/media-selector.component';
import { EncryptionService } from '../../services/encryption.service';
import { TextToSpeechService } from '../../services/text-to-speech.service';
import { Poll } from '../../services/datacontracts/social/poll';

@Component({
  selector: 'app-comments',
  templateUrl: './comments.component.html',
  styleUrl: './comments.component.css',
  standalone: false
})
export class CommentsComponent extends ChildComponent implements OnInit, AfterViewInit, OnChanges {
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
  hasDeeplinkChanged = false;
  _remainingPath: number[] | undefined;
  private _scrollAttemptCount = 0; 

  @ViewChild('addCommentInput') addCommentInput!: ElementRef<HTMLInputElement>;
  @ViewChild('subCommentComponent') subCommentComponent!: CommentsComponent;
  @ViewChild('commentInputAreaMediaSelector') commentInputAreaMediaSelector!: MediaSelectorComponent;
  @ViewChild('rootCommentsSection') rootCommentsSection?: ElementRef<HTMLDivElement>;

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
  @Input() scrollToCommentId?: number;
  @Input() deepLinkPath?: number[];
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
    // Only root orchestrates initial deep link path discovery
    if (this.depth === 0) {
      this.tryScrollToRequestedComment(); 
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['scrollToCommentId'] && !changes['scrollToCommentId'].firstChange) {
      setTimeout(() => this.tryScrollToRequestedComment(), 100);
    }
    if (!this.hasDeeplinkChanged && changes['deepLinkPath'] && this.deepLinkPath && this.deepLinkPath.length) {
      this.hasDeeplinkChanged = true;
      if (this.depth > 0) {
        this._remainingPath = [...this.deepLinkPath];
        setTimeout(() => this.processDeepLinkPath(), 0);
      }
    }
  } 

  // Returns a trimmed plain-text snippet of the last (parent) breadcrumb comment
  getActiveBreadcrumbSnippet(maxLength: number = 140): string {
    if (!this.breadcrumbComments || !this.breadcrumbComments.length) return '';
    const parent = this.breadcrumbComments[this.breadcrumbComments.length - 1];
    if (!parent || !parent.commentText) return '';
    // Strip HTML tags & condense whitespace
    let txt = parent.user.username + ': ' + parent.commentText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!txt) return '';
    if (txt.length > maxLength) {
      txt = txt.slice(0, maxLength - 1) + '…';
    }
    return txt;
  }

  private findCommentPath(targetId: number, list: FileComment[]): FileComment[] | null {
    for (const c of list) {
      if (c.id === targetId) return [c];
      if (c.comments && c.comments.length) {
        const subPath = this.findCommentPath(targetId, c.comments);
        if (subPath) return [c, ...subPath];
      }
    }
    return null;
  }
  private tryScrollToRequestedComment() {
    if (!this.scrollToCommentId) return; 
    if (!this.deepLinkPath || !this.deepLinkPath.length) {
      const path = this.findCommentPath(this.scrollToCommentId, this.commentList);
      if (!path) {
        if (this._scrollAttemptCount < 10) {
          this._scrollAttemptCount++;
            setTimeout(() => this.tryScrollToRequestedComment(), 100 + this._scrollAttemptCount * 50);
        } else {
          console.warn('[DeepLink] Failed to build path for target', this.scrollToCommentId);
        }
        return;
      }
      this.deepLinkPath = path.map(p => p.id);
    }
    this._remainingPath = [...(this.deepLinkPath || [])];
    this.processDeepLinkPath();
  }

  private processDeepLinkPath() {
    if (!this._remainingPath || !this._remainingPath.length) return;
    const targetId = this._remainingPath[this._remainingPath.length - 1];
    const domId = 'commentText' + targetId;
    const el = document.getElementById(domId) || document.getElementById('subComment' + targetId);
    if (el) {
      if (this.scrollToCommentId === targetId) {
        try {
          if (this.depth === 0) {
            this.scrollRootSectionToBottom();
          }
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (this.depth === 0) {
            this.scrollToCommentId = undefined;
          } else {
            setTimeout(() => {
              if (targetId) {  
                document.getElementById("expandButton"+targetId)?.click();
                this._remainingPath = undefined; 
                this.deepLinkPath = undefined; 
                this.scrollLastCommentIntoViewDelayed(); 
              }
            }, 100);
          }
        } catch {}
      }
      return; // Finished
    }
 
    if (this._remainingPath.length > 1) {
      const nextAncestorId = this._remainingPath[0];
      const commentToExpand = this.commentList.find(c => c.id === nextAncestorId);
      if (commentToExpand) {
        if (this.depth === 0) {
          if (this.minimizedComments.has(nextAncestorId)) {
            this.minimizedComments.delete(nextAncestorId);
          }
          this._remainingPath = this._remainingPath.slice(1);
          const nextId = this._remainingPath[0];
          if (nextId && !this.commentList.some(c => c.id === nextId)) {
            this.scrollRootSectionToBottom();
            setTimeout(() => {
              if (this._remainingPath) { 
                for(let cId of this._remainingPath) {
                  document.getElementById("expandButton"+cId)?.click();
                  //console.log("attempting to click on expandButton"+cId);
                }
              }
            }, 100);
            
            return;
          }
          setTimeout(() => this.processDeepLinkPath(), 50);
          return;
        } else { 
          this.expandComment(commentToExpand);
          this._remainingPath = this._remainingPath.slice(1);
          setTimeout(() => this.processDeepLinkPath(), 50);
          return;
        }
      } else {
        return;
      }
    } 
  }

  private scrollLastCommentIntoViewDelayed() {
    setTimeout(() => {
      try {
        let lastId: number | undefined;
        const findLast = (list: FileComment[]): number | undefined => {
          if (!list || !list.length) return undefined;
          return list[list.length - 1].id;
        };
        lastId = findLast(this.commentList);
        if (!lastId) return;
        const el = document.getElementById('commentText' + lastId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'end' });
        } else {
          const nodes = document.querySelectorAll('.commentTextDiv');
          if (nodes && nodes.length) {
            (nodes[nodes.length - 1] as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'end' });
          }
        }
      } catch {}
    }, 1000);
  }

  getChildDeepLinkPath(parent: FileComment, child: FileComment): number[] | undefined {
    const sourcePath = (this._remainingPath && this._remainingPath.length) ? [parent.id, ...this._remainingPath] : this.deepLinkPath;
    if (!sourcePath || !sourcePath.length) return undefined;
    const parentIdx = sourcePath.indexOf(parent.id);
    if (parentIdx === -1) return undefined;
    if (sourcePath[parentIdx + 1] !== child.id) return undefined;
    return sourcePath.slice(parentIdx + 1);
  }

  private scrollRootSectionToBottom() {
    if (!this.rootCommentsSection) return;
    try {
      const div = this.rootCommentsSection.nativeElement;
      div.scrollTop = div.scrollHeight;
    } catch {}
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
    const currentUser = this.inputtedParentRef?.user ?? this.parentRef?.user;
    const currentUserId = currentUser?.id ?? 0;
    const currentUserName = currentUser?.username?.toLowerCase() ?? '';

    // Group polls by componentId
    const grouped = new Map<string, Poll[]>();
    for (const p of polls) {
      if (!p?.componentId || !p.componentId.startsWith('commentText')) continue;
      if (!grouped.has(p.componentId)) grouped.set(p.componentId, []);
      grouped.get(p.componentId)!.push(p);
    }

    const applyToComments = (comments: FileComment[]) => {
      for (const c of comments) {
        const key = 'commentText' + c.id;
        const commentPolls = grouped.get(key);
        if (commentPolls && commentPolls.length) {
          // Determine if user voted in ANY poll for this comment
            let userVoted = false;
            for (const poll of commentPolls) {
              try {
                if (poll.userVotes?.length) {
                  for (const v of poll.userVotes) {
                    if (!v) continue;
                    if ((v.userId && v.userId === currentUserId)) { userVoted = true; break; }
                    const uname = (v.username || '').toString().toLowerCase();
                    if (uname && uname === currentUserName) { userVoted = true; break; }
                  }
                }
              } catch {}
              if (userVoted) break;
            }
            if (userVoted) {
              // Build consolidated HTML for all polls in this comment
              let combined = '';
              for (const poll of commentPolls) {
                const question = poll.question ?? '';
                const totalVotes = poll.totalVotes ?? (poll.userVotes ? poll.userVotes.length : 0);
                combined += `<div class="poll-container" data-component-id="${poll.componentId}">`;
                combined += `<div class="poll-question">${question}</div>`;
                combined += `<div class="poll-options">`;
                for (const opt of (poll.options || [])) {
                  const pct = opt.percentage ?? 0;
                  const votes = opt.voteCount ?? 0;
                  const optText = (opt && opt.text) ?? '';
                  combined += `
                    <div class="poll-option">
                      <div class="poll-option-text">${optText}</div>
                      <div class="poll-result">
                        <div class="poll-bar" style="width: ${pct}%"></div>
                        <span class="poll-stats">${votes} votes (${pct}%)</span>
                      </div>
                    </div>`;
                }
                combined += `</div>`;
                combined += `<div class="poll-total">Total Votes: ${totalVotes}</div>`;
                if (poll.userVotes?.length) {
                  combined += `<div class="poll-voters">Voted: `;
                  const voters: string[] = [];
                  for (const v of poll.userVotes) {
                    const uname = v?.username || '';
                    if (!uname) continue;
                    voters.push(`@${uname}`);
                  }
                  combined += voters.join(' ');
                  combined += `</div>`;
                }
                combined += `<div class="pollControls"><button onclick=\"document.getElementById('pollQuestion').value='${this.escapeHtmlAttribute(question)}';document.getElementById('pollComponentId').value='${poll.componentId}';document.getElementById('pollDeleteButton').click();\">Delete vote</button></div>`;
                combined += `</div>`; // end poll-container
              }
              c.commentText = combined; // Replace original text with results
            }
        }
        if (c.comments?.length) applyToComments(c.comments);
      }
    };

    applyToComments(this.commentList);
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
