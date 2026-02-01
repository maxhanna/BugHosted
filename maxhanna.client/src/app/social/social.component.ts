import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, Input, OnDestroy, OnInit, Renderer2, ViewChild } from '@angular/core';
import { Compactness, ShowPostsFrom } from '../../services/datacontracts/user/show-posts-from';
import { ChildComponent } from '../child.component';
import { MetaData, Story } from '../../services/datacontracts/social/story';
import { SocialService } from '../../services/social.service';
import { TopicService } from '../../services/topic.service';
import { AppComponent } from '../app.component';
import { Topic } from '../../services/datacontracts/topics/topic';
import { TopicsComponent } from '../topics/topics.component';
import { StoryResponse } from '../../services/datacontracts/social/story-response';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { User } from '../../services/datacontracts/user/user';
import { MediaSelectorComponent } from '../media-selector/media-selector.component';
import { FileComment } from '../../services/datacontracts/file/file-comment'; 
import { UserService } from '../../services/user.service';
import { TodoService } from '../../services/todo.service';
import { Todo } from '../../services/datacontracts/todo'; 
import { FileService } from '../../services/file.service'; 
import { EncryptionService } from '../../services/encryption.service';
import { TextToSpeechService } from '../../services/text-to-speech.service';
import { CurrencyFlagPipe } from '../currency-flag.pipe';

@Component({
  selector: 'app-social',
  templateUrl: './social.component.html',
  styleUrl: './social.component.css',
  standalone: false,
  providers: [CurrencyFlagPipe]
})
export class SocialComponent extends ChildComponent implements OnInit, OnDestroy, AfterViewInit {
  fileMetadata: any;
  youtubeMetadata: any;
  storyResponse?: StoryResponse;
  optionStory?: Story;
  comments: FileComment[] = [];
  openedStoryComments: number[] = [];
  openedStoryYoutubeVideos: number[] = [];
  trendingSearches: string[] = [];
  isMobileTopicsPanelOpen = false;
  isSearchSocialsPanelOpen = false;
  isMenuPanelOpen = false;
  isStoryOptionsPanelOpen = false;
  isStoryVisibilityPanelOpen = false;
  isPostOptionsPanelOpen = false; 
  showPostInput = false;
  showComponentSelector = false;
  wasFromSearchId = false;
  isShowingPostFromHelpInfo = false;
  isDisplayingNSFW = false;
  showHiddenFiles = false;
  canLoad = false; 
  isEditing: number[] = [];
  editingTopics: number[] = [];
  attachedFiles: FileEntry[] = [];
  attachedTopics: Array<Topic> = [];
  storyOverflowMap: { [key: string]: boolean } = {};
  userProfileId?: number = undefined;
  fileType: string | undefined;
  abortAttachmentRequestController: AbortController | null = null;
  notifications: String[] = [];
  expanded: string[] = [];
  attachedSearchTopics: Array<Topic> = [];
  currentPage: number = 1;
  totalPages: number = 1;
  totalPagesArray: number[] = [];
  userSearch = "";
  searchTimeout: any;
  filter = {
    hidden: this.showHiddenFiles ? 'yes' : 'no',
  };
  showPostsFromFilter: ShowPostsFrom = "all";
  compactness: Compactness= "yes";
  private storyUpdateInterval: any;
  private overflowCache: Record<string, boolean> = {};
  city: string | undefined;
  country: string | undefined;
  
  @ViewChild('story') story!: ElementRef<HTMLInputElement>;
  @ViewChild('pageSelect') pageSelect!: ElementRef<HTMLSelectElement>;
  @ViewChild('pageSelect2') pageSelect2!: ElementRef<HTMLSelectElement>;
  @ViewChild('search') search!: ElementRef<HTMLInputElement>;
  @ViewChild('searchIdInput') searchIdInput!: ElementRef<HTMLInputElement>;
  @ViewChild('nsfwCheckmark') nsfwCheckmark!: ElementRef<HTMLInputElement>;
  @ViewChild('nsfwCheckmark2') nsfwCheckmark2!: ElementRef<HTMLInputElement>;
  @ViewChild('componentMain') componentMain!: ElementRef<HTMLDivElement>;
  @ViewChild(MediaSelectorComponent) mediaSelectorComponent!: MediaSelectorComponent;
  @ViewChild(MediaSelectorComponent) postMediaSelector!: MediaSelectorComponent;
  @ViewChild(TopicsComponent) topicComponent!: TopicsComponent;

  @Input() storyId: number | undefined = undefined;
  @Input() commentId: number | undefined = undefined;
  @Input() showTopicSelector: boolean = true;
  @Input() showOnlyPost: boolean = false;
  @Input() user?: User;
  @Input() canScroll?: boolean = true;
  @Input() parent?: AppComponent;

  constructor(private socialService: SocialService,
    private topicService: TopicService,
    private userService: UserService,
    private todoService: TodoService,
    private fileService: FileService,
    private encryptionService: EncryptionService,
    private textToSpeechService: TextToSpeechService,
    private cd: ChangeDetectorRef,
    private currencyFlagPipe: CurrencyFlagPipe,
    private renderer: Renderer2
) {
    super();
  }

  async ngOnInit() {
    this.startLoading();
    if (this.parent) {
      this.parentRef = this.parent;
    }
    if (this.storyId) {
      this.openedStoryComments.push(this.storyId);
    }
    this.parentRef?.addResizeListener();

    const user = this.parentRef?.user;
    if (user && user.id) {
      await this.userService.getUserSettings(user.id).then(res => {
        if (res) {
          this.isDisplayingNSFW = res.nsfwEnabled ?? false;
          this.compactness = (res.compactness ?? "no") as Compactness;
          const candidate = res.showPostsFrom ?? "all";
          this.showPostsFromFilter = (['subscribed','local','popular','all','oldest'].includes(candidate) ? candidate as ShowPostsFrom : 'all');
        }
      });
    }
 
    const tmpStoryId = this.storyId;
    const tmpCommentId = this.commentId;

    // If a deep-linked storyId is present, fetch that single story directly (server will not apply per-user blocking when called this way)
    if (tmpStoryId) {
      try {
        const single = await this.socialService.getStoryById(tmpStoryId);
        if (single) {
          // Decrypt story text client-side to match normal flow
          try {
            single.storyText = this.encryptionService.decryptContent(single.storyText ?? '', single.user?.id + '');
          } catch (ex) {
            console.error('Failed to decrypt deep-linked story text', ex);
          }
          // Wrap into storyResponse so the templates and downstream logic work
          this.storyResponse = { 
            stories: [single], 
            totalCount: 1, 
            pageCount: 1, 
            currentPage: 1 
          } as StoryResponse;

          // If the current user has blocked the author, show placeholder locally
          try {
            const currentUserId = this.parentRef?.user?.id ?? this.parent?.user?.id;
            if (currentUserId && single.user && single.user.id) {
              const blockedRes: any = await this.userService.isUserBlocked(currentUserId, single.user.id);
              const isBlocked = (blockedRes && (blockedRes.isBlocked === true || blockedRes.IsBlocked === true || blockedRes.IsBlocked === 1 || blockedRes.isBlocked === 1));
              if (isBlocked) {
                const blockedName = single.user.username ?? (`User ${single.user.id}`);
                const placeholder = `You have blocked ${blockedName}. Unblock to view this post.`;
                try { single.storyText = placeholder; } catch { }
                try { single.storyFiles = []; } catch { }
                try { single.metadata = []; } catch { }
                try { single.storyComments = []; } catch { }
              }
            }
          } catch (ex) {
            console.warn('Failed checking blocked status for story author', ex);
          }

          this.scrollToStory(single.id);
          this.scrollToInputtedCommentId(tmpCommentId);
          this.changePageTitleAndDescription(single);
          // we're done with deep-linked story handling
        } else {
          // fallback to normal getStories if single story not found
          await this.getStories();
        }
      } catch (ex) {
        console.warn('Error fetching deep-linked story by id, falling back to getStories', ex);
        await this.getStories();
      }
    } else {
      await this.getStories();
    }
   

    this.parentRef?.getLocation().then(res => {
      if (res) {
        this.country = res.country;
        this.city = res.city;
      }
    })
    this.changeComponentMainHeight();
    this.stopLoading();
  }

  ngOnDestroy() {
    if (this.storyUpdateInterval) {
      clearInterval(this.storyUpdateInterval); // Clean up interval on component destroy
    } 
  }

  async ngAfterViewInit() {
    if (this.user) {
      this.userProfileId = this.user.id;
      this.componentMain.nativeElement.style.paddingTop = "0px";
      this.componentMain.nativeElement.classList.add("mobileMaxHeight");
      if (document.getElementsByClassName('storyInputDiv')[0]) {
        (document.getElementsByClassName('storyInputDiv')[0] as HTMLDivElement).style.marginTop = "0px";
      }
    }
    if (this.showOnlyPost) {
      this.componentMain.nativeElement.style.paddingTop = "0px";
      this.componentMain.nativeElement.classList.add("mobileMaxHeight");
    } 
  } 

  async delete(story: Story) {
    const parent = this.parentRef;
    if (!parent?.user?.id) { return alert("Error: Cannot delete a post unless logged in or the post belongs to you."); }
    if (!confirm("Are you sure you want to delete this post?")) return;
    const sessionToken = await parent.getSessionToken();
    const res = await this.socialService.deleteStory(parent.user.id, story, sessionToken);
    if (res) {
      this.parentRef?.showNotification(res);
      if (res.toLowerCase().includes('successful')) {
        this.storyResponse!.stories! = this.storyResponse!.stories!.filter((x: { id: number | undefined; }) => x.id != story.id);
      }
    }
    this.closeStoryOptionsPanel();
  }
  async edit(story: Story) {
    if (this.isEditing.includes(story.id ?? 0)) {
      this.isEditing = this.isEditing.filter(x => x != story.id);
    } else {
      this.isEditing.push(story.id ?? 0);
    }
    this.closeStoryOptionsPanel();
  }

  // Centralized cancel handler for story editing (used by app-text-input cancelEdit)
  cancelEdit(story: Story) {
    if (!story || story.id === undefined) return;
    this.isEditing = this.isEditing.filter(x => x != story.id);
    // ensure story options panel is closed when cancelling an edit
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
  async editStory(story: Story) {
    // Legacy DOM edit handler: if the old textarea is present, use it; otherwise rely on the new app-text-input flow.
    const textarea = document.getElementById('storyTextTextarea' + story.id) as HTMLTextAreaElement | null;
    if (!textarea) {
      this.parentRef?.showNotification('Please use the editor Update button to save changes.');
      return;
    }
    const message = textarea.value;
    const ogMessage = message + "";
    story.storyText = this.encryptionService.encryptContent(message, story.user.id + "");
    if (document.getElementById('storyText' + story.id) && this.parentRef?.user?.id) {
      this.parentRef.updateLastSeen();
      const sessionToken = await this.parentRef.getSessionToken();
      await this.socialService.editStory(this.parentRef.user.id, story, sessionToken);
      this.isEditing = this.isEditing.filter(x => x != story.id);
      setTimeout(() => { story.storyText = ogMessage }, 10);
    }
  }
  
  // Handler for app-text-input contentUpdated event for stories
  async onStoryUpdated(event: { results: any, content: any, originalContent: string }, story: Story) {
    try {
      if (event && event.results) {
        // Update local UI with decrypted/plaintext content
        story.storyText = event.originalContent;
        // Close edit mode for this story
        this.isEditing = this.isEditing.filter(x => x != story.id);
        this.parentRef?.showNotification(`Post #${story.id} edited successfully.`);
      } else {
        this.parentRef?.showNotification(`Failed to edit post #${story.id}.`);
      }
    } catch (err) {
      console.error('onStoryUpdated error', err);
    }
  }
  async searchStories(searchTopics?: Array<Topic>, debounced?: boolean) {
    let search = this.userSearch;

    let topics = '';
    if (searchTopics && searchTopics.length > 0) {
      topics = topics.trim() != '' ? topics + ',' : topics;
      searchTopics.forEach(x => { topics += topics.trim() != '' ? ',' + x.id : x.id })
    }
    await this.getStories(this.currentPage, 10, search, topics);
    if (!!!debounced) {
      this.closeMenuPanel();
      this.closeSearchSocialsPanel();
    }
  }

  async getStories(page: number = 1, pageSize: number = 25, keywords?: string, topics?: string, append?: boolean, showHiddenStories = false) {
    this.startLoading();
    this.canLoad = false;
    const search = keywords ?? this.search?.nativeElement.value;
    const userId = this.user?.id;
    let storyId = this.getSearchStoryId(); 
    this.parentRef?.updateLastSeen();
    const res = await this.socialService.getStories(
      this.parentRef?.user?.id,
      search,
      topics,
      userId,
      storyId,
      page,
      pageSize,
      showHiddenStories,
      this.showPostsFromFilter
    );

    if (res && res.stories) {
      res.stories.forEach(story => {
        if (story.storyText) {
          try {
            story.storyText = this.encryptionService.decryptContent(story.storyText, story.user.id + "");
          } catch (ex) {
            console.error(`Failed to decrypt story ID ${story.id}: ${ex}`);
          }
        }
      });
      if (append && this.storyResponse?.stories) {
        this.storyResponse.stories = this.storyResponse.stories.concat(
          res.stories.filter(
            (story) =>
              !this.storyResponse?.stories?.some(
                (existingStory) => existingStory.id === story.id
              )
          )
        );
      } else {
        this.storyResponse = res;
      }
      this.totalPages = this.storyResponse?.pageCount ?? 0;
      this.totalPagesArray = Array.from({ length: this.totalPages }, (_, index) => index + 1);
      this.setPollResultsIfVoted(res);
    }
    setTimeout(() => {
      this.canLoad = true;
    }, 1000);
    this.stopLoading();
  }

  private setPollResultsIfVoted(res: StoryResponse) {
    if (!res.stories?.length) return;
    res.stories.forEach(story => {
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
          story.storyText += `<button onclick=\"document.getElementById('pollComponentId').value='storyText${story.id}';document.getElementById('pollDeleteButton').click()\" class=\"deletePollVoteButton\">Delete Vote</button>`;
          story.storyText += `<div class=voterSpan>Voters(${poll.userVotes.length}): ${poll.userVotes.map(x => '@' + x.username).join(', ')}</div>`;
        }
      });
    });
  }

  private getSearchStoryId() {
    let storyId = undefined;
    this.wasFromSearchId = false;
    if (this.searchIdInput?.nativeElement.value) {
      storyId = parseInt(this.searchIdInput.nativeElement.value);
    } else if (this.storyId) {
      storyId = this.storyId;
      this.wasFromSearchId = true;
    }
    this.storyId = undefined;
    return storyId;
  }

  updatePollsInDOM(delayMs: number = 1000): void {
    // Now polls are per-story only; iterate each story's polls
    if (!this.storyResponse?.stories?.length) return;
    setTimeout(() => {
      this.storyResponse?.stories?.forEach(s => {
        (s.polls || []).forEach(poll => {
          const componentId = poll.componentId;
          const pollContainer = document.getElementById(componentId);
          if (!pollContainer) return;
          let pollHtml = `<div class="poll-container" data-component-id="${componentId}">`+
            `<div class=\"poll-question\">${poll.question}</div><div class=\"poll-options\">`;
          poll.options.forEach((option, index) => {
            const percentage = option.percentage;
            const voteCount = option.voteCount;
            const pollId = `poll_${componentId}_${index}`;
            pollHtml += `
              <div class=\"poll-option\">\n\n\t<input type=\"checkbox\" value=\"${option.text}\" id=\"poll-option-${pollId}\" name=\"poll-options-${pollId}\" onClick=\"document.getElementById('pollValue').value='${option.text}';document.getElementById('pollCheckId').value='poll-option-${pollId}';document.getElementById('pollQuestion').value='${poll.question}';document.getElementById('pollComponentId').value='${componentId}';document.getElementById('pollCheckClickedButton').click()\">\n\t<label for=\"poll-option-${pollId}\" onClick=\"document.getElementById('pollValue').value='${option.text}';document.getElementById('pollCheckId').value='poll-option-${pollId}';document.getElementById('pollQuestion').value='${poll.question}';document.getElementById('pollComponentId').value='${componentId}';document.getElementById('pollCheckClickedButton').click()\">${option.text}</label>\n\t<div class=\"poll-result\">\n\t  <div class=\"poll-bar\" style=\"width: ${percentage}%\"></div>\n\t  <span class=\"poll-stats\">${voteCount} votes (${percentage}%)</span>\n\t</div>\n\t</div>`;
          });
          pollHtml += `</div><div class=\"poll-total\">Total Votes: ${poll.totalVotes}</div></div>`;
          pollContainer.innerHTML = pollHtml;
        });
      });
    }, delayMs);
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
      // open visibility panel instead of general story options
      this.showStoryVisibilityPanel(story);
    } else {
      this.parentRef?.showNotification('You are not the owner of this post.');
    }
  }

  // Story visibility panel handlers
  visibilityStory?: Story;
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

  removeAttachment(fileId: number) {
    this.attachedFiles = this.attachedFiles.filter(x => x.id != fileId);
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

  async pageChanged(selectorId?: number) {
    let pageSelect = this.pageSelect?.nativeElement;
    if (!pageSelect || selectorId == 2) {
      pageSelect = this.pageSelect2.nativeElement;
    }
    this.currentPage = parseInt(pageSelect.value);
    await this.getStories(this.currentPage).then(res => {
      this.scrollToStory();
    });
    if (this.parentRef) {
      this.parentRef.closeOverlay();
    }
  }
  scrollToStory(storyId?: number): void {
    if (!this.canScroll) return;
    setTimeout(() => {
      if (storyId) {
        const storyContainer = document.getElementById(`storyDiv${storyId}`) as HTMLElement;
        if (storyContainer) {
          storyContainer.scrollIntoView();
        }
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 20);
  }

  isValidYoutubeImageUrl(url?: string): boolean {
    if (!url) return false;
    return url.includes("ytimg");
  }

  onTopicAdded(topics?: Array<Topic>) {
    if (topics) {
      this.currentPage = 1;
      this.attachedTopics = topics;
      this.searchStories(topics);
      this.scrollToStory();
      this.closeMenuPanel();
      this.closePostOptionsPanel();
      this.closeStoryOptionsPanel(); 
    }
  }
  removeTopic(topic: Topic) {
    this.attachedTopics = this.attachedTopics.filter(x => x.id != topic.id);
    this.searchStories(this.attachedTopics);
    this.scrollToStory(); 
  }
  topicClicked(topics?: Topic[]) { 
    if (topics) {
      for (let topic of topics) {
        if (this.attachedTopics.find(x => x.id == topic.id)) {
          this.attachedTopics = this.attachedTopics.filter(x => x.id != topic.id);
        } else {
          this.attachedTopics.push(topic);
        }
      } 
    }
    this.currentPage = 1; 
    this.onTopicAdded(this.attachedTopics);
    this.scrollToStory();
  }
  topTopicClicked(topicName: string, topicId: number) {
    this.attachedTopics.push(new Topic(topicId, topicName));
    this.onTopicAdded(this.attachedTopics);
    this.scrollToStory();
  }
  uploadInitiate() {

  }
  uploadNotification(notification: string) {

  }
  selectFile(files: FileEntry[]) {
    if (files) {
      this.attachedFiles = files.flatMap(fileArray => fileArray);
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


  toggleCollapse(storyId?: string): void {
    if (!storyId) return;

    if (!this.expanded.includes(storyId)) {
      this.storyOverflowMap[storyId as string] = !this.storyOverflowMap[storyId as string];
      this.expanded.push(storyId);
    }
  }

  isExpanded(elementId: string) {
    return this.expanded.includes(elementId);
  }

  showSearchSocialsPanel() {
    this.isSearchSocialsPanelOpen = true;
    if (this.parentRef) {
      this.parentRef.showOverlay();
    }

    // fetch trending social searches
    this.fileService.getTrending('social', 5).then(res => {
      this.trendingSearches = Array.isArray(res) ? res.map((r: any) => r.query) : [];
    }).catch(() => { this.trendingSearches = []; });

    // ensure view updated so the ViewChild is available, then safely focus
    try {
      this.cd.detectChanges();
    } catch {}
    setTimeout(() => { try { this.search?.nativeElement?.focus(); } catch {} }, 50);
  }
  closeSearchSocialsPanel() {
    this.isSearchSocialsPanelOpen = false;
    if (this.parentRef) {
      this.parentRef.closeOverlay();
    }
  }
 
  showMenuPanel() {
    if (this.isMenuPanelOpen) {
      this.closeMenuPanel();
      return;
    }
    this.isMenuPanelOpen = true;
    const parent = this.parent ?? this.parentRef;
    parent?.showOverlay();
  }
  closeMenuPanel() {
    this.isMenuPanelOpen = false;
    const parent = this.parent ?? this.parentRef;
    parent?.closeOverlay();
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
  }
  closeStoryOptionsPanel() {
    this.isStoryOptionsPanelOpen = false;
    this.optionStory = undefined;

    const parent = this.parent ?? this.parentRef;
    parent?.closeOverlay();
  } 
  
  showPostOptionsPanel() {
    if (this.isPostOptionsPanelOpen) {
      this.closePostOptionsPanel();
      const parent = this.parent ?? this.parentRef;
      parent?.closeOverlay();
      return;
    }
    this.isPostOptionsPanelOpen = true;

    const parent = this.parent ?? this.parentRef;
    parent?.showOverlay();
  }
  closePostOptionsPanel() {
    this.isPostOptionsPanelOpen = false;
    const parent = this.parent ?? this.parentRef;
    parent?.closeOverlay();
  }
  
  isEditButtonVisible(storyId?: number) {
    if (!storyId) return false;
    const element = document.getElementById('storyTextEditConfirmButton' + storyId) as HTMLTextAreaElement;
    return element?.style.display === 'block';
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
    if (comment.storyId) {
      // attempt to decrypt the incoming comment so replies appear decrypted immediately
      try {
        if (!comment.decrypted && comment.commentText && comment.user && comment.user.id) {
          comment.commentText = this.encryptionService.decryptContent(comment.commentText, String(comment.user.id));
          comment.decrypted = true;
        }
      } catch (ex) {
        console.error('Failed to decrypt new comment', ex);
      }
      const targetStory = this.storyResponse?.stories?.find(x => x.id === comment.storyId);
      if (targetStory) {
        if (!targetStory.storyComments) {
          targetStory.storyComments = [comment];
        } else {
          targetStory.storyComments.push(comment);
        }
        if (targetStory.commentsCount) {
          targetStory.commentsCount++;
        } else {
          targetStory.commentsCount = 1;
        }
      }
    }
  }
  commentRemovedEvent(comment: FileComment) {
    if (comment.storyId) {
      const targetStory = this.storyResponse?.stories?.find(x => x.id === comment.storyId);
      if (targetStory && targetStory.storyComments) {

        targetStory.storyComments = targetStory.storyComments.filter(x => x.id !== comment.id);

        if (targetStory.commentsCount) {
          targetStory.commentsCount--;
        } else {
          targetStory.commentsCount = 0;
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
    tmpTodo.date = new Date(); // Ensure date is set for sorting
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
    //this.closeStoryOptionsPanel();
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

  extractYouTubeVideoId(input?: string) {
    if (!input) return '';

    // Trim the input to remove extra spaces and newlines
    input = input.trim();

    // Use a regex to extract the URL from the input string
    const urlRegex = /https?:\/\/[^\s]+/;
    const urlMatch = input.match(urlRegex);

    if (!urlMatch) return '';

    const url = urlMatch[0];

    // Updated regex to support mobile links
    const youtubeRegex = /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

    const youtubeMatch = url.match(youtubeRegex);

    return youtubeMatch?.[1] ?? '';
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
      const tgtStory = this.storyResponse?.stories?.find(x => x.id == parseInt(elementId.replace("storyTextContainer", "")));
      if (tgtStory) {
        if (tgtStory.storyFiles && tgtStory.storyFiles.length > 0) {
          this.overflowCache[elementId] = true;
          return this.overflowCache[elementId];
        }
      }
    }

    if (this.compactness.includes("yes")) {
      const tgtStory = this.storyResponse?.stories?.find(x => x.id == parseInt(elementId.replace("storyTextContainer", "")));
      if (tgtStory) {
        if (tgtStory.metadata && tgtStory.metadata.length > 0) {
          this.overflowCache[elementId] = true;
          return this.overflowCache[elementId];
        }
      }
    }

    const threshold = 400;
    const buffer = 20;
    this.overflowCache[elementId] = element.scrollHeight >= (threshold + buffer);

    return this.overflowCache[elementId];
  }

  async loadMorePosts() {
    if (this.isLoading || !this.canLoad) return;
    this.canLoad = false; 
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => {
      this.currentPage++;
      this.getStories(this.currentPage + 1, 10, undefined, undefined, true)
    }, 500);
  }

  debouncedSearch() {
    this.userSearch = this.search.nativeElement.value;
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
      this.searchStories(this.attachedTopics, true);
      try {
        const user = this.parent?.user ?? this.parentRef?.user; 
        this.fileService.recordSearch(this.userSearch, 'social', user?.id);
      } catch { }
    }, 1000);
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
            this.closePostOptionsPanel();
            this.getStories();
          }
        }
      });
    }
  } 

  getTextForDOM(text?: string, componentId?: any) {
    const parent = this.parent ?? this.parentRef;
    return parent?.getTextForDOM(text, "storyText" + componentId);
  }
  clearSearchInput() {
    this.search.nativeElement.value = '';
    this.userSearch = '';
    // use the debounced search behavior to match clicking the search button
    this.debouncedSearch();
  }

  clearSearchIdInput() {
    if (this.searchIdInput && this.searchIdInput.nativeElement) {
      this.searchIdInput.nativeElement.value = '';
    }
    this.storyId = undefined;
    this.debouncedSearch();
  }
  setFilterHidden(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.filter.hidden = target.value;
    const showHidden = this.filter.hidden == "yes";

    this.getStories(undefined, undefined, undefined, undefined, undefined, showHidden);
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
          if (this.filter.hidden != "yes") {
            this.getStories(undefined, undefined, undefined, undefined, undefined, false);
          }
        });
      }
    }
  }
  getTotalCommentCount(commentList?: FileComment[]): number {
    if (!commentList || commentList.length === 0) return 0;
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

    for (let comment of commentList) {
      count++; // Count main comment
      count += countSubComments(comment); // Count its sub-comments
    }

    return count;
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
    this.closePostOptionsPanel();
    const el = document.getElementById("storyText" + storyId);
    if (!el) {
      console.warn(`Element with ID storyText${storyId} not found.`);
      alert(`Post with ID ${storyId} not found.`);
      return;
    } else {
      this.copyDivText(el);
    }
  }
  async updateNSFW(event: Event) {
    const parent = this.parent ?? this.parentRef;
    const user = parent?.user;
    if (!user || !user.id) return alert("You must be logged in to view NSFW content.");
    const isChecked = (event.target as HTMLInputElement).checked;
    this.isDisplayingNSFW = isChecked;
    this.userService.updateNSFW(user.id, isChecked).then(res => {
      if (res) {
        parent.showNotification(res);
        this.searchStories();
      }
    });
  }
  onNSFWChange(event: Event) {
    const selectElement = event.target as HTMLSelectElement;
    const selectedValue = selectElement.value; // "yes" or "no"
    this.isDisplayingNSFW = (selectedValue === 'yes');
    const parent = this.parent ?? this.parentRef;
    const user = parent?.user;
    if (!user || !user.id) return alert("You must be logged in to view NSFW content.");

    this.userService.updateNSFW(user.id, this.isDisplayingNSFW).then(res => {
      if (res) {
        parent.showNotification(res);
        this.searchStories();
      }
    });
  }
  

  showPostsFrom(filter: ShowPostsFrom) {
    this.showPostsFromFilter = filter;
    this.userService.updateShowPostsFrom(this.parentRef?.user?.id ?? 0, this.showPostsFromFilter).then(res => {
      if (res) {
        this.parentRef?.showNotification(res.message);
      }
    });
    this.getStories();
  }
  setCompactness(event: Event) { 
    this.compactness = (event.target as HTMLSelectElement).value as Compactness;
    this.userService.updateCompactness(this.parentRef?.user?.id ?? 0, this.compactness).then(res => {
      if (res) {
        this.parentRef?.showNotification(res.message);
        this.overflowCache = {}; // Reset overflow cache
        this.storyOverflowMap = {}; // Reset story overflow map
        this.expanded = []; // Reset expanded stories
        this.getStories();
      }
    });
  }
  getVideoStoryFiles(story: Story) {
    return story.storyFiles?.filter(file => {
      return this.fileService.videoFileExtensions.includes(this.fileService.getFileExtension(file.fileName ?? ''));
    });
  }
  contentPosted(event: { results: any, originalContent: string }) {
    this.getStories();
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
      case 'public':     return '🌍';
      case 'following':  return '👥';
      case 'self':       return '🔒';
      default:           return '❓';
    }
  }
  
  formatPostMetadata(story: Story): string {
    if (!story) return "";

    const parts: string[] = [];

    // 📍 City + Country (only if present)
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

    // 🗓️ Date (always present)
    parts.push(this.formatDate(story.date));

    // 🆔 ID (always present)
    parts.push("ID: " + story.id);

    return parts.join(" · ");
  } 

  private changeComponentMainHeight() {
    if (this.user) {
      const elements = document.getElementsByClassName('componentMain');

      if (elements.length > 0) {
        Array.from(elements).forEach((e) => {
          (e as HTMLElement).style.maxHeight = 'none';
          // (e as HTMLElement).style.background = 'unset';
        });
      }
    }
  }

  private changePageTitleAndDescription(tgtStory: Story) {
    const storyText = tgtStory.storyText;
    if (storyText && !this.showOnlyPost) {
      const titleAndDescrip = this.parentRef?.replacePageTitleAndDescription(storyText.trim(), storyText);
      const script = document.createElement('script');
      script.setAttribute('type', 'application/ld+json');
      script.textContent = titleAndDescrip?.title ?? "";
      document.head.appendChild(script);
    }
  }

  private scrollToInputtedCommentId(commentId?: number) {
    if (!this.canScroll) return;
    if (commentId) {
      setTimeout(() => {
        const subCommentElement = document.getElementById("subComment" + commentId);
        if (subCommentElement) {
          subCommentElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          const parentCommentElement = document.getElementById("commentText" + commentId);
          if (parentCommentElement) {
            parentCommentElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      }, 1000);
    }
  }
}