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

@Component({
  selector: 'app-social',
  templateUrl: './social.component.html',
  styleUrls: ['./social.component.css']
})
export class SocialComponent extends ChildComponent implements OnInit, AfterViewInit {
  fileMetadata: any;
  youtubeMetadata: any;
  stories: Story[] = [];
  comments: StoryComment[] = [];
  loading = false;
  showComments = false;
  revealSearchFilters = false;
  openedMemes: number[] = [];
  selectedAttachmentFileExtension: string | null = null;
  isEditing: number[] = [];
  isUploadInitiate = true;
  attachedFiles: Array<FileEntry> = [];
  attachedTopics: Array<Topic> = [];
  selectedAttachment: string | undefined;
  selectedStoryId: number | undefined;
  selectedAttachmentUrl: string | undefined;
  imageFileExtensions = ["jpg", "jpeg", "png", "gif", "bmp", "tiff", "svg", "webp"];
  videoFileExtensions = ["mp4", "mov", "avi", "wmv", "webm", "flv"];
  fileType: string | undefined;
  abortAttachmentRequestController: AbortController | null = null;
  notifications: String[] = [];
  attachedSearchTopics: Array<Topic> = [];

  @ViewChild('story') story!: ElementRef<HTMLInputElement>;
  @ViewChild('search') search!: ElementRef<HTMLInputElement>;
  @ViewChild('componentMain') componentMain!: ElementRef<HTMLDivElement>;
  @ViewChild(MediaSelectorComponent) mediaSelectorComponent!: MediaSelectorComponent;

  @Input() storyId: number | null = null;
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

  scrollToStory(storyId: number): void {
    setTimeout(() => {
      const element = document.getElementById('storyDiv' + storyId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 1110);
  }
  async delete(story: Story) {
    console.log(`deleting ${story.id}`);
    if (!this.parentRef?.user) { return alert("Error: Cannot delete storise that dont belong to you."); }
    const res = await this.socialService.deleteStory(this.parentRef?.user, story);
    if (res) {
      this.notifications.push(res);
      if (res.toLowerCase().includes('successful')) {
        this.stories = this.stories.filter(x => x.id != story.id);
      }
    }
  }
  async onTopicAdded(topics: Array<Topic>) {
    this.attachedTopics = topics;
  }

  uploadInitiate() {

  }
  selectFile(files: Array<FileEntry>) {
    this.attachedFiles = this.attachedFiles.concat(files);
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


  async searchStories() {
    const search = this.search.nativeElement.value;
    if (search) {
      await this.getStories(search);
    } else {
      await this.getStories();
    }
  }

  async getStories(keywords?: string) {
    console.log("get stories for : " + this.user?.id + " keywords: " + keywords);
    if (this.user) {
      const res = await this.socialService.getStories(this.parentRef?.user!, undefined, this.user?.id);
      if (res) {
        this.stories = res;
      }
      return;
    }
    const search = keywords ?? this.search?.nativeElement.value;
    const res = await this.socialService.getStories(this.parentRef?.user!, search);
    if (res) {
      this.stories = res;
    }
  }

  async post() {
    if (!this.parentRef?.verifyUser() && !this.parent?.verifyUser()) { return alert("You must be logged in to use this feature!"); }

    const storyText = this.story.nativeElement.value!;
    if (!storyText || storyText.trim() == '') { return alert("Story can't be empty!"); }
    const newStory: Story = {
      id: 0,
      user: this.parentRef?.user!,
      storyText: storyText,
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
    this.mediaSelectorComponent.selectedFiles = [];
    this.mediaSelectorComponent.clickViewMediaChoices();
    this.story.nativeElement.value = '';

    const res = await this.socialService.postStory(this.parentRef?.user! ?? this.parent?.user, newStory);
    if (res) {
      await this.getStories();
    }
  }


  async upvoteStory(story: Story) {
    const res = await this.socialService.upvoteStory(this.parentRef?.user!, story.id!, true);
    if (res) {
      story.upvotes! = res.upvotes!;
      story.downvotes! = res.downvotes!;
    }
  }

  async downvoteStory(story: Story) {
    const res = await this.socialService.downvoteStory(this.parentRef?.user!, story.id!, true);
    if (res) {
      story.upvotes! = res.upvotes!;
      story.downvotes! = res.downvotes!;
    }
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
