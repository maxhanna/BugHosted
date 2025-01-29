import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, Input, OnInit, SecurityContext, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { Story } from '../../services/datacontracts/social/story';
import { SocialService } from '../../services/social.service';
import { TopicService } from '../../services/topic.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
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
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';

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
export class SocialComponent extends ChildComponent implements OnInit, AfterViewInit {
  fileMetadata: any;
  youtubeMetadata: any;
  storyResponse?: StoryResponse;
  optionStory?: Story;
  comments: FileComment[] = [];
  openedStoryComments: number[] = [];
  isMobileTopicsPanelOpen = false;
  isSearchSocialsPanelOpen = false;
  isMenuPanelOpen = false;
  isStoryOptionsPanelOpen = false;
  isPostOptionsPanelOpen = false;
  isEditing: number[] = [];
  editingTopics: number[] = [];
  selectedAttachmentFileExtension: string | null = null; 
  eachAttachmentSeperatePost = false;
  isUploadInitiate = true;
  attachedFiles: FileEntry[] = [];
  attachedTopics: Array<Topic> = [];
  selectedAttachment: string | undefined;
  selectedStoryId: number | undefined;
  selectedAttachmentUrl: string | undefined;
  imageFileExtensions = ["jpg", "jpeg", "png", "gif", "bmp", "tiff", "svg", "webp"];
  videoFileExtensions = ["mp4", "mov", "avi", "wmv", "webm", "flv"];
  emojiMap: { [key: string]: string } =
    { ":)": "😊", ":(": "☹️", ";)": "😉", ":D": "😃", "XD": "😆", ":P": "😛", ":O": "😮", "B)": "😎", ":/": "😕", ":'(": "😢", "<3": "❤️", "</3": "💔", ":*": "😘", "O:)": "😇", "3:)": "😈", ":|": "😐", ":$": "😳", "8)": "😎", "^_^": "😊", "-_-": "😑", ">_<": "😣", ":'D": "😂", ":3": "😺", ":v": "✌️", ":S": "😖", ":b": "😛", ":x": "😶", ":X": "🤐", ":Z": "😴", "*_*": "😍", ":@": "😡", ":#": "🤬", ">:(": "😠", ":&": "🤢", ":T": "😋", "T_T": "😭", "Q_Q": "😭", ":1": "😆", "O_O": "😳", "*o*": "😍", "T-T": "😭", ";P": "😜", ":B": "😛", ":W": "😅", ":L": "😞", ":E": "😲", ":M": "🤔", ":C": "😏", ":I": "🤓", ":Q": "😮", ":F": "😇", ":G": "😵", ":H": "😱", ":J": "😜", ":K": "😞", ":Y": "😮", ":N": "😒", ":U": "😕", ":V": "😈", ":wave:": "👋", ":ok:": "👌", ":thumbsup:": "👍", ":thumbsdown:": "👎", ":clap:": "👏", ":star:": "⭐", ":star2:": "🌟", ":dizzy:": "💫", ":sparkles:": "✨", ":boom:": "💥", ":fire:": "🔥", ":droplet:": "💧", ":sweat_drops:": "💦", ":dash:": "💨", ":cloud:": "☁️", ":sunny:": "☀️", ":umbrella:": "☂️", ":snowflake:": "❄️", ":snowman:": "⛄", ":zap:": "⚡", ":cyclone:": "🌀", ":fog:": "🌫️", ":rainbow:": "🌈", ":heart:": "❤️", ":blue_heart:": "💙", ":green_heart:": "💚", ":yellow_heart:": "💛", ":purple_heart:": "💜", ":black_heart:": "🖤", ":white_heart:": "🤍", ":orange_heart:": "🧡", ":broken_heart:": "💔", ":heartbeat:": "💓", ":heartpulse:": "💗", ":two_hearts:": "💕", ":sparkling_heart:": "💖", ":cupid:": "💘", ":gift_heart:": "💝", ":revolving_hearts:": "💞", ":heart_decoration:": "💟", ":peace:": "☮️", ":cross:": "✝️", ":star_and_crescent:": "☪️", ":om:": "🕉️", ":wheel_of_dharma:": "☸️", ":yin_yang:": "☯️", ":orthodox_cross:": "☦️", ":star_of_david:": "✡️", ":six_pointed_star:": "🔯", ":menorah:": "🕎", ":infinity:": "♾️", ":wavy_dash:": "〰️", ":congratulations:": "㊗️", ":secret:": "㊙️", ":red_circle:": "🔴", ":orange_circle:": "🟠", ":yellow_circle:": "🟡", ":green_circle:": "🟢", ":blue_circle:": "🔵", ":purple_circle:": "🟣", ":brown_circle:": "🟤", ":black_circle:": "⚫", ":white_circle:": "⚪", ":red_square:": "🟥", ":orange_square:": "🟧", ":yellow_square:": "🟨", ":green_square:": "🟩", ":blue_square:": "🟦", ":purple_square:": "🟪", ":brown_square:": "🟫", ":black_large_square:": "⬛", ":white_large_square:": "⬜", ":black_medium_square:": "◼️", ": black_medium_small_square: ": "◾", ": white_medium_small_square: ": "◽", ": black_small_square: ": "▪️", ": white_small_square: ": "▫️", ": large_orange_diamond: ": "🔶", ": large_blue_diamond: ": "🔷", ": small_orange_diamond: ": "🔸", ": small_blue_diamond: ": "🔹", ": red_triangle_pointed_up: ": "🔺", ": red_triangle_pointed_down: ": "🔻", ": diamond_shape_with_a_dot_inside: ": "💠", ": radio_button: ": "🔘", ": white_square_button: ": "🔳", ": black_square_button: ": "🔲", ": checkered_flag: ": "🏁", ": triangular_flag_on_post: ": "🚩", ": crossed_flags: ": "🎌", ": black_flag: ": "🏴", ": white_flag: ": "🏳️", ": rainbow_flag: ": "🏳️‍🌈", ": pirate_flag: ": "🏴‍☠️" };
  storyOverflowMap: { [key: string]: boolean } = {};

  userProfileId?: number = undefined;

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
  searchTimeout: any;


  city : string | undefined;
  country: string | undefined;

  @ViewChild('story') story!: ElementRef<HTMLInputElement>;
  @ViewChild('pageSelect') pageSelect!: ElementRef<HTMLSelectElement>;
  @ViewChild('pageSelect2') pageSelect2!: ElementRef<HTMLSelectElement>;
  @ViewChild('search') search!: ElementRef<HTMLInputElement>;
  @ViewChild('componentMain') componentMain!: ElementRef<HTMLDivElement>;
  @ViewChild(MediaSelectorComponent) mediaSelectorComponent!: MediaSelectorComponent;
  @ViewChild(MediaSelectorComponent) postMediaSelector!: MediaSelectorComponent;
  @ViewChild(TopicsComponent) topicComponent!: TopicsComponent;

  @Input() storyId: number | null = null;
  @Input() showTopicSelector: boolean = true;
  @Input() user?: User;
  @Input() parent?: AppComponent;

  constructor(private socialService: SocialService,
    private topicService: TopicService,
    private userService: UserService,
    private todoService: TodoService,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef,
    private title: Title, private meta: Meta, private route: ActivatedRoute) {
    super();
  }

  async ngOnInit() {
    if (this.parent) {
      this.parentRef = this.parent;
    }

    await this.getStories();
    await this.topicService.getTopStoryTopics().then(res => {
      if (res) {
        this.topTopics = res;
      }
    });
    if (this.storyId) {
      this.scrollToStory(this.storyId); 
      if (this.storyResponse && this.storyResponse.stories && this.storyResponse.stories.length > 0) {
        const tgtStory = this.storyResponse.stories.find((story) => story.id == this.storyId); 
        if (tgtStory) {
          const storyText = tgtStory.storyText; 
          if (storyText) { 
            const cleanedTitle = storyText.replace(/https?:\/\/[^\s]+/g, '').trim();

            this.title.setTitle("BugHosted.com " + cleanedTitle.substring(0, 50));
            this.meta.updateTag({ name: 'description', content: storyText });
          }
        }
      } 
    }
    
    
    this.userService.getUserIp().then(res => {
      if (res) { 
        this.city = res.city;  
        this.country = res.country; 
      }
    });
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
      this.notifications.push(res);
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
      this.socialService.editStory(this.parentRef.user, story);
      this.isEditing = this.isEditing.filter(x => x != story.id);
    }
  }  
  async searchStories(searchTopics?: Array<Topic>, debounced?: boolean) { 
    let search = "";
    if (this.search && this.search.nativeElement) {
      search = this.search.nativeElement.value;
    }

    this.userSearch = search;
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
   
  async getStories(page: number = 1, pageSize: number = 25, keywords?: string, topics?: string) {
    this.startLoading();

    const search = keywords ?? this.search?.nativeElement.value;
    const userId = this.user?.id;

    const res = await this.socialService.getStories(
      this.parentRef?.user,
      search,
      topics,
      userId,
      page,
      pageSize
    );

    if (res) {
      this.storyResponse = res;
      this.totalPages = this.storyResponse.pageCount;
      this.totalPagesArray = Array.from({ length: this.totalPages }, (_, index) => index + 1);
      this.storyResponse.stories?.forEach(story => { 
        this.checkOverflow(story.id); 
      });
    }

    this.cdr.detectChanges();
    this.stopLoading();
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

      // Create and post stories
      const results = this.eachAttachmentSeperatePost
        ? await this.postEachFileAsSeparateStory(user, storyText)
        : await this.postSingleStory(user, storyText);
         
      if (results) {
        this.clearStoryInputs();
        this.getStories();
        this.topicComponent?.removeAllTopics();
      } else {
        this.notifications.push("Something went wrong...");
      }
    } catch (error) {
      console.error("Error while posting story:", error);
      this.notifications.push("An unexpected error occurred.");
    } finally {
      this.stopLoading();
    }
  }
   
  private createStory(user: User, storyText: string, files: FileEntry[]): Story {
    return {
      id: 0,
      user,
      storyText: this.replaceEmojisInMessage(storyText),
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
    return this.socialService.postStory(user, story);
  }
   
  private async postEachFileAsSeparateStory(user: User, storyText: string): Promise<any[]> {
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
      this.socialService.editTopics(user, story, topics);
      this.ngOnInit();
      this.closeStoryOptionsPanel();
      this.editingTopics = this.editingTopics.filter(x => x != story.id);
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
  goToLink(story?: Story) {
    if (story && story.storyText) {
      const goodUrl = this.extractUrl(story.storyText);
      if (goodUrl) {
        window.open(goodUrl, '_blank');
      }
    }
    else {
      if (story && story.metadata) {
        const tmpUrl = story.metadata.imageUrl;
        if (tmpUrl) {
          window.open(tmpUrl, '_blank');
        }
      }
    }
  } 

  pageChanged(selectorId?: number) {
    let pageSelect = this.pageSelect.nativeElement;
    if (selectorId == 2) {
      pageSelect = this.pageSelect2.nativeElement;
    }
    this.currentPage = parseInt(pageSelect.value);
    this.getStories(this.currentPage);
    setTimeout(() => {
      this.scrollToStory();
    }, 50);
  }
  scrollToStory(storyId?: number): void {
    if (storyId) {
      setTimeout(() => {
        const element = document.getElementById('storyDiv' + storyId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 1111);
    } else {
      setTimeout(() => {
        const element = document.getElementsByClassName('foodForThought')[0];
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 200);
    }
  }
  getStoryTextForDOM(story?: Story) {
    return story?.storyText
      ?.replace(/(https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+)/gi, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/\n/g, '<br>');
  }
  onTopicAdded(topics?: Array<Topic>) {
    if (topics) {
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
      this.notifications.push('Link copied to clipboard!');
    }).catch(err => {
      this.notifications.push('Failed to copy link!');
    });
  } 
  focusInput(): void {
    setTimeout(() => {
      this.story.nativeElement.scrollIntoView({ behavior: 'smooth' });
    }, 300); // Timeout to wait for the keyboard to appear
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
  daysSinceDate(dateString?: Date): string {
    if (!dateString) return '';

    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    const now = new Date();

    // Calculate differences
    let years = now.getFullYear() - date.getFullYear();
    let months = now.getMonth() - date.getMonth();
    let days = now.getDate() - date.getDate();
    let hours = now.getHours() - date.getHours();
    let minutes = now.getMinutes() - date.getMinutes();
    let seconds = now.getSeconds() - date.getSeconds();

    // Adjust for negative values
    if (seconds < 0) {
      minutes--;
      seconds += 60;
    }
    if (minutes < 0) {
      hours--;
      minutes += 60;
    }
    if (hours < 0) {
      days--;
      hours += 24;
    }
    if (days < 0) {
      months--;
      const daysInLastMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
      days += daysInLastMonth;
    }
    if (months < 0) {
      years--;
      months += 12;
    }

    // Build the result string dynamically
    const parts: string[] = [];
    if (years > 0) parts.push(`${years}y`);
    if (months > 0) parts.push(`${months}m`);
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0) parts.push(`${seconds}s`);

    return parts.join(' ');
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
  checkOverflow(storyId?: number): void {
    if (storyId) { 
      const elementId = 'storyTextContainer' + storyId;
      const element = document.getElementById(elementId);
      if (element) {
        this.storyOverflowMap[storyId] = element.scrollHeight > 70;
      } 
    }
  }
  showSearchSocialsPanel() {
    this.isSearchSocialsPanelOpen = true;
    if (this.parentRef) {
      this.parentRef.showOverlay = true;
    }

    setTimeout(() => { this.search.nativeElement.focus(); }, 50); 
  }
  closeSearchSocialsPanel() {
    this.isSearchSocialsPanelOpen = false;
    if (this.parentRef && this.parentRef.showOverlay) {
      this.parentRef.showOverlay = false;
    }
  }
  showMobileTopicsPanel() {
    this.isMobileTopicsPanelOpen = true;
    if (this.parentRef) {
      this.parentRef.showOverlay = true;
    }
  }
  closeMobileTopicsPanel() {
    this.isMobileTopicsPanelOpen = false;
    if (this.parentRef && this.parentRef.showOverlay) {
      this.parentRef.showOverlay = false;
    }
  }
  showMenuPanel() {
    if (this.isMenuPanelOpen) {
      this.closeMenuPanel();
      return;
    }
    this.isMenuPanelOpen = true;
    if (this.parentRef) {
      this.parentRef.showOverlay = true;
    }
  }
  closeMenuPanel() {
    this.isMenuPanelOpen = false;
    if (this.parentRef && this.parentRef.showOverlay) {
      this.parentRef.showOverlay = false;
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
      this.parentRef.showOverlay = true;
    }
  }
  closeStoryOptionsPanel() {
    this.isStoryOptionsPanelOpen = false;
    this.optionStory = undefined;

    if (this.parentRef && this.parentRef.showOverlay) {
      this.parentRef.showOverlay = false;
    }
  }
  showPostOptionsPanel() {
    if (this.isPostOptionsPanelOpen) {
      this.closePostOptionsPanel();
      return;
    } 
    this.isPostOptionsPanelOpen = true;
    if (this.parentRef) {
      this.parentRef.showOverlay = true;
    }
  }
  closePostOptionsPanel() {
    this.isPostOptionsPanelOpen = false; 

    if (this.parentRef && this.parentRef.showOverlay) {
      this.parentRef.showOverlay = false;
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
    if (this.openedStoryComments.includes(storyId ?? 0)) {
      this.openedStoryComments = this.openedStoryComments.filter(x => x != (storyId ?? 0));
    } else { 
      this.openedStoryComments.push(storyId ?? 0)
    }
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
      const isYoutubeDomain = ['www.youtube.com', 'youtube.com', 'youtu.be'].includes(parsedUrl.hostname);

      return isYoutubeDomain;
    } catch (e) { 
      return false;
    }
  }
  async addToMusicPlaylist(story?: Story, event?:Event) {
    if (!story) return;
    const url = this.extractUrl(story.storyText);
    const title = story.metadata?.title; 
    const yturl = this.extractYouTubeVideoId(url); 
    if (!yturl || !title || yturl.trim() == "" || title.trim() == "") {
      return alert("Title & URL cannot be empty!");
    }
    let tmpTodo = new Todo();
    tmpTodo.type = "music";
    tmpTodo.url = yturl.trim();
    tmpTodo.todo = title.trim().replace("- YouTube", "");

    const resTodo = await this.todoService.createTodo(this.parentRef?.user!, tmpTodo);
    if (resTodo) {
      this.notifications.push(`Added ${title} to music playlist.`);
    }
    if (event) {
      const button = event.target as HTMLButtonElement;
      button.textContent = "Added";
      button.disabled = true;    
    }
    //this.closeStoryOptionsPanel();
  }
  extractYouTubeVideoId(url?: string) {
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
    const element = document.getElementById(elementId);
    if (!element) {
      return false; // Element not found
    } 

    const isDesktop = window.innerWidth > 990;
    const threshold = isDesktop ? 500 : 100; // 500px for desktop, 100px for mobile

    return element.scrollHeight >= threshold; 
  }
  debouncedSearch() {  
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.searchStories(undefined, true), 500); 
  }

}
