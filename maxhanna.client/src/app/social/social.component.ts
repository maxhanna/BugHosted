import { AfterViewInit, Component, ElementRef, Input, OnInit, SecurityContext, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { Story } from '../../services/datacontracts/story';
import { StoryComment } from '../../services/datacontracts/story-comment';
import { SocialService } from '../../services/social.service';
import { User } from '../../services/datacontracts/user';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { FileEntry } from '../../services/datacontracts/file-entry';
import { FileService } from '../../services/file.service';
import { Topic } from '../../services/datacontracts/topic';
import { AppComponent } from '../app.component';
import { MediaSelectorComponent } from '../media-selector/media-selector.component';
import { StoryResponse } from '../../services/datacontracts/story-response';
import { TopicsComponent } from '../topics/topics.component';

@Component({
  selector: 'app-social',
  templateUrl: './social.component.html',
  styleUrls: ['./social.component.css']
})
export class SocialComponent extends ChildComponent implements OnInit, AfterViewInit {
  fileMetadata: any;
  youtubeMetadata: any;
  storyResponse?: StoryResponse;
  comments: StoryComment[] = [];
  loading = false;
  showComments = false;
  revealSearchFilters = false;
  openedMemes: number[] = [];
  selectedAttachmentFileExtension: string | null = null;
  isEditing: number[] = [];
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

  fileType: string | undefined;
  abortAttachmentRequestController: AbortController | null = null;
  notifications: String[] = [];
  attachedSearchTopics: Array<Topic> = [];

  currentPage: number = 1;
  totalPages: number = 1;
  totalPagesArray: number[] = [];

  @ViewChild('story') story!: ElementRef<HTMLInputElement>;
  @ViewChild('pageSelect') pageSelect!: ElementRef<HTMLSelectElement>;
  @ViewChild('search') search!: ElementRef<HTMLInputElement>;
  @ViewChild('componentMain') componentMain!: ElementRef<HTMLDivElement>;
  @ViewChild(MediaSelectorComponent) mediaSelectorComponent!: MediaSelectorComponent;
  @ViewChild(TopicsComponent) topicComponent!: TopicsComponent;

  @Input() storyId: number | null = null;
  @Input() showTopicSelector: boolean = true;
  @Input() user?: User;
  @Input() parent?: AppComponent;

  constructor(private socialService: SocialService, private sanitizer: DomSanitizer) {
    super();
  }

  async ngOnInit() {
    if (this.parent) {
      this.parentRef = this.parent;
    }
    await this.getStories();
    if (this.storyId) {
      this.scrollToStory(this.storyId);
    }
  }
  ngAfterViewInit() {
    if (this.user) {
      this.componentMain.nativeElement.style.padding = "5px";
    }
  }
  pageChanged() {
    this.currentPage = parseInt(this.pageSelect.nativeElement.value);
    this.getStories(this.currentPage);
  }
  scrollToStory(storyId: number): void {
    setTimeout(() => {
      const element = document.getElementById('storyDiv' + storyId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 1110);
  }
  async delete(story: Story) {
    if (!this.parentRef?.user) { return alert("Error: Cannot delete storise that dont belong to you."); }
    const res = await this.socialService.deleteStory(this.parentRef?.user, story);
    if (res) {
      this.notifications.push(res);
      if (res.toLowerCase().includes('successful')) {
        this.storyResponse!.stories! = this.storyResponse!.stories!.filter((x: { id: number | undefined; }) => x.id != story.id);
      }
    }
  }
  async onTopicAdded(topics: Array<Topic>) {
    this.attachedTopics = topics;
    this.searchStories(topics);
  }

  uploadInitiate() {

  }
  selectFile(files: FileEntry[]) { 
    if (files) {  
      this.attachedFiles = files.flatMap(fileArray => fileArray); 
    }
  }

  copyLink(storyId: number) {
    const link = `https://bughosted.com/Social/${storyId}`;
    navigator.clipboard.writeText(link).then(() => {
      this.notifications.push('Link copied to clipboard!');
    }).catch(err => {
      this.notifications.push('Failed to copy link!');
    });
  }

  uploadNotification(notification: string) {

  }

  async searchStories(searchTopics?: Array<Topic>) {
    this.log("searchTopics ");
    this.log(searchTopics);
    let search = this.search.nativeElement.value;
    let topics = '';
    if (searchTopics && searchTopics.length > 0) {
      topics = topics.trim() != '' ? topics + ',' : topics;
      searchTopics.forEach(x => { topics += topics.trim() != '' ? ',' + x.id : x.id })
    }
    await this.getStories(this.currentPage, 10, search, topics);
  }

  async getStories(page: number = 1, pageSize: number = 10, keywords?: string, topics?: string) {
    const search = keywords ?? this.search?.nativeElement.value;

    if (this.user) {
      const res = await this.socialService.getStories(
        this.parentRef?.user!,
        search,
        topics,
        this.user?.id,
        page,
        pageSize
      );
      if (res) {
        this.storyResponse = res;
        this.totalPages = this.storyResponse.pageCount;
        this.totalPagesArray = Array.from({ length: this.totalPages }, (_, index) => index + 1);
      }
      return;
    }
    const res = await this.socialService.getStories(
      this.parentRef?.user!,
      search,
      topics,
      undefined,
      page,
      pageSize
    );
    if (res) {
      this.storyResponse = res;
      this.totalPages = this.storyResponse.pageCount;
      this.totalPagesArray = Array.from({ length: this.totalPages }, (_, index) => index + 1);
    }
  }

  async post() { 
    const storyText = this.story.nativeElement.value!;
    if (!storyText || storyText.trim() == '') { return alert("Story can't be empty!"); }
    const newStory: Story = {
      id: 0,
      user: this.parentRef?.user!,
      storyText: this.replaceEmojisInMessage(storyText),
      fileId: null,
      date: new Date(),
      upvotes: 0,
      downvotes: 0,
      commentsCount: 0,
      storyComments: undefined,
      metadata: undefined,
      storyFiles: this.attachedFiles,
      storyTopics: this.attachedTopics,
      profileUserId: this.user?.id
    };

    this.attachedFiles = [];
    this.attachedTopics = [];
    this.mediaSelectorComponent.closeMediaSelector();
    this.story.nativeElement.value = '';

    const res = await this.socialService.postStory(this.parentRef?.user! ?? this.parent?.user, newStory);
    if (res) {
      await this.getStories();
    }
    if (this.topicComponent) { 
      this.topicComponent.removeAllTopics();
    }
  }

  removeAttachment(fileId: number) {
    this.attachedFiles = this.attachedFiles.filter(x => x.id != fileId);
  }

  extractUrl(text: string) {
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    const matches = text.match(urlPattern);
    return matches ? matches[0] : null;
  }

  createClickableUrls(text?: string): SafeHtml {
    if (!text) { return ''; }
    const urlPattern = /(https?:\/\/[^\s]+)/g;

    text = text.replace(urlPattern, '<a href="$1" target="_blank">$1</a>').replace(/\n/g, '<br>');
    const sanitizedText = this.sanitizer.sanitize(SecurityContext.HTML, text) || '';

    return sanitizedText;
  }

  focusInput(): void {
    setTimeout(() => {
      this.story.nativeElement.scrollIntoView({ behavior: 'smooth' });
    }, 300); // Timeout to wait for the keyboard to appear
  }
}
