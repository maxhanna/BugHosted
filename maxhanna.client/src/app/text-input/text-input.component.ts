import { Component, ElementRef, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { AppComponent } from '../app.component';
import { Topic } from '../../services/datacontracts/topics/topic';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { TopicService } from '../../services/topic.service';
import { User } from '../../services/datacontracts/user/user';
import { NotificationService } from '../../services/notification.service';
import { ChatService } from '../../services/chat.service';
import { CommentService } from '../../services/comment.service';
import { SocialService } from '../../services/social.service';
import { Story } from '../../services/datacontracts/social/story';
import { FileComment } from '../../services/datacontracts/file/file-comment';
import { MediaSelectorComponent } from '../media-selector/media-selector.component';
import { TopicsComponent } from '../topics/topics.component';
import { EncryptionService } from '../../services/encryption.service';
import { TopicRank } from '../../services/datacontracts/topics/topic-rank';

@Component({
  selector: 'app-text-input',
  standalone: false,
  templateUrl: './text-input.component.html',
  styleUrl: './text-input.component.css'
})
export class TextInputComponent extends ChildComponent implements OnInit, OnChanges {
  constructor(
    private topicService: TopicService,
    private notificationService: NotificationService,
    private commentService: CommentService,
    private chatService: ChatService,
    private socialService: SocialService,
    private encryptionService: EncryptionService
  ) { super(); }

  @Input() inputtedParentRef?: AppComponent;
  @Input() profileUser?: User;
  @Input() commentParent?: FileComment | Story | FileEntry | undefined;
  @Input() city?: string;
  @Input() country?: string;
  @Input() hide = false;
  @Input() storyId?: number = undefined
  @Input() commentId?: number = undefined
  @Input() chatId?: number;
  @Input() fileId?: number;
  @Input() parentClass? = "";
  @Input() attachedTopics: Array<Topic> = [];
  @Input() showTopicSelector: boolean = true;
  @Input() type?: "Social" | "Comment" | "Chat";
  @Input() currentChatUsers?: User[];
  @Input() quoteMessage?: string;
  @Input() enterToPost: boolean = false;
  @Output() contentPosted = new EventEmitter<{ results: any, content: any, originalContent: string }>();
  @Output() selectFileEvent = new EventEmitter<FileEntry[]>();
  @Output() topicClicked = new EventEmitter<Topic[] | undefined>();
  @Output() topicAdded = new EventEmitter<Topic[]>();
  @Output() topicIgnored = new EventEmitter<Topic[]>();

  @ViewChild('mediaSelector') mediaSelector!: MediaSelectorComponent;
  @ViewChild('topicSelector') topicSelector!: TopicsComponent;
  @ViewChild('postInput') postInput!: ElementRef<HTMLInputElement>;
  @ViewChild('postTextArea') postTextArea!: ElementRef<HTMLTextAreaElement>;

  showPostInput = false;
  isTopicsPanelOpen = false;
  eachAttachmentSeperatePost = false;
  isPostOptionsPanelOpen = false;
  ignoredTopics: Topic[] = [];
  favTopics: Topic[] = [];
  attachedFiles: FileEntry[] = [];
  isAppFormattingOptionsOpen = false;
  isComponentPanelOpen = false;
  topTopics: TopicRank[] = [];
  showHelpPopup = false;
  highlightTopicsButton = false;

  ngOnInit() {
    if (this.inputtedParentRef?.user?.id && this.type == "Social") {
      this.topicService.getFavTopics(this.inputtedParentRef.user).then(res => this.favTopics = res);
      this.topicService.getIgnoredTopics(this.inputtedParentRef.user).then(res => this.ignoredTopics = res);
    }
    this.topicService.getTopStoryTopics().then(res => {
      if (res) {
        this.topTopics = res;
      }
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['quoteMessage'] && changes['quoteMessage'].currentValue) {
      const quote = changes['quoteMessage'].currentValue;
      const current = this.textarea?.value || '';
      console.log("quoteMessage changed: ", this.quoteMessage);

      this.textarea.click();

      setTimeout(() => {
        this.textarea.value = quote + current;
        this.textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
        this.textarea.focus();
        setTimeout(() => {
          this.textarea.scrollTop = this.textarea.scrollHeight;
        }, 50);
        this.quoteMessage = undefined;
      }, 100);
    }
  }

  onTopicAdded(event: Topic[] | undefined) {
    this.attachedTopics = event ?? [];
    this.topicAdded.emit(this.attachedTopics);
    this.highlightTopicsButton = this.getButtonHighlightState();
    console.log("topic added");
  }

  onTopicClicked(event: Topic[] | undefined) {
    this.highlightTopicsButton = this.getButtonHighlightState();
    this.attachedTopics = event ?? [];
    this.topicClicked.emit(this.attachedTopics);
    console.log("topic clicked");
  }

  async post() {
    console.log("Posting...");
    const text = this.textarea.value?.trim() || '';
    this.attachedFiles = this.mediaSelector?.selectedFiles ?? [];
    this.attachedTopics = this.topicSelector?.attachedTopics ?? this.attachedTopics;

    if (this.type === 'Social' && !this.profileUser && (!this.attachedTopics || this.attachedTopics.length === 0)) {
      const parent = this.inputtedParentRef ?? this.parentRef;
      parent?.showNotification?.('Please select at least one topic before posting to the feed.');
      this.highlightTopicsButton = true;
      this.isTopicsPanelOpen = true;
      parent?.showOverlay();
      return;
    }

    if (!text && (!this.attachedFiles || this.attachedFiles.length === 0)) {
      alert("Message contents are empty!");
      return;
    }

    this.startLoading();
    try {
      const parent = this.inputtedParentRef ?? this.parentRef;
      const user = parent?.user ?? new User(0, "Anonymous");
      parent?.updateLastSeen();
      const sessionToken = await parent?.getSessionToken();

      // Handle attachments based on eachAttachmentSeperatePost
      const filesToPost = this.eachAttachmentSeperatePost && this.attachedFiles.length > 0
        ? this.attachedFiles.map(file => [file]) // Separate each file into its own array
        : [this.attachedFiles]; // Single array with all files (or empty array if no files)

      // Ensure at least one post is made even if there are no files
      if (filesToPost.length === 0) {
        filesToPost.push([]);
      }

      for (const files of filesToPost) {
        let results = undefined;
        let content = undefined;
        let originalContent = "";

        let derivedIds: { userProfileId?: number, storyId?: number, fileId?: number, commentId?: number } | undefined = undefined;
        if (this.type == "Social") {
          content = await this.createStory(files);
          originalContent = content.originalContent;
          derivedIds = {
            userProfileId: content.story?.profileUserId ?? this.profileUser?.id ?? undefined,
            storyId: this.storyId ?? content.story?.id ?? undefined,
            fileId: this.fileId ?? content.story?.fileId ?? undefined,
            commentId: undefined
          };
          results = await this.socialService.postStory(user.id ?? 0, content.story, sessionToken ?? "");
        } else if (this.type == "Comment") {
          content = await this.createComment(files);
          originalContent = content.originalContent;
          derivedIds = {
            userProfileId: content.comment?.userProfileId ?? this.profileUser?.id ?? undefined,
            storyId: this.storyId ?? content.comment?.storyId ?? undefined,
            fileId: this.fileId ?? content.comment?.fileId ?? undefined,
            commentId: this.commentId ?? content.comment?.commentId ?? undefined
          };
          console.log("type is comment and creating comment", derivedIds);
          results = await this.commentService.addComment(
            content.comment.commentText ?? "",
            user?.id,
            this.fileId ?? content.comment.fileId,
            this.storyId ?? content.comment.storyId,
            this.commentId ?? content.comment.commentId,
            content.comment.userProfileId ?? this.profileUser?.id,
            content.comment.commentFiles,
            content.comment.city,
            content.comment.country,
            content.comment.ip,
          );
        } else if (this.type == "Chat") {
          content = await this.createChatMessage(files);
          originalContent = content.originalContent;
          derivedIds = {};
          results = await this.chatService.sendMessage(user?.id ?? 0, content.chatUsersIdsArray, this.chatId, content.msg, files);
        }

        if (results) {
          const resultData = { results: results, content: content, originalContent: originalContent };
          this.contentPosted.emit(resultData);
          this.createNotifications(resultData, derivedIds);
        } else {
          parent?.showNotification("Error: No response from server.");
        }
      }

      this.clearInputs();
      this.showPostInput = false;
    } catch (error) {
      console.error("Error while posting:", error);
      this.parentRef?.showNotification("An unexpected error occurred.");
    } finally {
      this.stopLoading();
    }
  }

  get textarea(): HTMLTextAreaElement | HTMLInputElement {
    let element: HTMLTextAreaElement | HTMLInputElement | null = null;

    element = this.postTextArea?.nativeElement;
    if (!element) {
      element = this.postInput?.nativeElement;
    }

    if (!element) {
      console.warn('Textarea element not found');
    }

    return element!;
  }
  async createNotifications(results: { results: any, originalContent: string }, ids?: { userProfileId?: number, storyId?: number, fileId?: number, commentId?: number }) {
    const parent = this.inputtedParentRef ?? this.parentRef;
    const user = parent?.user;
    // if component has an explicit storyId, prefer and propagate it into ids so downstream code sees it
    if (this.storyId !== undefined) {
      ids = ids ?? {};
      ids.storyId = this.storyId;
    }
    if (parent && user) {
      const mentionedUsers = (this.type == "Social" || this.type == "Comment") ? await parent.getUsersByUsernames(results.originalContent) || [] : [];
      const mentionedUserIds = (mentionedUsers || []).map(x => x.id).filter((id): id is number => typeof id === 'number' && id > 0);
      const mentionedSet = new Set<number>(mentionedUserIds as number[]);
      const replyingToUser = this.commentParent?.user;
      const { isStory, isFile, isComment } = this.getParentType();
      // prefer component-provided storyId, then ids param, then server result (check PascalCase), then fallbacks
      const storyIdFromResults = (results && (results as any).results) ? ((results as any).results.StoryId ?? (results as any).results.storyId) : undefined;
      const storyIdToUse = this.storyId ?? ids?.storyId ?? storyIdFromResults ?? (isStory ? this.commentParent?.id : undefined);

      if (this.profileUser?.id && this.profileUser.id != user.id && !mentionedSet.has(this.profileUser.id)) {
        const notificationData: any = {
          fromUserId: user.id,
          toUserIds: [this.profileUser.id],
          message: "New post on your profile!",
          userProfileId: ids?.userProfileId ?? this.profileUser.id
        };
        this.notificationService.createNotifications(notificationData);
      }
      if (this.type == "Social" || this.type == "Comment") {
        if (mentionedUsers && mentionedUsers.length > 0) {
          const notificationData: any = {
            fromUserId: user.id,
            toUserIds: mentionedUserIds,
            message: "You were mentioned!",
            userProfileId: ids?.userProfileId ?? undefined,
            storyId: storyIdToUse,
            fileId: ids?.fileId ?? results.results?.fileId ?? (isFile ? this.commentParent?.id : undefined),
            commentId: ids?.commentId ?? results.results?.commentId ?? (isComment ? this.commentParent?.id : undefined),
          };
          this.notificationService.createNotifications(notificationData);
        }
        let notificationMessage = results.results;
        if (results.results.message) {
          notificationMessage = results.results.message;
        }
        parent.showNotification(notificationMessage);
      }
      if (this.type == "Comment") {
        const fromUserId = user?.id ?? 0;
        const toUserIds = [replyingToUser?.id ?? 0].filter(id => id != fromUserId);
        if (replyingToUser?.id && toUserIds.length > 0) {
          const filteredToUserIds = toUserIds.filter(id => !mentionedSet.has(id));
          if (filteredToUserIds.length > 0) {
            let message = results.originalContent.length > 50 ? results.originalContent.slice(0, 50) + "…" : results.originalContent;
            const notificationData = {
              fromUserId: fromUserId,
              toUserIds: filteredToUserIds,
              message: message,
              storyId: storyIdToUse,
              fileId: ids?.fileId ?? results.results?.fileId ?? (isFile ? this.commentParent?.id : undefined),
              commentId: ids?.commentId ?? results.results?.commentId ?? (isComment ? this.commentParent?.id : undefined),
              userProfileId: ids?.userProfileId ?? this.profileUser?.id,
            };
            this.notificationService.createNotifications(notificationData);
          }
        }
        if (isComment) { // send it to everyone else involved in the thread except the user who made the comment, the replyingToUser, and any mentioned users
          try {
            const threadRoot = this.commentParent as FileComment | undefined;
            const participantIds = new Set<number>();

            const collect = (c?: FileComment) => {
              if (!c) return;
              if (c.user?.id) participantIds.add(c.user.id);
              if (c.comments && c.comments.length) {
                for (const sub of c.comments) {
                  collect(sub);
                }
              }
            };
            collect(threadRoot);

            const posterId = user?.id ?? 0;
            if (posterId) participantIds.delete(posterId);
            if (replyingToUser?.id) participantIds.delete(replyingToUser.id);
            for (const m of mentionedSet) participantIds.delete(m);

            const notifyIds = Array.from(participantIds).filter(id => typeof id === 'number' && id > 0);
            if (notifyIds.length > 0) {
              const message = results.originalContent.length > 50 ? results.originalContent.slice(0, 50) + '…' : results.originalContent;
              this.notificationService.createNotifications({
                fromUserId: posterId,
                toUserIds: notifyIds,
                message,
                storyId: storyIdToUse,
                fileId: this.fileId ?? ids?.fileId ?? results.results?.fileId ?? (isFile ? this.commentParent?.id : undefined),
                commentId: this.commentId ?? ids?.commentId ?? results.results?.commentId ?? (isComment ? this.commentParent?.id : undefined),
                userProfileId: ids?.userProfileId ?? this.profileUser?.id,
              });
            }
          } catch (e) {
            console.warn('Failed to notify thread participants:', e);
          }
        }
      }
      if (this.type == "Chat") {
        this.notificationService.createNotifications({
          fromUserId: user?.id ?? 0,
          toUserIds: this.currentChatUsers!.filter(x => x.id != (user?.id ?? 0)).map(x => x.id ?? 0),
          message: 'New chat message!',
          chatId: this.chatId
        });
      }
    }
  }

  clearInputs() {
    this.attachedFiles = [];
    this.attachedTopics = [];
    this.textarea.value = '';
    this.eachAttachmentSeperatePost = false;
    this.mediaSelector.removeAllFiles();
    this.topicSelector?.removeAllTopics();
  }
  showTopicsPanel() {
    const parent = this.inputtedParentRef ?? this.parentRef;
    this.isTopicsPanelOpen = true;
    if (parent) {
      parent.showOverlay();
    }
  }
  closeTopicsPanel() {
    this.isTopicsPanelOpen = false;
    const parent = this.inputtedParentRef ?? this.parentRef;
    parent?.closeOverlay();
  }
  getOptionsCount() {
    let count = 0;
    if (this.eachAttachmentSeperatePost) count++;
    return count;
  }

  showPostOptionsPanel() {
    if (this.isPostOptionsPanelOpen) {
      this.closePostOptionsPanel();
      const parent = this.inputtedParentRef ?? this.parentRef;
      parent?.closeOverlay();
      return;
    }
    this.isPostOptionsPanelOpen = true;

    const parent = this.inputtedParentRef ?? this.parentRef;
    parent?.showOverlay();
  }
  closePostOptionsPanel() {
    this.isPostOptionsPanelOpen = false;
    const parent = this.inputtedParentRef ?? this.parentRef;
    parent?.closeOverlay();
  }
  removeIgnoredTopic(topic: Topic) {
    console.log(topic);
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent?.user?.id) {
      this.topicService.removeIgnoredTopic(parent.user.id, [topic.id]).then(res => {
        if (res) {
          parent.showNotification(res.message);
          if (res.success) {
            this.ignoredTopics = res.remainingIgnoredTopics;
          }
        }
      });
    }
  }

  addFavouriteTopic() {
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent?.user?.id) {
      const topicIds = this.attachedTopics?.map(x => x.id);
      this.topicService.addFavTopic(parent.user.id, topicIds).then(res => {
        if (res) {
          parent.showNotification(res.message);
          if (res.success) {
            this.favTopics = res.allFavoriteTopics;
          }
        }
      });
    }
  }

  selectFile(files: FileEntry[]) {
    if (files) {
      this.attachedFiles = files.flatMap(fileArray => fileArray);
    }
  }

  getNonFavoriteTopics(): Topic[] {
    if (!this.attachedTopics || !this.favTopics) return [];

    return this.attachedTopics.filter(attachedTopic =>
      !this.favTopics.some(favTopic => favTopic.id === attachedTopic.id)
    );
  }
  removeFavTopic(topic: Topic) {
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent?.user?.id) {
      this.topicService.removeFavTopic(parent.user.id, [topic.id]).then(res => {
        if (res) {
          parent.showNotification(res.message);
          if (res.success) {
            this.favTopics = res.remainingFavoriteTopics;
          }
        }
      });
    }
  }
  ignoreTopic(topic: Topic) {
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent?.user?.id) {
      this.topicService.addIgnoredTopic(parent.user.id, [topic.id]).then(res => {
        if (res) {
          parent.showNotification(res.message);
          if (res.success) {
            this.ignoredTopics = res.allIgnoredTopics;
            this.closePostOptionsPanel();
            this.topicIgnored.emit(this.ignoredTopics);
            this.clickedTopic(undefined);
          }
        }
      });
    }
  }

  private getParentType() {
    if (!this.commentParent) {
      return { isStory: false, isFile: false, isComment: false };
    }

    const isStory =
      (this.commentParent as Story).storyText !== undefined ||
      (this.commentParent as Story).storyFiles !== undefined ||
      this.commentParent instanceof Story;

    const isFile =
      (this.commentParent as FileEntry).givenFileName !== undefined ||
      (this.commentParent as FileEntry).fileName !== undefined ||
      this.commentParent instanceof FileEntry;

    const isComment =
      (this.commentParent as FileComment).commentText !== undefined ||
      (this.commentParent as FileComment).commentFiles !== undefined ||
      this.commentParent instanceof FileComment;

    return { isStory, isFile, isComment };
  }

  private async createStory(files?: FileEntry[]): Promise<{ story: Story, originalContent: string }> {
    const parent = this.inputtedParentRef ?? this.parentRef;
    const location = await parent?.getLocation();
    const originalContent = parent?.replaceEmojisInMessage(this.textarea.value?.trim() || '') ?? '';
    return {
      story: {
        id: 0,
        user: parent!.user!,
        storyText: this.encryptContent(originalContent),
        fileId: null,
        date: new Date(),
        upvotes: 0,
        downvotes: 0,
        commentsCount: 0,
        storyComments: undefined,
        metadata: undefined,
        storyFiles: files ?? this.attachedFiles,
        storyTopics: this.attachedTopics,
        profileUserId: this.profileUser?.id,
        city: location?.city,
        country: location?.country,
        ip: location?.ip,
      },
      originalContent: originalContent
    };
  }

  private async createComment(files?: FileEntry[]): Promise<{ comment: FileComment, originalContent: string }> {
    const parent = this.inputtedParentRef ?? this.parentRef;
    const commentsWithEmoji = parent?.replaceEmojisInMessage(this.textarea.value?.trim() || '') || '';
    const { isStory, isFile, isComment } = this.getParentType();

    console.log("Creating comment for:", this.commentParent);
    console.log("Is Story:", isStory, "Is File:", isFile, "Is Comment:", isComment);

    const currentDate = new Date();
    const location = await parent?.getLocation();
    const tmpComment = new FileComment();

    tmpComment.user = parent?.user ?? new User(0, "Anonymous");
    tmpComment.commentText = this.encryptContent(commentsWithEmoji);
    tmpComment.date = currentDate;
    tmpComment.fileId = this.fileId ?? (isFile ? this.commentParent?.id : undefined);
    tmpComment.storyId = this.storyId ?? (isStory ? this.commentParent?.id : undefined);
    tmpComment.commentId = this.commentId ?? (isComment ? this.commentParent?.id : undefined);
    tmpComment.commentFiles = files ?? this.attachedFiles;
    tmpComment.country = location?.country;
    tmpComment.city = location?.city;
    tmpComment.userProfileId = this.profileUser?.id;
    tmpComment.ip = location?.ip;
    return { comment: tmpComment, originalContent: commentsWithEmoji };
  }

  private async createChatMessage(files?: FileEntry[]): Promise<{ msg: string, chatUsersIdsArray: number[], originalContent: string }> {
    const parent = this.inputtedParentRef ?? this.parentRef;
    const user = parent?.user;
    const originalContent = parent?.replaceEmojisInMessage(this.textarea.value?.trim() || '') ?? '';
    const msg = this.encryptContent(originalContent);
    let chatUsersIds = new Set(this.currentChatUsers!.map(u => u.id ?? 0));
    if (user?.id) {
      chatUsersIds.add(user.id);
    }
    const chatUsersIdsArray = [...chatUsersIds];
    return { msg, chatUsersIdsArray, originalContent };
  }


  encryptContent(msg: string) {
    try {
      let id = undefined;
      if (this.type == "Chat") {
        id = this.chatId;
      } else if (this.type == "Comment") {
        id = this.inputtedParentRef?.user?.id ?? 0;
      } else if (this.type == "Social") {
        id = this.inputtedParentRef?.user?.id ?? 0;
      } 
      if (id === undefined) {
        return msg;
      }
      return this.encryptionService.encryptContent(msg, id + "");
    } catch (error) {
      ``
      console.error('Encryption error:', error);
      return msg;
    }
  }
  prepPostTextArea() {
    const savedVal = this.textarea.value;
    this.showPostInput = true;
    setTimeout(() => {
      this.textarea.focus();
      this.textarea.value = savedVal;
    }, 100);
  }
  onKeyDown(event: KeyboardEvent) {
    if (this.enterToPost) {
      if (event.key === 'Enter' && !event.ctrlKey && !event.shiftKey) {
        event.preventDefault();
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          this.post();
        }, 100);
      }
      else if (event.ctrlKey && event.key === 'Enter') {
        event.preventDefault();
        const textarea = this.textarea;
        const start = textarea.selectionStart ?? 0;
        const end = textarea.selectionEnd ?? 0;
        textarea.value =
          textarea.value.substring(0, start) + "\n" + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + 1;
      }
    } else {
      if (event.ctrlKey && event.key === 'Enter') {
        event.preventDefault();
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          this.post();
        }, 100);
      }
    }
    this.hapticFeedback();
  }

  private hapticFeedback() {
    if (this.onMobile() && "vibrate" in navigator) {
      navigator.vibrate(30);
    }
  }

  onExpandingEmojiPanel(event: boolean) {
    this.closePostOptionsPanel();
    this.isAppFormattingOptionsOpen = event;
  }
  onExpandingComponentPanel(event: boolean) {
    this.closePostOptionsPanel();
    this.isComponentPanelOpen = event;
  }
  clickedTopic(event: Topic[] | undefined) {
    this.topicClicked.emit(event);
    this.closeTopicsPanel();
    this.highlightTopicsButton = this.getButtonHighlightState();
  }
  clickedTopicRank(event: TopicRank) {
    this.topicClicked.emit([{ id: event.topicId, topicText: event.topicName } as Topic]);
    this.closeTopicsPanel();
    this.highlightTopicsButton = this.getButtonHighlightState();
  }
  showHelp() {
    this.closePostOptionsPanel();
    const parent = this.inputtedParentRef ?? this.parentRef;
    setTimeout(() => { this.showHelpPopup = true; parent?.showOverlay(); }, 50);
  }
  closeHelp() {
    this.showHelpPopup = false;
    const parent = this.inputtedParentRef ?? this.parentRef;
    parent?.closeOverlay();
  }
  getButtonHighlightState(): boolean {
    return this.type == "Social" && !this.profileUser && !(this.attachedTopics && this.attachedTopics.length > 0);
  }
}
