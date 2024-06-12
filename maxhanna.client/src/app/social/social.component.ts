import { Component, ElementRef, Input, OnInit, SecurityContext, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { Story } from '../../services/datacontracts/story';
import { StoryComment } from '../../services/datacontracts/story-comment';
import { SocialService } from '../../services/social.service';
import { User } from '../../services/datacontracts/user';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { FileEntry } from '../../services/datacontracts/file-entry';
import { FileService } from '../../services/file.service';
import { ActivatedRoute } from '@angular/router';
import { TopicService } from '../../services/topic.service';
import { Topic } from '../../services/datacontracts/topic';

@Component({
  selector: 'app-social',
  templateUrl: './social.component.html',
  styleUrls: ['./social.component.css']
})
export class SocialComponent extends ChildComponent implements OnInit {
  @Input() user?: User; 
  fileMetadata: any;
  youtubeMetadata: any;
  stories: Story[] = [];
  comments: StoryComment[] = [];
  loading = false;
  showComments = false;
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
  revealSearchFilters = false;

  @ViewChild('story') story!: ElementRef<HTMLInputElement>;
  @ViewChild('search') search!: ElementRef<HTMLInputElement>;

  @Input() storyId: number | null = null;
  constructor(private socialService: SocialService,
    private fileService: FileService,
    private sanitizer: DomSanitizer,
    private route: ActivatedRoute,
    private topicService: TopicService) {
    super();
  }

  async ngOnInit() {
    await this.getStories();
    if (this.storyId) {
      this.scrollToStory(this.storyId);
    }
  }

  scrollToStory(storyId: number): void {
    setTimeout(() => {
      const element = document.getElementById('storyDiv' + storyId); 
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' }); 
      }
    }, 1110);
  }

  async onTopicAdded(topics: Array<Topic>) {
    this.attachedTopics = topics;
  }

  uploadInitiate() {

  }
  uploadFinished(files: Array<FileEntry>) {
    this.attachedFiles = this.attachedFiles.concat(files);
  }

  copyLink(storyId: number) {
    const link = `https://maxhanna.ca/Social/${storyId}`;
    navigator.clipboard.writeText(link).then(() => {
      this.notifications.push('Link copied to clipboard!');
    }).catch(err => {
      this.notifications.push('Failed to copy link!');
    });
  }

  uploadNotification(notification: string) {

  }

  cancelMakeDirectoryOrFile() { 
  }
   
        
  async loadFile(fileName: string, fileNamePath?: string, storyId?: number) {
    this.loading = true;
    if (!fileNamePath) { return; }
    try {

      if (this.selectedAttachment == fileName && this.selectedStoryId == storyId) {
        this.selectedAttachment = undefined;
        this.selectedStoryId = undefined;
        return;
      }
      this.selectedAttachment = fileName;
      this.selectedStoryId = storyId;

      if (this.abortAttachmentRequestController) {
        this.abortAttachmentRequestController.abort();
      }

      this.abortAttachmentRequestController = new AbortController();

      const response = await this.fileService.getFile(fileNamePath, {
        signal: this.abortAttachmentRequestController.signal
      }, this.parentRef?.user);
      if (!response || response == null) return;

      const contentDisposition = response.headers["content-disposition"];
      this.selectedAttachmentFileExtension = this.getFileExtensionFromContentDisposition(contentDisposition);
      if (this.videoFileExtensions.includes(this.selectedAttachmentFileExtension!)) {
        this.fileType = `video/${this.selectedAttachmentFileExtension}`;
      } else if (this.imageFileExtensions.includes(this.selectedAttachmentFileExtension!)) {
        this.fileType = `image/${this.selectedAttachmentFileExtension}`;
      } else {
        this.fileType = undefined;
        return;
      }

      const type = this.fileType;
      const blob = new Blob([response.blob], { type });
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = () => {
        setTimeout(() => {
          this.selectedAttachmentUrl = reader.result as string;
       }, 1);
      };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Fetch aborted');
      } else {
        console.error('Fetch error:', error);
      }
    } finally {
      this.loading = false;
    }
  }
  async download(fileName: string, user: User) { 
    if (!confirm(`Download ${fileName}?`)) {
      return;
    }
    const target = "Users/" + user.username + "/" + fileName;
    try {
      this.startLoading();
      const response = await this.fileService.getFile(target, undefined, this.parentRef?.user);
      const blob = new Blob([response?.blob!], { type: 'application/octet-stream' });

      const a = document.createElement('a');
      a.href = window.URL.createObjectURL(blob);
      a.download = fileName;
      a.id = (Math.random() * 100) + "";
      a.click();

      // Cleanup
      window.URL.revokeObjectURL(a.href);
      document.getElementById(a.id)?.remove();
      this.stopLoading();
    } catch (ex) {
      console.error(ex);
    }
  }
  getFileExtensionFromContentDisposition(contentDisposition: string | null): string {
    if (!contentDisposition) return '';

    // Look for filename="..." and extract the substring
    const filenameStart = contentDisposition.indexOf('filename=') + 10; // 10 to account for the length of 'filename="'
    const filenameEnd = contentDisposition.indexOf('"', filenameStart);
    if (filenameStart >= 10 && filenameEnd > filenameStart) {
      const filename = contentDisposition.substring(filenameStart, filenameEnd);
      return filename.split('.').pop() || '';
    }

    // Look for filename*=UTF-8''... and extract the substring
    const filenameStartEncoded = contentDisposition.indexOf("filename*=");
    if (filenameStartEncoded >= 0) {
      const filenameEncodedPart = contentDisposition.substring(filenameStartEncoded);
      const utf8Match = filenameEncodedPart.match(/^filename\*=(UTF-8'')?(.+)$/);
      if (utf8Match && utf8Match[2]) {
        const filename = decodeURIComponent(utf8Match[2].replace(/'/g, ''));
        return filename.split('.').pop() || '';
      }
    }

    return '';
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
    if (this.user) {
      const res = await this.socialService.getStories(this.parentRef?.user!, this.user.username);
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
    if (!this.parentRef?.verifyUser()) { return alert("You must be logged in to use this feature!"); }

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
      storyTopics: this.attachedTopics
    };

    this.attachedFiles = [];
    this.attachedTopics = [];

    const res = await this.socialService.postStory(this.parentRef?.user!, newStory);
    if (res) {
      await this.getStories();
      this.story.nativeElement.value = '';
    }
  }

  async addComment(story: Story, event: Event) {
    if (!story || !story.id) { return alert("Invalid story glitch"); }

    const text = (document.getElementById("addCommentInput" + story.id) as HTMLInputElement).value;
    (document.getElementById("addCommentInput" + story.id) as HTMLInputElement).value = '';

    const commentId = await this.socialService.comment(story.id!, text, this.parentRef?.user);
    if (commentId) {
      let tmpComment = new StoryComment();
      tmpComment.id = parseInt(commentId);
      tmpComment.storyId = story.id;
      tmpComment.text = text;
      tmpComment.upvotes = 0;
      tmpComment.downvotes = 0;
      tmpComment.user = this.parentRef?.user ?? new User(0, "Anonymous");
      tmpComment.date = new Date();
      story.storyComments!.push(tmpComment);
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

  async upvoteComment(comment: StoryComment) {
    const res = await this.socialService.upvoteComment(this.parentRef?.user!, comment.id!, true);
    if (res) {
      comment.upvotes! = res.upvotes!;
      comment.downvotes! = res.downvotes!;
    }
  }
  async downvoteComment(comment: StoryComment) {
    const res = await this.socialService.downvoteComment(this.parentRef?.user!, comment.id!, true);
    if (res) {
      comment.upvotes! = res.upvotes!;
      comment.downvotes! = res.downvotes!;
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
