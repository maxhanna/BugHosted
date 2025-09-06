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
  @Input() parentId? = "";
  @Input() parentClass? = "";
  @Input() attachedTopics: Array<Topic> = [];
  @Input() showTopicSelector: boolean = true;
  @Input() type?: "Social" | "Comment" | "Chat"; 
  @Input() chatId?: number;
  @Input() currentChatUsers?: User[];
  @Input() quoteMessage?: string;
  @Output() contentPosted = new EventEmitter<{results: any, content: any, originalContent: string}>();
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
      if (this.textarea) { 
        this.textarea.value = quote + current;
      }
      this.quoteMessage = undefined;
      setTimeout(() => this.textarea.click(), 100);
    }
  }
  
  async post() {
    console.log("Posting...");
    const text = this.textarea.value?.trim() || '';
    this.attachedFiles = this.mediaSelector?.selectedFiles;
    this.attachedTopics = this.topicSelector?.attachedTopics ?? this.attachedTopics;

    if (!text && (!this.attachedFiles || this.attachedFiles.length === 0)) {
      alert("Message contents are empty!");
      return;
    }

    this.startLoading();
    try { 
      const parent = this.inputtedParentRef ?? this.parentRef;
      const user = parent?.user ?? new User(0, "Anonymous");
      let originalContent = "";
      parent?.updateLastSeen();
      const sessionToken = await parent?.getSessionToken();
      let results = undefined;
      let content = undefined;
      if (this.type == "Social") 
      {
        content = await this.createStory();
        originalContent = content.originalContent;
        results = await this.socialService.postStory(user.id ?? 0, content.story, sessionToken ?? "");
      } 
      else if (this.type == "Comment") 
      {
        console.log("type is comment and creating comment");
        content = await this.createComment();
        originalContent = content.originalContent;
        results = await this.commentService.addComment(
          content.comment.commentText ?? "",
          user?.id,
          content.comment.fileId,
          content.comment.storyId,
          content.comment.commentId,
          content.comment.userProfileId ?? this.profileUser?.id,
          content.comment.commentFiles,
          content.comment.city,
          content.comment.country,
          content.comment.ip,
        );
      } 
      else if (this.type == "Chat") 
      {
        content = await this.createChatMessage();
        originalContent = content.originalContent;
        results = await this.chatService.sendMessage(user?.id ?? 0, content.chatUsersIdsArray, this.chatId, content.msg, this.attachedFiles);
      }

      // const results = this.eachAttachmentSeperatePost
      //   ? await this.postEachFileAsSeparateStory(user, text)
      //   : await this.postSingleStory(user, text);

      if (results) {
        this.clearInputs();
        const resultData = { results: results, content: content, originalContent: originalContent };
        this.contentPosted.emit(resultData);
        this.createNotifications(resultData); 
        this.showPostInput = false;
      } else {
        parent?.showNotification("Error: No response from server.");
      }
    } catch (error) {
      console.error("Error while posting story:", error);
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

    return element;
  }
  async createNotifications(results: { results: any, originalContent: string }) {
    const parent = this.inputtedParentRef ?? this.parentRef;
    const user = parent?.user;
    if (parent && user) {  
      const replyingToUser = this.commentParent?.user; 
      const { isStory, isFile, isComment } = this.getParentType();
      
      if (this.profileUser?.id && this.profileUser.id != user.id) {
        const notificationData: any = {
          fromUserId: user.id,
          toUserIds: [this.profileUser.id],
          message: "New post on your profile!",
          userProfileId: this.profileUser.id
        };
        this.notificationService.createNotifications(notificationData);
      }
      if (this.type == "Social" || this.type == "Comment") {
        const mentionnedUsers = await parent.getUsersByUsernames(results.originalContent);
        if (mentionnedUsers && mentionnedUsers.length > 0) {
          const notificationData: any = {
            fromUserId: user.id,
            toUserIds: mentionnedUsers.map(x => x.id),
            message: "You were mentionned!",
            userProfileId: this.inputtedParentRef?.user?.id,
            storyId: results.results.storyId,
            fileId: isFile ? this.commentParent?.id : undefined,
            commentId: isComment ? this.commentParent?.id : undefined,
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
          let message = results.originalContent.length > 50 ? results.originalContent.slice(0, 50) + "…" : results.originalContent; 
          const notificationData = {
            fromUserId: fromUserId,
            toUserIds: toUserIds,
            message: message,
            storyId: isStory ? this.commentParent?.id : undefined,
            fileId: isFile ? this.commentParent?.id : undefined,
            commentId: isComment ? this.commentParent?.id : undefined,
            userProfileId: this.profileUser?.id,
          };
          this.notificationService.createNotifications(notificationData); 
        }
        if (isComment) {
          //send it to everyone else involved in the thread except the user who made the comment and replyingToUser
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

  private async createComment(): Promise<{comment: FileComment, originalContent: string}> {
    const parent = this.inputtedParentRef ?? this.parentRef;
    const commentsWithEmoji = parent?.replaceEmojisInMessage(this.textarea.value?.trim() || '') || '';

    const { isStory, isFile, isComment } = this.getParentType();

    console.log("Creating comment for:", this.commentParent);
    console.log("Is Story:", isStory, "Is File:", isFile, "Is Comment:", isComment);

    const filesToSend = this.attachedFiles;
    const currentDate = new Date();
    const location = await parent?.getLocation();
    const tmpComment = new FileComment();
    
    tmpComment.user = parent?.user ?? new User(0, "Anonymous");
    tmpComment.commentText = this.encryptContent(commentsWithEmoji);
    tmpComment.date = currentDate;
    tmpComment.fileId = isFile ? this.commentParent?.id : undefined;
    tmpComment.storyId = isStory ? this.commentParent?.id : undefined;
    tmpComment.commentId = isComment ? this.commentParent?.id : undefined;
    tmpComment.commentFiles = filesToSend;
    tmpComment.country = location?.country;
    tmpComment.city = location?.city;
    tmpComment.userProfileId = this.profileUser?.id;
    tmpComment.ip = location?.ip;
    return {comment: tmpComment, originalContent: commentsWithEmoji};
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


  private async createStory(): Promise<{ story: Story, originalContent: string }> {
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
        storyFiles: this.attachedFiles,
        storyTopics: this.attachedTopics,
        profileUserId: this.profileUser?.id,
        city: location?.city,
        country: location?.country,
        ip: location?.ip,
      }, 
      originalContent: originalContent
    };
  }

  async createChatMessage(): Promise<{ msg: string, chatUsersIdsArray: number[], originalContent: string }> {
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
      if (!id) {
        return msg;
      } 
      return this.encryptionService.encryptContent(msg, id + "");
    } catch (error) {``
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
    if (event.ctrlKey && event.key === 'Enter') { // Ctrl + Enter
      event.preventDefault(); // prevent unwanted newline
      this.post();
    }
  }
  onExpandingEmojiPanel(event: boolean) {
    this.closePostOptionsPanel(); 
    this.isAppFormattingOptionsOpen = event;  
  }
  onExpandingComponentPanel(event:boolean) {
    this.closePostOptionsPanel();
    this.isComponentPanelOpen = event; 
  } 
  clickedTopic(event: Topic[] | undefined) {
    console.log(event);
    this.topicClicked.emit(event);
    this.closeTopicsPanel();
  }
  clickedTopicRank(event: TopicRank) {
    this.topicClicked.emit([{ id: event.topicId, topicText: event.topicName } as Topic]);
    this.closeTopicsPanel();
  }
}
