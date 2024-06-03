import { Component, ElementRef, OnInit, SecurityContext, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { Story } from '../../services/datacontracts/story';
import { StoryComment } from '../../services/datacontracts/story-comment';
import { SocialService } from '../../services/social.service';
import { User } from '../../services/datacontracts/user';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-social',
  templateUrl: './social.component.html',
  styleUrls: ['./social.component.css']
})
export class SocialComponent extends ChildComponent implements OnInit {
  fileMetadata: any;
  youtubeMetadata: any;
  stories: Story[] = [];
  comments: StoryComment[] = [];
  loading = false;
  showComments = false;
  openedMemes: number[] = [];
  selectedMeme: string | null = null;
  selectedMemeFileExtension: string | null = null;
  videoFileExtensions = ['mp4', 'avi', 'mov'];
  isEditing: number[] = [];
 
  @ViewChild('story') story!: ElementRef<HTMLInputElement>;
  @ViewChild('search') search!: ElementRef<HTMLInputElement>;

  constructor(private socialService: SocialService, private sanitizer: DomSanitizer) {
    super();
  }

  async ngOnInit() {
    this.getStories(); 
   }
  async like() {

  }
  async comment() {
    if (!this.parentRef?.verifyUser()) { return alert("You must be logged in to use this feature!"); }

  }
  async share() {

  }
  async searchStories() {
    const search = this.search.nativeElement.value;
    if (search) {
      await this.getStories(search);
    }
  }

  async getStories(keywords?: string) {
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
      metadata: undefined,
    };

    const res = await this.socialService.postStory(this.parentRef?.user!, newStory);
    if (res) {
      this.getStories();
      this.story.nativeElement.value = '';
    }
  }


  async upvoteStory(story: Story) {
    const res = await this.socialService.upvoteComment(this.parentRef?.user!, story.id!, true);
    if (res) {
      story.upvotes!++;
    }
  }

  async downvoteMeme(story: Story) {
    const res = await this.socialService.downvoteComment(this.parentRef?.user!, story.id!, true);
    if (res) {
      story.downvotes!++;
    }
  }

  extractUrl(text: string) {
    // Regular expression pattern to match URLs
    const urlPattern = /(https?:\/\/[^\s]+)/g;

    // Match URLs in the text
    const matches = text.match(urlPattern);

    // Return the first match if found, otherwise return null
    return matches ? matches[0] : null;
  }

  createClickableUrls(text?: string): SafeHtml {
    // Regular expression pattern to match URLs
    const urlPattern = /(https?:\/\/[^\s]+)/g;

    // Replace URLs with clickable <a> tags
    const sanitizedText = this.sanitizer.sanitize(SecurityContext.HTML, text ?? '') || '';
    const clickableText = sanitizedText.replace(urlPattern, '<a href="$1" target="_blank">$1</a>');

    // Further sanitize the clickable text to remove any malicious code
    return this.sanitizer.bypassSecurityTrustHtml(clickableText);
  }
  focusInput(): void {
    setTimeout(() => {
      this.story.nativeElement.scrollIntoView({ behavior: 'smooth' });
    }, 300); // Timeout to wait for the keyboard to appear
  } 
}
