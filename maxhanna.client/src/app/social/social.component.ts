import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, Input, OnDestroy, OnInit, Renderer2, ViewChild } from '@angular/core';
import { Compactness, ShowPostsFrom } from '../../services/datacontracts/user/show-posts-from';
import { ChildComponent } from '../child.component';
import { Story } from '../../services/datacontracts/social/story';
import { SocialService } from '../../services/social.service';
import { TopicService } from '../../services/topic.service';
import { AppComponent } from '../app.component';
import { Topic } from '../../services/datacontracts/topics/topic';
import { TopicsComponent } from '../topics/topics.component';
import { StoryResponse } from '../../services/datacontracts/social/story-response';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { User } from '../../services/datacontracts/user/user';
import { MediaSelectorComponent } from '../media-selector/media-selector.component';
import { UserService } from '../../services/user.service';
import { FileService } from '../../services/file.service';
import { EncryptionService } from '../../services/encryption.service';

@Component({
  selector: 'app-social',
  templateUrl: './social.component.html',
  styleUrl: './social.component.css',
  standalone: false
})
export class SocialComponent extends ChildComponent implements OnInit, OnDestroy, AfterViewInit {
  fileMetadata: any;
  youtubeMetadata: any;
  storyResponse?: StoryResponse;
  trendingSearches: string[] = [];
  isMobileTopicsPanelOpen = false;
  isSearchSocialsPanelOpen = false;
  isMenuPanelOpen = false;
  isPostOptionsPanelOpen = false;
  showPostInput = false;
  showComponentSelector = false;
  wasFromSearchId = false;
  isShowingPostFromHelpInfo = false;
  isDisplayingNSFW = false;
  showHiddenFiles = false;
  canLoad = false; 
  attachedFiles: FileEntry[] = [];
  attachedTopics: Array<Topic> = [];
  userProfileId?: number = undefined;
  fileType: string | undefined;
  abortAttachmentRequestController: AbortController | null = null;
  notifications: String[] = [];
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
    private fileService: FileService,
    private encryptionService: EncryptionService,
    private cd: ChangeDetectorRef,
    private renderer: Renderer2
) {
    super();
  }

  async ngOnInit() {
    this.isLoading = true;
    if (this.parent) {
      this.parentRef = this.parent;
    }
    this.isLoading = false;

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

  async searchStories(searchTopics?: Array<Topic>, debounced?: boolean) {
    let search = this.userSearch;

    let topics = '';
    if (searchTopics && searchTopics.length > 0) {
      topics = topics.trim() != '' ? topics + ',' : topics;
      searchTopics.forEach(x => { topics += topics.trim() != '' ? ',' + x.id : x.id })
    }
    this.currentPage = 1;
    await this.getStories(this.currentPage, 10, search, topics);
    if (!!!debounced) {
      this.closeMenuPanel();
      this.closeSearchSocialsPanel();
    }
  }

  async getStories(page: number = 1, pageSize: number = 10, keywords?: string, topics?: string, append?: boolean, showHiddenStories = false) {
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
      this.showPostsFromFilter,
      false // details=false: list returns lightweight stubs; each app-social-post fetches its own details
    );

    if (res && res.stories && res.stories.length > 0) {
      if (append && this.storyResponse?.stories) {
        this.storyResponse.stories = this.storyResponse.stories.concat(
          res.stories.filter(
            (story) =>
              !this.storyResponse?.stories?.some(
                (existingStory) => existingStory.id === story.id
              )
          )
        );
        this.cd.detectChanges();
      } else {
        this.storyResponse = res;
        this.cd.detectChanges();
      }
      this.totalPages = this.storyResponse?.pageCount ?? 0;
      this.totalPagesArray = Array.from({ length: this.totalPages }, (_, index) => index + 1);
    } else if (!append) {
      // Search/filter returned no results — clear the feed so empty state renders
      this.storyResponse = res ?? { stories: [], totalCount: 0, pageCount: 0, currentPage: 1 } as StoryResponse;
      this.totalPages = 0;
      this.totalPagesArray = [];
      this.cd.detectChanges();
    }
    setTimeout(() => {
      this.canLoad = true;
    }, 1000);
    this.stopLoading();
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

  removeAttachment(fileId: number) {
    this.attachedFiles = this.attachedFiles.filter(x => x.id != fileId);
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

  onTopicAdded(topics?: Array<Topic>) {
    if (topics) {
      this.currentPage = 1;
      this.attachedTopics = topics;
      this.searchStories(topics);
      this.scrollToStory();
      this.closeMenuPanel();
      this.closePostOptionsPanel();
    }
  }
  removeTopic(topic: Topic) {
    this.attachedTopics = this.attachedTopics.filter(x => x.id != topic.id);
    this.searchStories(this.attachedTopics);
    this.scrollToStory(); 
  }
  topicClicked(topics?: Topic[]) { 
    this.attachedTopics = topics ?? [];
    this.currentPage = 1; 
    this.onTopicAdded(this.attachedTopics);
    this.scrollToStory();
  }
  onPostDeleted(story: Story) {
    if (!this.storyResponse?.stories) return;
    this.storyResponse.stories = this.storyResponse.stories.filter(x => x.id != story.id);
    this.refreshDOM();
  }
  onPostTopicClicked(topics: Topic[]) {
    this.topicClicked(topics);
  }
  onPostTopicIgnored() {
    this.getStories();
  }
  onPostHidden() {
    this.getStories();
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
  async updateNSFW(event: Event) {
    const parent = this.parent ?? this.parentRef;
    const user = parent?.user;
    if (!user || !user.id) return alert("You must be logged in to view NSFW content.");
    const isChecked = (event.target as HTMLInputElement).checked;
    this.isDisplayingNSFW = isChecked;
    this.userService.updateUserSettings(user.id, [
      { settingName: 'nsfw_enabled', value: isChecked }
    ]).then(res => {
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

    this.userService.updateUserSettings(user.id, [
      { settingName: 'nsfw_enabled', value: this.isDisplayingNSFW }
    ]).then(res => {
      if (res) {
        parent.showNotification(res);
        this.searchStories();
      }
    });
  }
  

  showPostsFrom(filter: ShowPostsFrom) {
    this.showPostsFromFilter = filter;
    this.userService.updateUserSettings(this.parentRef?.user?.id ?? 0, [{ settingName: 'show_posts_from', value: this.showPostsFromFilter }]).then(res => {
      if (res) {
        this.parentRef?.showNotification(res);
      }
    });
    this.getStories();
  }
  setCompactness(event: Event) { 
    this.compactness = (event.target as HTMLSelectElement).value as Compactness;
    this.userService.updateCompactness(this.parentRef?.user?.id ?? 0, this.compactness).then(res => {
      if (res) {
        this.parentRef?.showNotification(res.message);
        this.getStories();
      }
    });
  }
  contentPosted(event: { results: any, originalContent: string }) {
    this.getStories();
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

  refreshDOM() {
    setTimeout(() => {
      this.cd.detectChanges();
    }, 50);
  }
}