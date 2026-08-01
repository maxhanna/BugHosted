import { ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { Compactness } from '../../services/datacontracts/user/show-posts-from';
import { ChildComponent } from '../child.component';
import { MetaData, Story } from '../../services/datacontracts/social/story';
import { SocialService } from '../../services/social.service';
import { TopicService } from '../../services/topic.service';
import { AppComponent } from '../app.component';
import { Topic } from '../../services/datacontracts/topics/topic';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { User } from '../../services/datacontracts/user/user';
import { FileComment } from '../../services/datacontracts/file/file-comment';
import { TodoService } from '../../services/todo.service';
import { Todo } from '../../services/datacontracts/todo';
import { FileService } from '../../services/file.service';
import { EncryptionService } from '../../services/encryption.service';
import { TextToSpeechService } from '../../services/text-to-speech.service';
import { CurrencyFlagPipe } from '../currency-flag.pipe';
import { PollService } from '../../services/poll.service';
import { FollowService } from '../../services/follow.service';

@Component({
  selector: 'app-social-post',
  templateUrl: './social-post.component.html',
  styleUrl: './social-post.component.css',
  standalone: false,
  providers: [CurrencyFlagPipe]
})
export class SocialPostComponent extends ChildComponent implements OnInit {
  optionStory?: Story;
  visibilityStory?: Story;
  comments: FileComment[] = [];
  openedStoryComments: number[] = [];
  openedStoryYoutubeVideos: number[] = [];
  isStoryOptionsPanelOpen = false;
  isStoryVisibilityPanelOpen = false;
  isFollowingStory: { [key: number]: boolean } = {};
  isEditing: number[] = [];
  editingTopics: number[] = [];
  storyOverflowMap: { [key: string]: boolean } = {};
  userProfileId?: number = undefined;
  expanded: string[] = [];
  minimizedStories: number[] = [];
  private overflowCache: Record<string, boolean> = {};

  @Input() socialId?: number;
  @Input() story?: Story;
  @Input() user?: User;
  @Input() profileUserId?: number;
  @Input() commentId?: number;
  @Input() feedIndex = 0;
  @Input() autoOpenComments = false;
  @Input() canLoad = false;
  @Input() compactness: Compactness = "yes";
  @Input() parent?: AppComponent;
  @Input() inputtedParentRef?: AppComponent;

  @Output() postDeleted = new EventEmitter<Story>();
  @Output() topicClicked = new EventEmitter<Topic[]>();
  @Output() topicIgnored = new EventEmitter<void>();
  @Output() postHidden = new EventEmitter<void>();

  constructor(private socialService: SocialService,
    private topicService: TopicService,
    private todoService: TodoService,
    private fileService: FileService,
    private encryptionService: EncryptionService,
    private textToSpeechService: TextToSpeechService,
    private cd: ChangeDetectorRef,
    private currencyFlagPipe: CurrencyFlagPipe,
    private pollService: PollService,
    private followService: FollowService
  ) {
    super();
  }

  async ngOnInit() {
    if (this.inputtedParentRef) {
      this.parentRef = this.inputtedParentRef;
    }
    if (this.profileUserId) {
      this.userProfileId = this.profileUserId;
    }
    if (this.autoOpenComments && this.story?.id) {
      this.openedStoryComments.push(this.story.id);
    }
    this.loadMinimizedStories();

    // Pre-loaded full story (deep-link) → use it directly, else fetch by id.
    if (this.story && this.story.id && this.story.storyText != null && this.story.storyText !== undefined) {
      this.isLoading = false;
      await this.afterStoryReady();
    } else {
      await this.fetchStory();
    }
    // Reload minimized state after the story is known (fetch path sets it after ngOnInit).
    this.loadMinimizedStories();
  }

  private async fetchStory() {
    if (!this.socialId) { this.isLoading = false; return; }
    this.isLoading = true;
    const s = await this.socialService.getStoryById(this.socialId);
    if (s) {
      try {
        s.storyText = this.encryptionService.decryptContent(s.storyText ?? '', s.user?.id + '');
      } catch (ex) {
        console.error(`Failed to decrypt story ID ${s.id}:`, ex);
      }
      this.story = s;
      await this.afterStoryReady();
    }
    this.isLoading = false;
  }

  private async afterStoryReady() {
    if (!this.story) return;
    this.setPollResultsIfVoted(this.story);
    await this.loadPollResultsForStories([this.story]);
    this.updatePollsInDOM(100);
  }

  private setPollResultsIfVoted(story: Story) {
    if (!story) return;
    const storyPolls = story.polls || [];
    storyPolls.forEach(poll => {
      if (!poll || !story.storyText?.includes('[Poll]')) return;
      if (poll.userVotes.some(x => x.userId === this.parentRef?.user?.id)) {
        const pollRegex = /\[Poll\](.*?)\[\/Poll\]/s;
        const match = story.storyText?.match(pollRegex);
        if (match) {
          poll.options.forEach(option => {
            story.storyText = story.storyText?.replace(option.text, `${option.text} (${option.voteCount} votes, ${option.percentage}%)`);
          });
        }
        if (!story.storyText.includes("Voters") && !story.storyText.includes("Delete Vote")) {
          story.storyText += `<button onclick=\"document.getElementById('pollComponentId').value='storyText${story.id}';document.getElementById('pollDeleteButton').click()\" class=\"deletePollVoteButton\">Delete Vote</button>`;
          story.storyText += `<div class=voterSpan>Voters(${poll.userVotes.length}): ${poll.userVotes.map(x => '@' + x.username).join(', ')}</div>`;
        }
      }
    });
  }

  private async loadPollResultsForStories(stories: Story[]) {
    if (!stories?.length || !this.parentRef?.user?.id) return;

    for (const story of stories) {
      if (!story.polls?.length) continue;
      if (!story.storyText?.includes('[Poll]')) continue;

      for (const poll of story.polls) {
        if (!poll.componentId) continue;

        try {
          const pollResults = await this.pollService.getResults(poll.componentId);
          if (pollResults) {
            poll.totalVotes = pollResults.totalVotes ?? poll.totalVotes ?? 0;

            if (pollResults.options) {
              poll.options = pollResults.options.map((opt: any) => ({
                id: opt.id ?? opt.value ?? opt.Value ?? '',
                text: opt.text ?? opt.value ?? opt.Value ?? '',
                voteCount: opt.voteCount ?? opt.VoteCount ?? 0,
                percentage: opt.percentage ?? (poll.totalVotes > 0 ? Math.round((opt.voteCount / poll.totalVotes) * 100) : 0)
              }));
            }
            if (pollResults.userVotes) {
              poll.userVotes = pollResults.userVotes;
            }

            if (poll.options && poll.totalVotes > 0) {
              poll.options.forEach(option => {
                story.storyText = story.storyText?.replace(
                  option.text,
                  `${option.text} (${option.voteCount} votes, ${option.percentage}%)`
                );
              });
            }

            const hasVoted = poll.userVotes?.some((v: any) => v.userId === this.parentRef?.user?.id);
            if (hasVoted && !story.storyText.includes("Voters") && !story.storyText.includes("Delete Vote")) {
              story.storyText += `<button onclick=\"document.getElementById('pollComponentId').value='${poll.componentId}';document.getElementById('pollDeleteButton').click()\" class=\"deletePollVoteButton\">Delete Vote</button>`;
              story.storyText += `<div class=voterSpan>Voters(${poll.userVotes.length}): ${poll.userVotes.map((x: any) => '@' + x.username).join(', ')}</div>`;
            }
          }
        } catch (error) {
          console.error(`Failed to load poll results for componentId ${poll.componentId}:`, error);
        }
      }
    }

    this.updatePollsInDOM(100);
  }

  updatePollsInDOM(delayMs: number = 1000): void {
    if (!this.story) return;
    setTimeout(() => {
      (this.story?.polls || []).forEach(poll => {
        const componentId = poll.componentId;
        const pollContainer = document.getElementById(componentId);
        if (!pollContainer) return;
        if (this.parentRef && typeof this.parentRef.buildPollHtmlFromPollObject === 'function') {
          try {
            pollContainer.innerHTML = this.parentRef.buildPollHtmlFromPollObject(poll, componentId);
          } catch (e) {
            console.error('Error building poll HTML from parent builder', e);
          }
        } else {
          pollContainer.innerHTML = '';
        }
      });
    }, delayMs);
  }

  async delete(story: Story) {
    const parent = this.parentRef;
    if (!parent?.user?.id) { return alert("Error: Cannot delete a post unless logged in or the post belongs to you."); }
    if (!confirm("Are you sure you want to delete this post?")) return;
    this.startLoading();
    const sessionToken = await parent.getSessionToken();
    const res = await this.socialService.deleteStory(parent.user.id, story, sessionToken);
    if (res) {
      this.parentRef?.showNotification(res);
      if (res.toLowerCase().includes('successful')) {
        this.postDeleted.emit(story);
      }
    }
    this.closeStoryOptionsPanel();
    this.stopLoading();
  }

  async edit(story: Story) {
    if (this.isEditing.includes(story.id ?? 0)) {
      this.isEditing = this.isEditing.filter(x => x != story.id);
    } else {
      this.isEditing.push(story.id ?? 0);
    }
    this.closeStoryOptionsPanel();
  }

  cancelEdit(story: Story) {
    if (!story || story.id === undefined) return;
    this.isEditing = this.isEditing.filter(x => x != story.id);
    this.isStoryOptionsPanelOpen = false;
  }

  async editTopic(story: Story) {
    if (story.id) {
      if (this.editingTopics.includes(story.id)) {
        this.editingTopics = this.editingTopics.filter(x => x != story.id);
      } else {
        this.editingTopics.push(story.id);
      }
    }
  }

  async onStoryUpdated(event: { results: any, content: any, originalContent: string }, story: Story) {
    try {
      if (event && event.results) {
        story.storyText = event.originalContent;
        this.isEditing = this.isEditing.filter(x => x != story.id);
        this.parentRef?.showNotification(`Post #${story.id} edited successfully.`);
      } else {
        this.parentRef?.showNotification(`Failed to edit post #${story.id}.`);
      }
    } catch (err) {
      console.error('onStoryUpdated error', err);
    }
  }

  async editStoryTopic(topics: Topic[], story: Story) {
    const user = this.parentRef?.user ?? this.parent?.user;
    if (user) {
      this.parentRef?.updateLastSeen();
      this.socialService.editTopics(story, topics);
      this.closeStoryOptionsPanel();
      this.editingTopics = this.editingTopics.filter(x => x != story.id);
      story.storyTopics = topics;
    }
  }

  onOptionStoryVisibilityChange(event: Event, story: Story) {
    const val = (event.target as HTMLSelectElement | null)?.value;
    if (!story) return;
    if (val === 'public' || val === 'following' || val === 'self') {
      story.visibility = val;
    }
    this.saveStoryVisibility(story);
  }

  async saveStoryVisibility(story: Story) {
    const parent = this.parent ?? this.parentRef;
    if (!parent?.user?.id) return alert('Must be logged in to change visibility.');
    try {
      const sessionToken = await parent.getSessionToken();
      await this.socialService.editStory(parent.user.id, story, sessionToken ?? '');
      this.parentRef?.showNotification('Visibility updated.');
      this.editingTopics = this.editingTopics.filter(x => x != story.id);
      this.closeStoryOptionsPanel();
    } catch (err) {
      console.error('Failed to update visibility', err);
      this.parentRef?.showNotification('Failed to update visibility');
    }
  }

  maybeShowStoryOptionsPanel(story: Story) {
    const currentUserId = this.parentRef?.user?.id ?? this.parent?.user?.id;
    if (!story || !story.user) return;
    if (currentUserId && (story.user.id === currentUserId || currentUserId === 1)) {
      this.showStoryVisibilityPanel(story);
    } else {
      this.parentRef?.showNotification('You are not the owner of this post.');
    }
  }

  showStoryVisibilityPanel(story: Story) {
    if (this.isStoryVisibilityPanelOpen) {
      this.closeStoryVisibilityPanel();
      return;
    }
    this.visibilityStory = story;
    this.isStoryVisibilityPanelOpen = true;
    const parent = this.parent ?? this.parentRef;
    parent?.showOverlay();
  }
  closeStoryVisibilityPanel() {
    this.isStoryVisibilityPanelOpen = false;
    this.visibilityStory = undefined;
    const parent = this.parent ?? this.parentRef;
    parent?.closeOverlay();
  }

  async removeTopicsFromStory(topicsToRemove: Topic[], story: Story) {
    let updatedTopics = story.storyTopics?.filter(
      x => !topicsToRemove.some(t => t.id === x.id)
    ) ?? [];

    await this.editStoryTopic(updatedTopics, story);
  }

  extractUrl(text?: string) {
    if (!text) return;
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    const matches = text.match(urlPattern);
    return matches ? matches[0] : undefined;
  }

  goToLink(story?: Story, metadataUrl?: string) {
    if (story && story.storyText) {
      const goodUrl = metadataUrl ?? this.extractUrl(story.storyText);
      if (goodUrl) {
        this.parentRef?.visitExternalLink(goodUrl);
      }
    }
    else {
      if (story && story.metadata) {
        const tmpUrl = story.metadata[0].imageUrl;
        if (tmpUrl) {
          this.parentRef?.visitExternalLink(tmpUrl);
        }
      }
    }
  }

  isValidYoutubeImageUrl(url?: string): boolean {
    if (!url) return false;
    return url.includes("ytimg");
  }

  toggleCollapse(storyId?: string): void {
    if (!storyId) return;
    if (!this.expanded.includes(storyId)) {
      this.storyOverflowMap[storyId as string] = !this.storyOverflowMap[storyId as string];
      this.expanded.push(storyId);
    }
  }

  toggleHeaderCollapse(storyId?: number, event?: Event): void {
    if (!storyId) return;
    const targetId = (event?.target as HTMLElement)?.id ?? undefined;
    if (event && event.target !== event.currentTarget && targetId != 'storyDate') {
      return;
    }

    if (this.minimizedStories.includes(storyId)) {
      this.minimizedStories = this.minimizedStories.filter(x => x != storyId);
    } else {
      this.minimizedStories.push(storyId);
    }
    this.saveMinimizedStories();
    this.cd.detectChanges();
  }

  private readonly MINIMIZED_KEY = 'bughosted_minimized_stories';
  private readonly MINIMIZED_EXPIRY_DAYS = 10;

  private saveMinimizedStories(): void {
    // Read-modify-write so individual cards don't clobber each other's state.
    try {
      const raw = localStorage.getItem(this.MINIMIZED_KEY);
      const data = raw ? JSON.parse(raw) : null;
      let ids: number[] = [];
      if (data && !(Date.now() > data.expiry)) {
        ids = data.ids || [];
      }
      if (this.story?.id === undefined) return;
      const storyId = this.story.id;
      if (this.minimizedStories.includes(storyId)) {
        if (!ids.includes(storyId)) ids.push(storyId);
      } else {
        ids = ids.filter(x => x != storyId);
      }
      localStorage.setItem(this.MINIMIZED_KEY, JSON.stringify({
        ids,
        expiry: Date.now() + this.MINIMIZED_EXPIRY_DAYS * 24 * 60 * 60 * 1000
      }));
    } catch { }
  }

  private loadMinimizedStories(): void {
    try {
      const raw = localStorage.getItem(this.MINIMIZED_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (Date.now() > data.expiry) {
        localStorage.removeItem(this.MINIMIZED_KEY);
        return;
      }
      const all = data.ids || [];
      // Keep only this story's membership locally.
      if (this.story?.id !== undefined && all.includes(this.story.id)) {
        this.minimizedStories = [this.story.id];
      } else {
        this.minimizedStories = [];
      }
    } catch { }
  }

  isStoryExpanded(storyId: number): boolean {
    return !this.minimizedStories.includes(storyId);
  }

  isExpanded(elementId: string) {
    return this.expanded.includes(elementId);
  }

  async toggleFollowStory(story: Story) {
    const userId = this.parentRef?.user?.id;
    if (!userId || !story.id) {
      this.parentRef?.showNotification('You must be logged in to follow posts.');
      return;
    }
    const result = await this.followService.toggleFollow(userId, 'story', story.id);
    if (result) {
      this.isFollowingStory[story.id] = result.following;
      this.parentRef?.showNotification(result.message);
    }
  }

  showStoryOptionsPanel(story: Story) {
    if (this.isStoryOptionsPanelOpen) {
      this.closeStoryOptionsPanel();
      return;
    }
    this.optionStory = story;
    this.isStoryOptionsPanelOpen = true;
    const parent = this.parent ?? this.parentRef;
    parent?.showOverlay();

    if (story.id && this.parentRef?.user?.id) {
      this.followService.checkFollow(this.parentRef.user.id, 'story', story.id).then(following => {
        this.isFollowingStory[story.id!] = following;
      });
    }
  }
  closeStoryOptionsPanel() {
    this.isStoryOptionsPanelOpen = false;
    this.optionStory = undefined;
    const parent = this.parent ?? this.parentRef;
    parent?.closeOverlay();
  }

  showComments(storyId?: number) {
    const storyKey = storyId ?? 0;
    if (this.openedStoryComments.includes(storyKey)) {
      this.openedStoryComments = this.openedStoryComments.filter(x => x !== storyKey);
    } else {
      this.openedStoryComments.push(storyKey);
    }
    setTimeout(() => {
      const tgt = document.getElementById("commentsHeader" + storyId);
      if (tgt && !this.isElementInViewport(tgt)) {
        tgt.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }

  commentAddedEvent(comment: FileComment) {
    if (comment.storyId && this.story && this.story.id === comment.storyId) {
      try {
        if (!comment.decrypted && comment.commentText && comment.user && comment.user.id) {
          comment.commentText = this.encryptionService.decryptContent(comment.commentText, String(comment.user.id));
          comment.decrypted = true;
        }
      } catch (ex) {
        console.error('Failed to decrypt new comment', ex);
      }
      if (!this.story.storyComments) {
        this.story.storyComments = [comment];
      } else {
        this.story.storyComments.push(comment);
      }
      if (this.story.commentsCount) {
        this.story.commentsCount++;
      } else {
        this.story.commentsCount = 1;
      }
    }
  }

  commentRemovedEvent(comment: FileComment) {
    if (comment.storyId && this.story && this.story.id === comment.storyId) {
      if (this.story.storyComments) {
        this.story.storyComments = this.story.storyComments.filter(x => x.id !== comment.id);
        if (this.story.commentsCount) {
          this.story.commentsCount--;
        } else {
          this.story.commentsCount = 0;
        }
      }
    }
  }

  isYoutubeUrl(url?: string): boolean {
    return this.parentRef?.isYoutubeUrl(url) ?? false;
  }

  async addFileToMusicPlaylist(fileEntry: FileEntry) {
    if (!confirm("Add this file to your music playlist?")) {
      return;
    }
    const user = this.parentRef?.user;
    if (!user?.id || !fileEntry || !fileEntry.id) {
      return alert("Error: Cannot add file to music playlist without logging in or a valid file entry.");
    }

    let tmpTodo = new Todo();
    tmpTodo.type = "music";
    tmpTodo.todo = (fileEntry.givenFileName ?? fileEntry.fileName ?? `Video ID:${fileEntry.id}`).trim();
    tmpTodo.fileId = fileEntry.id;
    tmpTodo.date = new Date();
    const resTodo = await this.todoService.createTodo(user.id, tmpTodo);
    if (resTodo) {
      this.parentRef?.showNotification(`Added ${tmpTodo.todo} to music playlist.`);
    }
  }

  async addToMusicPlaylist(story?: Story, metadata?: MetaData, event?: Event) {
    if (!story || !story.metadata || !this.parentRef?.user?.id) return;
    const url = this.extractUrl(story.storyText);
    const title = metadata?.title ?? "";
    const yturl = this.extractYouTubeVideoURL(url);
    if (!yturl || !title || yturl.trim() == "" || title.trim() == "") {
      return alert("Title & URL cannot be empty!");
    }
    let tmpTodo = new Todo();
    tmpTodo.type = "music";
    tmpTodo.url = yturl.trim();
    tmpTodo.todo = title.replace("- YouTube", "").trim();

    const resTodo = await this.todoService.createTodo(this.parentRef.user.id, tmpTodo);
    if (resTodo) {
      this.parentRef?.showNotification(`Added ${title} to music playlist.`);
    }
    if (event) {
      const button = event.target as HTMLButtonElement;
      button.textContent = "Added";
      button.disabled = true;
    }
  }

  extractYouTubeVideoURL(url?: string) {
    if (!url) return;
    const youtubeRegex = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(youtubeRegex);

    if (match && match[1]) {
      return "https://www.youtube.com/watch?v=" + match[1];
    } else {
      return url;
    }
  }

  hasOverflow(elementId: string): boolean {
    if (this.isLoading || !this.canLoad) return false;
    if (this.compactness.includes("no")) {
      return false;
    }
    if (this.overflowCache[elementId] !== undefined) {
      return this.overflowCache[elementId];
    }

    const element = document.getElementById(elementId);
    if (!element) return false;

    if (this.compactness.includes("yess")) {
      if (this.story && this.story.storyFiles && this.story.storyFiles.length > 0) {
        this.overflowCache[elementId] = true;
        return this.overflowCache[elementId];
      }
    }

    if (this.compactness.includes("yes")) {
      if (this.story && this.story.metadata && this.story.metadata.length > 0) {
        this.overflowCache[elementId] = true;
        return this.overflowCache[elementId];
      }
    }

    const threshold = 400;
    const buffer = 20;
    this.overflowCache[elementId] = element.scrollHeight >= (threshold + buffer);

    return this.overflowCache[elementId];
  }

  getTextForDOM(text?: string, componentId?: any) {
    const parent = this.parent ?? this.parentRef;
    return parent?.getTextForDOM(text, "storyText" + componentId);
  }

  async hide(story: Story) {
    const parent = this.parent ?? this.parentRef;
    const user = parent?.user;
    if (user && user.id && story.id) {
      this.parentRef?.updateLastSeen();
      if (story.hidden) {
        story.hidden = false;
        this.socialService.unhideStory(user.id, story.id).then(res => {
          if (res) {
            parent.showNotification(res);
          }
        })
      } else {
        story.hidden = true;
        this.socialService.hideStory(user.id, story.id).then(res => {
          if (res) {
            parent.showNotification(res);
          }
          this.postHidden.emit();
        });
      }
    }
  }

  copyDivText = async (element: HTMLElement) => {
    try {
      const text = element.innerText;
      await navigator.clipboard.writeText(text);
      this.parentRef?.showNotification("Text copied to Clipboard!");
    } catch (err) {
      console.error('Failed to copy text: ', err);
      alert('Failed to copy text. Please select and copy manually.');
    }
  };

  copyAllText(storyId?: number) {
    if (!storyId) {
      alert("Post Id is null");
      return;
    }
    this.closeStoryOptionsPanel();
    const el = document.getElementById("storyText" + storyId);
    if (!el) {
      console.warn(`Element with ID storyText${storyId} not found.`);
      alert(`Post with ID ${storyId} not found.`);
      return;
    } else {
      this.copyDivText(el);
    }
  }

  copyLink(storyId?: number) {
    const apd = this.user ? `User/${this.user.id}/${storyId}` : `Social/${storyId}`;
    const link = `https://bughosted.com/${apd}`;
    this.closeStoryOptionsPanel();
    navigator.clipboard.writeText(link).then(() => {
      this.parentRef?.showNotification('Link copied to clipboard!');
    }).catch(err => {
      this.parentRef?.showNotification('Failed to copy link!');
    });
  }

  getVideoStoryFiles(story: Story) {
    return story.storyFiles?.filter(file => {
      return this.fileService.videoFileExtensions.includes(this.fileService.getFileExtension(file.fileName ?? ''));
    });
  }

  copyFileLink(file: FileEntry) {
    const parent = this.parent ?? this.parentRef;
    const link = `https://bughosted.com/${file?.directory?.includes("Meme") ? 'Memes' : 'File'}/${file?.id}`;
    try {
      navigator.clipboard.writeText(link);
      parent?.showNotification(`Link copied to clipboard!`);
    } catch {
      parent?.showNotification("Error: Unable to share link!");
    }
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

  getPostVisibilityIcon(vis?: string): string {
    switch ((vis || '').toLowerCase()) {
      case 'public': return '🌍';
      case 'following': return '👥';
      case 'self': return '🔒';
      default: return '❓';
    }
  }

  formatDate(dateString?: Date): string {
    if (!dateString) return '';
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    const day = date.getDate();

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();

    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12 || 12;

    return `${month} ${day}, ${year} - ${hours}:${minutes} ${ampm}`;
  }

  formatPostMetadata(story: Story): string {
    if (!story) return "";

    const parts: string[] = [];

    const city = story.city?.trim();
    const country = story.country?.trim();
    const flag = country ? this.currencyFlagPipe.transform(country) : null;

    if (city || country) {
      let loc = "";
      if (city) loc += city;
      if (city && country) loc += ", ";
      if (country) loc += country;
      if (flag) loc += " " + flag;
      parts.push(loc);
    }

    parts.push(this.formatDate(story.date));

    parts.push("ID: " + story.id);

    return parts.join(" · ");
  }

  ignoreTopic(topic: Topic) {
    if (!confirm(`Are you sure you want to ignore the topic: ${topic.topicText}? You will no longer see posts with this topic. This can be undone within the topics menu.`)) {
      return;
    }
    if (this.parentRef?.user?.id) {
      this.topicService.addIgnoredTopic(this.parentRef.user.id, topic).then(res => {
        if (res) {
          this.parentRef?.showNotification(res.message);
          if (res.success) {
            this.closeStoryOptionsPanel();
            this.topicIgnored.emit();
          }
        }
      });
    }
  }

  onCardTopicClicked(topics: Topic[]) {
    this.topicClicked.emit(topics);
  }
}
