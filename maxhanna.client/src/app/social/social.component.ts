import { AfterViewInit, Component, ElementRef, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { MetaData, Story } from '../../services/datacontracts/social/story';
import { SocialService } from '../../services/social.service';
import { TopicService } from '../../services/topic.service';
import { AppComponent } from '../app.component';
import { Topic } from '../../services/datacontracts/topics/topic';
import { TopicRank } from '../../services/datacontracts/topics/topic-rank';
import { TopicsComponent } from '../topics/topics.component';
import { StoryResponse } from '../../services/datacontracts/social/story-response';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { User } from '../../services/datacontracts/user/user';
import { MediaSelectorComponent } from '../media-selector/media-selector.component';
import { FileComment } from '../../services/datacontracts/file/file-comment';
import { Pipe, PipeTransform } from '@angular/core';
import { UserService } from '../../services/user.service';
import { TodoService } from '../../services/todo.service';
import { Todo } from '../../services/datacontracts/todo';
import { NotificationService } from '../../services/notification.service';

@Pipe({ name: 'clickableUrls' })
export class ClickableUrlsPipe implements PipeTransform {
  transform(value?: string): string {
    if (!value) {
      return '';
    }
    // Your existing createClickableUrls logic here
    return value.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
  }
}

@Component({
  selector: 'app-social',
  templateUrl: './social.component.html',
  styleUrls: ['./social.component.css']
})
export class SocialComponent extends ChildComponent implements OnInit, OnDestroy, AfterViewInit {
  fileMetadata: any;
  youtubeMetadata: any;
  storyResponse?: StoryResponse;
  optionStory?: Story;
  comments: FileComment[] = [];
  openedStoryComments: number[] = [];
  openedStoryYoutubeVideos: number[] = [];
  isMobileTopicsPanelOpen = false;
  isSearchSocialsPanelOpen = false;
  isMenuPanelOpen = false;
  isStoryOptionsPanelOpen = false;
  isPostOptionsPanelOpen = false;
  isEmojiPanelOpen = false;
  isEditing: number[] = [];
  editingTopics: number[] = []; 
  eachAttachmentSeperatePost = false; 
  attachedFiles: FileEntry[] = [];
  attachedTopics: Array<Topic> = []; 
  storyOverflowMap: { [key: string]: boolean } = {};

  userProfileId?: number = undefined;
  wasFromSearchId = false;

  fileType: string | undefined;
  abortAttachmentRequestController: AbortController | null = null;
  notifications: String[] = [];
  expanded: string[] = [];
  attachedSearchTopics: Array<Topic> = [];
  topTopics: TopicRank[] = [];

  currentPage: number = 1;
  totalPages: number = 1;
  totalPagesArray: number[] = [];
  userSearch = "";
  isDisplayingNSFW = false;
  searchTimeout: any;
  showHiddenFiles: boolean = false;
  filter = { 
    hidden: this.showHiddenFiles ? 'yes' : 'no',
  };
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
  @Input() showTopicSelector: boolean = true;
  @Input() user?: User;
  @Input() parent?: AppComponent;

  constructor(private socialService: SocialService,
    private topicService: TopicService,
    private userService: UserService,
    private todoService: TodoService,
    private notificationService: NotificationService) {
    super();
  }

  async ngOnInit() {
    if (this.parent) {
      this.parentRef = this.parent;
    }
    if (this.storyId) { 
      this.openedStoryComments.push(this.storyId); 
    }
    this.parent?.addResizeListener();
    this.getStories().then(() => { 
      if (this.storyId && this.storyResponse && this.storyResponse.stories && this.storyResponse.stories.length > 0) {
        const tgtStory = this.storyResponse.stories.find((story) => story.id == this.storyId);
        if (tgtStory) {
          this.scrollToStory(tgtStory.id);
          const storyText = tgtStory.storyText;
          if (storyText) {
            const titleAndDescrip = this.parentRef?.replacePageTitleAndDescription(storyText.trim(), storyText);
            const script = document.createElement('script');
            script.setAttribute('type', 'application/ld+json');
            script.textContent = titleAndDescrip?.title ?? "";
            document.head.appendChild(script); 
          }
        } 
      }
    });
    this.topicService.getTopStoryTopics().then(res => {
      if (res) {
        this.topTopics = res;
      }
    });
    this.parentRef?.getLocation().then(res => {
      if (res) {
        this.country = res.country;
        this.city = res.city; 
      }
    }) 
    if (this.user) {
      const elements = document.getElementsByClassName('componentMain');

      if (elements.length > 0) {
        Array.from(elements).forEach((e) => {
          (e as HTMLElement).style.maxHeight = 'none';
        });
      }
    }
 

    const user = this.parent?.user ?? this.parentRef?.user;
    if (user) {
      this.userService.getUserSettings(user).then(res => {
        if (res) {
          this.isDisplayingNSFW = res.nsfwEnabled ?? false; 
        }
      });
    }
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
      (document.getElementsByClassName('storyInputDiv')[0] as HTMLDivElement).style.marginTop = "0px";
      (document.getElementsByClassName('componentMain')[0] as HTMLDivElement).style.border = "unset";
    }
  }
  async delete(story: Story) {
    if (!this.parentRef?.user) { return alert("Error: Cannot delete storise that dont belong to you."); }
    if (!confirm("Are you sure you want to delete this story?")) return;

    const res = await this.socialService.deleteStory(this.parentRef?.user, story);
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
    const message = (document.getElementById('storyTextTextarea' + story.id) as HTMLTextAreaElement).value;
    story.storyText = message;
    if (document.getElementById('storyText' + story.id) && this.parentRef && this.parentRef.user) {
      this.parentRef?.updateLastSeen();
      this.socialService.editStory(this.parentRef.user, story);
      this.isEditing = this.isEditing.filter(x => x != story.id);
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

    const search = keywords ?? this.search?.nativeElement.value;
    const userId = this.user?.id;
    let storyId = this.getSearchStoryId();

    this.parentRef?.updateLastSeen();
    const res = await this.socialService.getStories(
      this.parentRef?.user,
      search,
      topics,
      userId,
      storyId,
      page,
      pageSize,
      showHiddenStories
    );

    if (res) {
      if (append && res.stories && this.storyResponse?.stories) {
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

      if (this.storyResponse?.stories) {
        this.storyResponse.stories.forEach(story => { 
          if (story.date) { 
            if (typeof story.date === 'string') { 
              story.date = new Date(story.date);
            }
            story.date = new Date(story.date.getTime() - story.date.getTimezoneOffset() * 60000);  //Convert UTC dates to local time.
          }
        });
      }

      setTimeout(() => { this.updateStoryDates(); }, 1500);
      this.storyUpdateInterval = setInterval(() => {
        this.updateStoryDates();
      }, 15000);

      this.totalPages = this.storyResponse?.pageCount ?? 0;
      this.totalPagesArray = Array.from({ length: this.totalPages }, (_, index) => index + 1);
    }
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

  async post() {
    const storyText = this.story.nativeElement.value?.trim() || ''; // Ensure it's a string
    if (!storyText && (!this.attachedFiles || this.attachedFiles.length === 0)) {
      alert("Story can't be empty!");
      return;
    }
    this.startLoading();

    try {
      const user = this.parentRef?.user ?? this.parent?.user ?? new User(0, "Anonymous");

      const results = this.eachAttachmentSeperatePost
        ? await this.postEachFileAsSeparateStory(user, storyText)
        : await this.postSingleStory(user, storyText);

      if (results) {
        this.clearStoryInputs();
        this.getStories();
        this.topicComponent?.removeAllTopics();
        if (this.user && this.user.id) {
          const notificationData: any = {
            fromUser: user,
            toUser: [this.user],
            message: "New post on your profile!",
            userProfileId: this.user.id
          };
          this.notificationService.createNotifications(notificationData);
        }
      } else {
        this.parentRef?.showNotification("An unexpected error occurred.");
      }
    } catch (error) {
      console.error("Error while posting story:", error);
      this.parentRef?.showNotification("An unexpected error occurred.");
    } finally {
      this.stopLoading();
    }
  }

  private createStory(user: User, storyText: string, files: FileEntry[]): Story {
    const parent = this.parent ?? this.parentRef;
    return {
      id: 0,
      user,
      storyText: parent?.replaceEmojisInMessage(storyText) ?? storyText,
      fileId: null,
      date: new Date(),
      upvotes: 0,
      downvotes: 0,
      commentsCount: 0,
      storyComments: undefined,
      metadata: undefined,
      storyFiles: files,
      storyTopics: this.attachedTopics,
      profileUserId: this.user?.id,
      city: this.city,
      country: this.country,
    };
  }

  private async postSingleStory(user: User, storyText: string): Promise<any> {
    const story = this.createStory(user, storyText, this.attachedFiles);
    this.parentRef?.updateLastSeen();
    return this.socialService.postStory(user, story);
  }

  private async postEachFileAsSeparateStory(user: User, storyText: string): Promise<any[]> {
    this.parentRef?.updateLastSeen();
    const promises = this.attachedFiles.map(file => {
      const story = this.createStory(user, storyText, [file]);
      return this.socialService.postStory(user, story);
    });
    return Promise.all(promises);
  }

  private clearStoryInputs(): void {
    this.attachedFiles = [];
    this.attachedTopics = [];
    this.postMediaSelector.selectedFiles = [];
    this.mediaSelectorComponent.closeMediaSelector();
    this.story.nativeElement.value = '';
    this.eachAttachmentSeperatePost = false;
  }

  async editStoryTopic(topics: Topic[], story: Story) {
    const user = this.parentRef?.user ?? this.parent?.user;
    if (user) {
      this.parentRef?.updateLastSeen();
      this.socialService.editTopics(user, story, topics); 
      this.closeStoryOptionsPanel();
      this.editingTopics = this.editingTopics.filter(x => x != story.id); 
      story.storyTopics = topics;
    }
  }

  async removeTopicFromStory(topic: Topic, story: Story) {
    let topics = story.storyTopics?.filter(x => x.id != topic.id);
    if (!topics) {
      topics = [];
    }
    await this.editStoryTopic(topics, story);
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
        const videoId = this.extractYouTubeVideoId(metadataUrl ?? story.storyText); 
        if (videoId) {
          (document.getElementById('youtubeVideoIdInput') as HTMLInputElement).value = videoId; 
          this.parentRef?.playYoutubeVideo();
        } else {
          window.open(goodUrl, '_blank');
        }
      }
    }
    else {
      if (story && story.metadata) {
        const tmpUrl = story.metadata[0].imageUrl;
        if (tmpUrl) {
          window.open(tmpUrl, '_blank');
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
      this.closeMobileTopicsPanel();
    }
  }
  removeTopic(topic: Topic) {
    this.attachedTopics = this.attachedTopics.filter(x => x.id != topic.id);
    this.searchStories(this.attachedTopics);
    this.scrollToStory();
    this.closeMobileTopicsPanel();
  }
  topicClicked(topic: Topic) {
    if (this.attachedTopics.some(x => x.id == topic.id)) {
      return;
    }
    this.attachedTopics.push(topic);
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
    const link = `https://bughosted.com/Social/${storyId}`;
    this.closeStoryOptionsPanel();
    navigator.clipboard.writeText(link).then(() => {
      this.parentRef?.showNotification('Link copied to clipboard!');
    }).catch(err => {
      this.parentRef?.showNotification('Failed to copy link!');
    });
  }
  updateStoryDates() { 
    if (this.storyResponse?.stories) {
      this.storyResponse.stories.forEach(story => {
        story.timeSince = this.daysSinceDate(story.date);
      });
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

    setTimeout(() => { this.search.nativeElement.focus(); }, 50);
  }
  closeSearchSocialsPanel() {
    this.isSearchSocialsPanelOpen = false;
    if (this.parentRef) {
      this.parentRef.closeOverlay();
    }
  }
  showMobileTopicsPanel() {
    this.isMobileTopicsPanelOpen = true;
    if (this.parentRef) {
      this.parentRef.showOverlay();
    }
  }
  closeMobileTopicsPanel() {
    this.isMobileTopicsPanelOpen = false;
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
    if (this.parentRef) {
      this.parentRef.showOverlay();
    }
  }
  closeMenuPanel() {
    this.isMenuPanelOpen = false;
    if (this.parentRef) {
      this.parentRef.closeOverlay();
    }
  }
  showStoryOptionsPanel(story: Story) {
    if (this.isStoryOptionsPanelOpen) {
      this.closeStoryOptionsPanel();
      return;
    }
    this.optionStory = story;
    this.isStoryOptionsPanelOpen = true;
    if (this.parentRef) {
      this.parentRef.showOverlay();
    }
  }
  closeStoryOptionsPanel() {
    this.isStoryOptionsPanelOpen = false;
    this.optionStory = undefined;

    if (this.parentRef) {
      this.parentRef.closeOverlay();
    }
  }
  showPostOptionsPanel() { 
    if (this.isPostOptionsPanelOpen) {
      this.closePostOptionsPanel();
      if (this.parentRef) {
        this.parentRef.closeOverlay();
      }
      return;
    }
    this.isPostOptionsPanelOpen = true;
    if (this.parentRef) {
      this.parentRef.showOverlay();
    }
  }
  closePostOptionsPanel() {
    this.isPostOptionsPanelOpen = false;

    if (this.parentRef) {
      this.parentRef.closeOverlay();
    }
  }
  openInsertEmojiPanel() {
    if (this.isEmojiPanelOpen) {
      this.closeInsertEmojiPanel();
      return;
    }
    this.isEmojiPanelOpen = true;
    const parent = this.parent ?? this.parentRef;
    if (parent) {
      parent.showOverlay();
      this.filteredEmojis = { ...parent.emojiMap }; 
    }
  }
  closeInsertEmojiPanel() {
    this.isEmojiPanelOpen = false;

    if (this.parentRef) {
      this.parentRef.closeOverlay();
    }
  }
  isEditButtonVisible(storyId?: number) {
    if (!storyId) return false;
    const element = document.getElementById('storyTextEditConfirmButton' + storyId) as HTMLTextAreaElement;
    return element?.style.display === 'block';
  }
  getOptionsCount() {
    let count = 0;
    if (this.eachAttachmentSeperatePost) count++;
    return count;
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
    if (!url) return false;
    try {
      const parsedUrl = new URL(url);
      const isYoutubeDomain = ['www.youtube.com', 'm.youtube.com', 'youtube.com', 'youtu.be'].includes(parsedUrl.hostname);

      return isYoutubeDomain;
    } catch (e) {
      return false;
    }
  }
  async addToMusicPlaylist(story?: Story, metadata?: MetaData, event?: Event) {
    if (!story || !story.metadata) return;
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

    const resTodo = await this.todoService.createTodo(this.parentRef?.user!, tmpTodo);
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
    const element = document.getElementById(elementId);
    if (!element) {
      return false; // Element not found
    }

    const isDesktop = window.innerWidth > 990;
    const threshold = 400; // 500px for desktop, 100px for mobile

    return element.scrollHeight >= threshold;
  }
  async loadMorePosts() {
    this.currentPage++;
    await this.getStories(this.currentPage + 1, 10, undefined, undefined, true);
  }
  debouncedSearch() {
    this.userSearch = this.search.nativeElement.value;
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.searchStories(this.attachedTopics, true), 500);
  }
  insertTag(tag: string, componentId?: string) {
    let targetInput = componentId
      ? document.getElementById(componentId) as HTMLInputElement
      : this.story.nativeElement;

    if (!targetInput) return;

    const start = targetInput.selectionStart || 0;
    const end = targetInput.selectionEnd || 0;
    const selectedText = targetInput.value.substring(start, end);

    let newText;
    if (selectedText) {
      // Wrap selected text with the tag
      newText = targetInput.value.substring(0, start) +
        `[${tag}]${selectedText}[/${tag}]` +
        targetInput.value.substring(end);
    } else {
      // Insert empty tag at cursor position
      newText = targetInput.value.substring(0, end) +
        `[${tag}][/${tag}]` +
        targetInput.value.substring(end);
    }

    // Apply the modified text
    targetInput.value = newText;

    // Adjust cursor position after inserting tags
    const cursorPos = selectedText ? end + tag.length + 6 : end + tag.length + 6;
    targetInput.setSelectionRange(cursorPos, cursorPos);
    targetInput.focus();
  }
  insertBold(componentId?: string) {
    this.insertTag('b', componentId);
  }
  insertItalics(componentId?: string) {
    this.insertTag('i', componentId);
  }
  insertBullet(componentId?: string) {
    this.insertTag('*', componentId);
  }
  insertEmoji(emoji: string) {
    this.story.nativeElement.value += emoji;
    this.closeInsertEmojiPanel();
  }
  getTextForDOM(text?: string, componentId?: any) {
    const parent = this.parent ?? this.parentRef;
    if (parent) {
      return parent.getTextForDOM(text, componentId);
    } else return "Error fetching parent component.";
  }
  clearSearchInput() {
    this.search.nativeElement.value = '';
    this.userSearch = '';
    this.searchStories();
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

  async updateNSFW(event: Event) {
    const parent = this.parent ?? this.parentRef;
    const user = parent?.user;
    if (!user) return alert("You must be logged in to view NSFW content.");
    const isChecked = (event.target as HTMLInputElement).checked;
    this.isDisplayingNSFW = isChecked;
    this.userService.updateNSFW(user, isChecked).then(res => {
      if (res) {
        parent.showNotification(res);
        this.searchStories();
      }
    }); 
  }
}
