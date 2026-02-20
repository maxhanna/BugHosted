import { Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild, ChangeDetectorRef } from '@angular/core';
import { ChildComponent } from '../child.component';
import { ChatService } from '../../services/chat.service';
import { Message } from '../../services/datacontracts/chat/message';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { User } from '../../services/datacontracts/user/user';
import { AppComponent } from '../app.component';
import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, Messaging } from "firebase/messaging";
import { NotificationService } from '../../services/notification.service';
import { MediaSelectorComponent } from '../media-selector/media-selector.component';
import { UserService } from '../../services/user.service';
import { UserSettings } from '../../services/datacontracts/user/user-settings';
import { EncryptionService } from '../../services/encryption.service';
import { UserTheme } from '../../services/datacontracts/chat/chat-theme';
import { FileService } from '../../services/file.service';

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.css',
  standalone: false
})
export class ChatComponent extends ChildComponent implements OnInit, OnDestroy {
  users: Array<User> = [];
  isPanelExpanded: boolean = true;
  currentChatUsers: User[] | undefined = undefined;
  currentChatId?: number;
  chatHistory: Message[] = [];
  selectedUsers: User[] = []
  isEditing: number[] = [];
  showPostInput = false;
  hasManuallyScrolled = false;
  pageNumber = 1;
  pageSize = 10;
  totalPages = 1;
  totalPagesArray: number[] = [];
  isDisplayingChatMembersPanel = false;
  isMenuPanelOpen = false;
  showUserList = true;
  currentChatTheme: string = '';
  currentChatUserThemeId: number | null = null;
  userThemes: UserTheme[] = [];
  private fileEntryCache: Map<number, FileEntry | null> = new Map();
  // store the page's theme state before entering a chat so we can restore it on exit
  private _preChatThemeClasses: string[] | null = null;
  private _preChatCssVars: { [key: string]: string | null } | null = null;
  app?: any;
  messaging?: any;
  ghostReadEnabled = false;
  notificationsEnabled?: boolean = undefined;
  firstMessageDetails: { content: string } | null = null;
  quoteMessage = "";
  serverDown = false;
  failCount = 0;
  private pollingInterval: any;
  private isChangingPage = false;
  private isInitialLoad = false;
  isLoadingPreviousPage = false;
  private inviewDebounceTimeout: any;

  @ViewChild('newMessage') newMessage!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('newMessageTmpInput') newMessageTmpInput!: ElementRef<HTMLInputElement>;
  @ViewChild('chatWindow') chatWindow!: ElementRef;
  @ViewChild('changePageMenuSelect') changePageMenuSelect!: ElementRef<HTMLSelectElement>;
  @ViewChild(MediaSelectorComponent) attachmentSelector!: MediaSelectorComponent;

  @Input() selectedUser?: User;
  @Input() chatId?: number;
  @Input() inputtedParentRef?: AppComponent;
  @Output() closeChatEvent = new EventEmitter<void>();

  constructor(
    private chatService: ChatService,
    private notificationService: NotificationService,
    private userService: UserService,
    private encryptionService: EncryptionService,
    private fileService: FileService) {
    super();
    if (this.inputtedParentRef) {
      this.parentRef = this.inputtedParentRef;
    }
    this.parentRef?.addResizeListener();
  }

  async ngOnInit() {
    this.startLoading();
    
    if (this.selectedUser) { 
      await this.openChat([this.selectedUser]);
    } else if (this.chatId) {
      const res = await this.chatService.getChatUsersByChatId(this.chatId);
      if (res) {
        this.selectedUsers = res;
        await this.openChat(this.selectedUsers);
      }
    }

    if (this.parentRef?.user) {
      const res = await this.userService.getUserSettings(this.parentRef.user.id ?? 0) as UserSettings | null;
      if (res) {
        this.notificationsEnabled = res.notificationsEnabled;
        if (this.notificationsEnabled == undefined || this.notificationsEnabled) {
          await this.requestNotificationPermission();
        }
      } 
    }
    
    this.userService.getAllThemes().then(themeRes => {
      if (themeRes) { 
        this.userThemes = themeRes;
      }
    });

    this.stopLoading();
  }

  ngOnDestroy() {
    this.parentRef?.removeResizeListener();
    this.currentChatUsers = undefined;
    clearInterval(this.pollingInterval);
    clearInterval(this.inviewDebounceTimeout);
  }

  // Apply a user theme object to the chatArea by setting CSS variables.
  // Supports both camelCase and snake_case property names from server or local records.=
  async applyUserTheme(ut: UserTheme | null) {
    const container = document.querySelector('.chatArea') as HTMLElement | null;
    if (!container) return;

    if (!ut) {
      container.style.removeProperty('--main-background-image-url');
      container.style.removeProperty('--main-bg-color');
      container.style.removeProperty('--component-background-color');
      container.style.removeProperty('--secondary-component-background-color');
      container.style.removeProperty('--main-font-color');
      container.style.removeProperty('--secondary-font-color');
      container.style.removeProperty('--third-font-color');
      container.style.removeProperty('--main-highlight-color');
      container.style.removeProperty('--main-highlight-color-quarter-opacity');
      container.style.removeProperty('--main-link-color');
      container.style.removeProperty('--main-font-family');
      container.style.removeProperty('--main-font-size');
      container.style.backgroundImage = 'none';
      return;
    }
    this.startLoading();

    // Resolve the file entry (if set) using a small in-memory cache to avoid repeated network calls
    const bgImage = ut.backgroundImage;
    let directLink: string | null = null;

    try {
      let tmpBackImage: FileEntry | undefined | null = undefined;
      if (bgImage?.id) {
        const cached = this.fileEntryCache.get(bgImage.id);
        if (cached === undefined) {
          // not cached yet — fetch and cache result (could be null)
          try {
            tmpBackImage = await this.fileService.getFileEntryById(bgImage.id, this.parentRef?.user?.id);
            this.fileEntryCache.set(bgImage.id, tmpBackImage ?? null);
          } catch (e) {
            this.fileEntryCache.set(bgImage.id, null);
            tmpBackImage = undefined;
            console.warn('Failed to fetch file entry for theme background:', e);
          }
        } else {
          tmpBackImage = cached ?? undefined;
        }
      }

      if (tmpBackImage && tmpBackImage.fileName) {
        const base = 'https://bughosted.com';
        const uploadsRoot = 'assets/Uploads';
        const dir = this.parentRef?.getDirectoryName(tmpBackImage);
        const path = this.joinUrl(uploadsRoot, dir && dir !== '.' ? dir : undefined, tmpBackImage.fileName);
        directLink = `${base}/${this.encodePath(path)}`;
      }
    } catch (e) {
      console.warn('Failed to resolve background image:', e);
    }

    // Immediately assign background so browser begins fetching; do not block UI waiting for preload.
    if (directLink) {
      const cssUrl = `url("${directLink}")`;
      // Set CSS var and background immediately.
      requestAnimationFrame(() => {
        container.style.setProperty('--main-background-image-url', cssUrl);
        container.style.backgroundImage = cssUrl;
      });

      // In background, verify the image loads — if it fails and the assigned URL still matches, clear it.
      (async () => {
        try {
          const ok = await new Promise<boolean>((resolve) => {
            const img = new Image();
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
            img.referrerPolicy = 'no-referrer';
            img.src = directLink!;
          });
          // If load failed and the css var still references this link, clear it (don't override newer themes)
          const currentVar = container.style.getPropertyValue('--main-background-image-url');
          if (!ok && currentVar === cssUrl) {
            requestAnimationFrame(() => {
              container.style.setProperty('--main-background-image-url', 'none');
              container.style.backgroundImage = 'none';
            });
          }
        } catch (e) {
          console.warn('Background verification failed:', e);
        }
      })();
    } else {
      requestAnimationFrame(() => {
        container.style.setProperty('--main-background-image-url', 'none');
        container.style.backgroundImage = 'none';
      });
    }

    // Apply other color/font variables
    const {
      backgroundColor: bgColor,
      fontColor,
      secondaryFontColor: secondaryFont,
      thirdFontColor: thirdFont,
      componentBackgroundColor: compBg,
      secondaryComponentBackgroundColor: secCompBg,
      mainHighlightColor: highlight,
      mainHighlightColorQuarterOpacity: highlightQuarter,
      linkColor,
      fontFamily,
      fontSize
    } = ut;

    if (bgColor) container.style.setProperty('--main-bg-color', bgColor);
    if (compBg) container.style.setProperty('--component-background-color', compBg);
    if (secCompBg) container.style.setProperty('--secondary-component-background-color', secCompBg);
    if (fontColor) container.style.setProperty('--main-font-color', fontColor);
    if (secondaryFont) container.style.setProperty('--secondary-font-color', secondaryFont);
    if (thirdFont) container.style.setProperty('--third-font-color', thirdFont);
    if (highlight) container.style.setProperty('--main-highlight-color', highlight);
    if (highlightQuarter) container.style.setProperty('--main-highlight-color-quarter-opacity', highlightQuarter);
    if (linkColor) container.style.setProperty('--main-link-color', linkColor);
    if (fontFamily) container.style.setProperty('--main-font-family', fontFamily);
    if (fontSize) container.style.setProperty('--main-font-size', (typeof fontSize === 'number' ? `${fontSize}px` : fontSize));
  
    this.stopLoading();
  }


  async changeChatUserTheme(event: any) {
    if (!this.currentChatId) return;
    this.startLoading();
    const val = event.target.value;
    const userThemeId = val ? +val : null;
    try {
      const res = await this.chatService.setChatTheme(this.currentChatId, this.currentChatTheme ?? '', userThemeId);
      if (res) {
        // store the selected saved theme id (or null)
        this.currentChatUserThemeId = userThemeId;
        if (userThemeId) {
          // find the theme values and apply CSS vars (support both snake_case and camelCase shapes)
          const ut = this.userThemes.find(u => u.id === userThemeId);
          if (ut) {
            await this.applyUserTheme(ut);
          }
        } else {
          // user cleared saved theme; remove CSS variables and any theme classes
          const container = document.querySelector('.chatArea') as HTMLElement | null;
          if (container) {
            container.style.removeProperty('--main-bg-color');
            container.style.removeProperty('--main-font-color');
            // also remove any theme-* classes
            const classesToRemove = Array.from(container.classList).filter((c: string) => c.startsWith('theme-'));
            for (const c of classesToRemove) container.classList.remove(c);
          }
          this.currentChatTheme = '';
        }
        this.parentRef?.showNotification('Chat saved theme updated.');
      }
    } catch (ex) {
      console.error('Failed to set chat theme userThemeId', ex);
      this.parentRef?.showNotification('Failed to update chat theme.');
    }

    this.stopLoading();
  }


  async pollForMessages() {
    if (this.currentChatUsers) {
      this.pollingInterval = setInterval(async () => {
        if (!this.isComponentInView()) {
          clearInterval(this.pollingInterval);
          return;
        }
        if (this.currentChatUsers) {
          await this.getMessageHistory(this.pageNumber, this.pageSize);
        }
      }, 5000);
    }
  }

  scrollToBottomIfNeeded() {
    if (this.chatWindow) {
      const chatWindow = this.chatWindow.nativeElement;
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (!this.hasManuallyScrolled) {
            chatWindow.scrollTop = chatWindow.scrollHeight;
          }
        }, 0);
      });
    }
  }
  async getMessageHistory(pageNumber?: number, pageSize: number = 10) {
    if (!this.currentChatUsers) return;
    this.startLoading();
    try {
      const user = this.parentRef?.user ? this.parentRef.user : new User(0, "Anonymous");
      if (!this.currentChatUsers.some(x => x.id == user.id)) {
        this.currentChatUsers.push(user);
      }
      const receiverUserIds: number[] = this.currentChatUsers.map(x => x?.id ?? 0);

      const res = await this.chatService.getMessageHistory(
        user.id,
        receiverUserIds,
        this.currentChatId,
        pageNumber,
        pageSize
      );
      this.setServerDown(res);
      if (res && res.status && res.status == "404") {
        if (this.chatHistory.length > 0) {
          this.chatHistory = [];
        }
        this.stopLoading();
        return;
      }
      if (res) {
        let hasChanges = false;
        const newMessages: Message[] = [];
        const updatedChatHistory = [...this.chatHistory];

        res.messages.forEach((incomingMessage: Message) => {
          const existingIndex = updatedChatHistory.findIndex(
            (existingMessage: Message) => existingMessage.id === incomingMessage.id
          );
          if (existingIndex !== -1) {
            // Update only if content or relevant fields differ
            const existing = updatedChatHistory[existingIndex];
            if (
              existing.content !== incomingMessage.content || existing.timestamp !== incomingMessage.timestamp
            ) {
              updatedChatHistory[existingIndex] = { ...incomingMessage };
              hasChanges = true;
            }
          } else {
            newMessages.push({ ...incomingMessage });
            hasChanges = true;
          }
        });

        if (hasChanges) {
          // Append new messages and sort
          this.chatHistory = [...updatedChatHistory, ...newMessages].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
          this.updateSeenStatus(res);
          if (!this.isChangingPage) {
            this.playSoundIfNewMessage(newMessages);
          }
          this.pageNumber = res.currentPage;
          if (!this.currentChatId && res.messages[0]?.chatId) {
            this.currentChatId = res.messages[0].chatId;

            if (this.firstMessageDetails) {
              const encryptedContent = this.encryptContent(this.firstMessageDetails.content);
              if (encryptedContent !== res.messages[0].content) {
                const editRes = await this.chatService.editMessage(
                  res.messages[0].id,
                  user.id,
                  encryptedContent
                ); 
                if (editRes) {
                  this.parentRef?.showNotification(`First message encrypted successfully.`);
                  // Refresh message history to reflect the edited message
                  await this.getMessageHistory(this.pageNumber, this.pageSize);
                } else {
                  this.parentRef?.showNotification(`Failed to encrypt first message.`);
                } 
              }
              // Clear firstMessageDetails after processing
              this.firstMessageDetails = null;
            }
          }
          this.scrollToBottomIfNeeded();
        }
        this.isChangingPage = false;
        setTimeout(() => {
          // After messages load, update any poll results in DOM.
          if (res && res.messages && res.messages.length) {
            for (const m of res.messages as Message[]) {
              try {
                const msgPolls = m.polls;
                if (msgPolls && msgPolls.length) {
                  this.updateChatPollsInDOM(msgPolls);
                }
              } catch (inner) {
                console.warn('Error updating chat polls for message', m.id, inner);
                continue;
              }
            }
          }
          
          this.isInitialLoad = true;
        }, 1000);
      }
    } catch (error) {
      console.error('Error fetching message history:', error);
    }
    this.stopLoading();
  }

  private setServerDown(res: any) {
    if (!res || res == null) {
      this.incrementFailCount();
    }
    else if ((res as any).status && (res as any).status >= 500) {
      this.incrementFailCount();
    }
    else if (res) {
      this.resetFailCount();
    }
  }

  private resetFailCount() {
    this.serverDown = false;
    this.failCount = 0;
  }

  private incrementFailCount() {
    this.failCount++;
    if (this.failCount > 2) {
      this.serverDown = true;
      this.scrollToBottomIfNeeded();
    } else {
      this.serverDown = false;
    }
  }

  private updateSeenStatus(res: any) {
    res.messages.forEach((newMessage: Message) => {
      const existingMessage = this.chatHistory.find((msg: Message) => msg.id === newMessage.id);
      if (existingMessage) {
        existingMessage.seen = newMessage.seen;
      }
    });
  }

  updateChatPollsInDOM(polls: any[]) {
    if (!polls || polls.length === 0) return;
    for (const poll of polls) {
      try {
        if (!poll || !poll.componentId) continue;
        if (!poll.componentId.startsWith('messageText') && !poll.componentId.startsWith('chatMessage')) continue;

        const tgt = document.getElementById(poll.componentId);
        if (!tgt) continue;

        // Build poll container similar to SocialComponent.updatePollsInDOM
        // Ensure the global hidden pollQuestion is set to this poll's question when interacting with this poll
        const safeQuestion = (poll.question || '').toString().replace(/'/g, "");

        // Determine whether the current user has already voted on this poll
        const currentUser = this.inputtedParentRef?.user ?? this.parentRef?.user;
        const currentUserId = currentUser?.id ?? 0;
        const currentUserName = currentUser?.username ?? '';
        let hasCurrentUserVoted = false;
        try {
          if (poll.userVotes && poll.userVotes.length) {
            for (const v of poll.userVotes) {
              if (!v) continue;
              // check multiple possible id/username shapes
              if (v.userId && +v.userId === +currentUserId) { hasCurrentUserVoted = true; break; }
              if (v.UserId && +v.UserId === +currentUserId) { hasCurrentUserVoted = true; break; }
              if (v.id && +v.id === +currentUserId) { hasCurrentUserVoted = true; break; }
              if (v.user && v.user.id && +v.user.id === +currentUserId) { hasCurrentUserVoted = true; break; }
              const uname = (v.username || v.Username || (v.user && v.user.username) || '').toString();
              if (uname && currentUserName && uname.toLowerCase() === currentUserName.toLowerCase()) { hasCurrentUserVoted = true; break; }
            }
          }
        } catch { hasCurrentUserVoted = false; }

        // Delegate all poll rendering to the parent AppComponent to centralize behavior.
        try {
          if (this.parentRef && typeof this.parentRef.renderPollIntoElement === 'function') {
            this.parentRef.renderPollIntoElement(poll.componentId, poll, { includeVoters: true, includeDelete: hasCurrentUserVoted, safeQuestion: safeQuestion });
          } else if (this.parentRef && typeof this.parentRef.buildPollHtmlFromPollObject === 'function') {
            const html = this.parentRef.buildPollHtmlFromPollObject(poll, poll.componentId);
            tgt.innerHTML = html;
          } else {
            // As a last resort, render minimal container (shouldn't happen if AppComponent is present)
            tgt.innerHTML = `<div class="poll-container" data-component-id="${poll.componentId}"><div class="poll-question">${poll.question}</div></div>`;
          }
          continue;
        } catch (e) {
          console.error('Error delegating poll render to parent', e);
          continue;
        }
      } catch (ex) {
        console.warn('Error updating chat poll for', poll.componentId, ex);
        continue;
      }
    }
  }

  onScroll() {
    if (this.chatWindow) {
      const chatWindow = this.chatWindow.nativeElement;
      const isScrolledToBottom = chatWindow.scrollHeight - chatWindow.clientHeight <= chatWindow.scrollTop + 60;
      this.hasManuallyScrolled = !isScrolledToBottom;
    }
  }

  formatTimestamp(timestamp: Date) {
    const parent = this.inputtedParentRef ?? this.parentRef;
    return parent?.formatTimestamp(timestamp)
  }

  isComponentInView(): boolean {
    return this.parentRef!.componentsReferences.filter(x => x.componentType == ChatComponent).length > 0;
  }

  togglePanel() {
    this.isPanelExpanded = !this.isPanelExpanded;
  }

  async changePage(event: any) {
    this.pageNumber = +event.target.value;
    this.chatHistory = [];
    this.isChangingPage = true;
    this.closeMenuPanel();
    await this.getMessageHistory(this.pageNumber, this.pageSize);
  }
  async openChat(users?: User[]) {
    if (!users) { return; }
    // capture existing theme state so we can restore it when leaving the chat
    try {
      const container = document.querySelector('.chatArea') as HTMLElement | null;
      if (container) {
        this._preChatThemeClasses = Array.from(container.classList).filter((c: string) => c.startsWith('theme-'));
        // capture known CSS variables used by ThemesComponent
        this._preChatCssVars = {
          '--main-background-image-url': container.style.getPropertyValue('--main-background-image-url') || null,
          '--main-bg-color': container.style.getPropertyValue('--main-bg-color') || null,
          '--component-background-color': container.style.getPropertyValue('--component-background-color') || null,
          '--secondary-component-background-color': container.style.getPropertyValue('--secondary-component-background-color') || null,
          '--main-font-color': container.style.getPropertyValue('--main-font-color') || null,
          '--secondary-font-color': container.style.getPropertyValue('--secondary-font-color') || null,
          '--third-font-color': container.style.getPropertyValue('--third-font-color') || null,
          '--main-highlight-color': container.style.getPropertyValue('--main-highlight-color') || null,
          '--main-highlight-color-quarter-opacity': container.style.getPropertyValue('--main-highlight-color-quarter-opacity') || null,
          '--main-link-color': container.style.getPropertyValue('--main-link-color') || null,
          '--main-font-family': container.style.getPropertyValue('--main-font-family') || null,
          '--main-font-size': container.style.getPropertyValue('--main-font-size') || null
        };
      } else {
        this._preChatThemeClasses = null;
        this._preChatCssVars = null;
      }
    } catch (e) {
      this._preChatThemeClasses = null;
      this._preChatCssVars = null;
    }
    setTimeout(() => {
      const parent = this.parentRef ?? this.inputtedParentRef;
      parent?.addResizeListener();
      parent?.updateLastSeen();
    }, 50);

    this.startLoading();
    this.isPanelExpanded = true;
    this.showUserList = false;
    this.chatHistory = [];
    this.currentChatId = undefined;
    this.isInitialLoad = false;
    users = this.filterUniqueUsers(users);
    const user = this.getChatUsers(users);
    if (!this.currentChatUsers) {
      this.stopLoading();
      return;
    }
    const receiverUserIds: number[] = this.currentChatUsers.map(x => x?.id ?? 0);

    // If we already know the chat id, start fetching its theme in parallel.
    let themePromise: Promise<any> | null = null;
    if (this.currentChatId) {
      themePromise = this.chatService.getChatTheme(this.currentChatId);
    }

    const res = await this.chatService.getMessageHistory(user.id, receiverUserIds, undefined, undefined, this.pageSize);

    if (res && res.status && res.status == "404") {
      this.chatHistory = [];
      this.togglePanel();
      this.stopLoading();
      return;
    }

    if (res && res.messages) {
      this.chatHistory = (res.messages as Message[]).reverse();
      this.pageNumber = res.currentPage;
      this.totalPages = res.totalPages;
      this.totalPagesArray = Array(this.totalPages).fill(0).map((_, i) => i + 1);
      const message0 = (res.messages[0] as Message);

      if (!this.currentChatId && message0.chatId) {
        this.currentChatId = message0.chatId;
      }
    }

    setTimeout(() => {
      this.scrollToBottomIfNeeded();
      this.pollForMessages();
      // If server returned polls with this initial openChat response, inject them per-message (message.Polls)
      try {
        if (res && res.messages && res.messages.length) {
          for (const m of res.messages) {
            try {
              const msgPolls = (m && (m.Polls || m.polls)) ? (m.Polls || m.polls) : null;
              if (msgPolls && msgPolls.length) {
                this.updateChatPollsInDOM(msgPolls);
              }
            } catch { continue; }
          }
        }
      } catch { }
      this.isInitialLoad = true;
    }, 410);
    this.togglePanel();

    // Handle theme result without blocking message load. If we started a themePromise above, use it.
    const handleTheme = (themeRes: any) => {
      if (!themeRes) return;
      if (themeRes.userTheme) {
        this.currentChatUserThemeId = themeRes.userTheme.id;
        // fire-and-forget: apply theme asynchronously so messages/UI aren't blocked
        this.applyUserTheme(themeRes.userTheme).catch(e => console.warn('applyUserTheme failed', e));
        this.currentChatTheme = '';
      } else {
        this.currentChatTheme = '';
        this.applyChatTheme('');
      }
    };

    if (themePromise) {
      themePromise.then(handleTheme).catch(e => console.warn('getChatTheme failed', e));
    } else if (this.currentChatId) {
      // currentChatId may have been set by the messages we just fetched
      this.chatService.getChatTheme(this.currentChatId).then(handleTheme).catch(e => console.warn('getChatTheme failed', e));
    }

    this.stopLoading();
  }

  private getChatUsers(users: User[]) {
    const user = this.parentRef?.user ? this.parentRef.user : new User(0, "Anonymous");
    this.currentChatUsers = users;
    if (!this.currentChatUsers.some(x => x.id == user.id)) {
      this.currentChatUsers.push(user);
    }
    this.currentChatUsers = this.filterUniqueUsers(this.currentChatUsers);
    return user;
  }

  closeChat() {
    this.startLoading();
    this.closeChatEvent.emit();
    this.hasManuallyScrolled = false;
    this.currentChatUsers = undefined;
    this.chatHistory = [];
    this.pageNumber = 0;
    this.totalPages = 0;
    this.totalPagesArray = new Array<number>();
    clearInterval(this.pollingInterval);
    this.showUserList = true;
    this.firstMessageDetails = null;
    this.isPanelExpanded = true;

    // restore the theme that was active before entering the chat
    try {
      const container = document.querySelector('.chatArea') as HTMLElement | null;
      if (container) {
        // remove any theme-* classes applied while in chat
        const classesToRemove = Array.from(container.classList).filter((c: string) => c.startsWith('theme-'));
        for (const c of classesToRemove) {
          container.classList.remove(c);
        }
        // restore pre-chat classes
        if (this._preChatThemeClasses && this._preChatThemeClasses.length) {
          for (const c of this._preChatThemeClasses) {
            container.classList.add(c);
          }
        }
        // restore CSS vars
        if (this._preChatCssVars) {
          for (const preChatCSSKey of Object.keys(this._preChatCssVars)) {
            const preChatCSSVal = this._preChatCssVars[preChatCSSKey as keyof typeof this._preChatCssVars];
            if (!preChatCSSVal) {
              container.style.removeProperty(preChatCSSKey);
            } else {
              container.style.setProperty(preChatCSSKey, preChatCSSVal as string);
            }
          }
        }
      }
    } catch (e) {
      console.warn('Failed to restore pre-chat theme state:', e);
    }
    this.parentRef?.closeOverlay();
    this.stopLoading();
  }

  async loadPreviousPage() {
    if (!this.isInitialLoad || this.isLoadingPreviousPage || this.pageNumber >= this.totalPages) {
      return; // Prevent loading during initial load, while already loading, or if no more pages
    }
    this.startLoading();

    // Debounce to prevent rapid triggers
    if (this.inviewDebounceTimeout) {
      clearTimeout(this.inviewDebounceTimeout);
    }

    this.inviewDebounceTimeout = setTimeout(async () => {
      this.isLoadingPreviousPage = true;
      const currentScrollHeight = this.chatWindow.nativeElement.scrollHeight;
      const currentScrollTop = this.chatWindow.nativeElement.scrollTop;

      try {
        const previousPage = this.pageNumber + 1; // Load the next page (older messages)
        const res = await this.chatService.getMessageHistory(
          this.parentRef?.user?.id ?? 0,
          this.currentChatUsers!.map(x => x?.id ?? 0),
          this.currentChatId,
          previousPage,
          this.pageSize
        );

        if (res && res.messages) {
          const newMessages = (res.messages as Message[]).reverse();
          this.chatHistory = [...newMessages, ...this.chatHistory]; // Prepend new messages
          this.pageNumber = res.currentPage;
          this.totalPages = res.totalPages;
          this.totalPagesArray = Array(this.totalPages).fill(0).map((_, i) => i + 1);

          // Adjust scroll position to keep the same messages in view
          requestAnimationFrame(() => {
            const newScrollHeight = this.chatWindow.nativeElement.scrollHeight;
            this.chatWindow.nativeElement.scrollTop = currentScrollTop + (newScrollHeight - currentScrollHeight);
          });
        }
      } catch (error) {
        console.error('Error loading previous page:', error);
      } finally {
        this.isLoadingPreviousPage = false;
        this.stopLoading();
      }
    }, 200); // 200ms debounce
  }

  userSelectClickEvent(users: User[] | undefined) {
    if (!users) this.selectedUsers = [];
    else this.selectedUsers = users;
  }
  groupChatEvent(users: User[] | undefined) {
    if (!users) {
      this.selectedUsers = [];
      return;
    }
    else this.selectedUsers = users;
    this.openGroupChat();
  }
  singleUserSelected(user?: User) {
    if (!user) return;
    this.openChat([user]);
  }

  async openGroupChat() {
    if (!this.selectedUsers || this.selectedUsers.length == 0) { return alert("You must select more than one user."); }
    this.openChat(this.selectedUsers);
  }
  getCommaSeperatedGroupChatUserNames() {
    if (this.currentChatUsers) {
      return this.chatService.getCommaSeparatedGroupChatUserNames(this.currentChatUsers, this.parentRef?.user);
    }
    else return "";
  }
  getChatUsersWithoutCurrentUser() {
    const parent = this.parentRef ?? this.inputtedParentRef;
    return this.currentChatUsers?.filter(x => x.id != (parent?.user?.id ?? 0));
  }

  displayChatMembers() {
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent) {
      parent.closeOverlay();
      setTimeout(() => {
        this.isDisplayingChatMembersPanel = true;
        parent.showOverlay();
      }, 10);
    }
  }
  closeChatMembersPanel() {
    this.isDisplayingChatMembersPanel = false;
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent) {
      parent.closeOverlay();
    }
  }
  addChatMember(users?: User[]) {
    if (!users) return;
    if (users.some(user => this.currentChatUsers?.some(z => z.id === user.id))) {
      alert("Duplicate users found. Aborting.");
      return;
    }
    this.selectedUsers = this.selectedUsers.concat(users);
    this.selectedUsers = this.filterUniqueUsers(this.selectedUsers);
    this.openGroupChat();
  }
  safeStringify(obj: any) {
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) {
          return "[Circular]";
        }
        seen.add(value);
      }
      return value;
    });
  }

  encryptContent(msg: string) {
    try {
      return this.encryptionService.encryptContent(msg, this.currentChatId ? this.currentChatId + "" : undefined);
    } catch (error) {
      console.error('Encryption error:', error);
      return msg;
    }
  }

  decryptContent(encryptedContent: string) {
    try {
      return this.encryptionService.decryptContent(encryptedContent, this.currentChatId ? this.currentChatId + "" : undefined);
    } catch (error) {
      console.error('Decryption error:', error);
      return encryptedContent;
    }
  }

  async requestNotificationPermission() {
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (!parent?.user || !parent.user.id) {
      return;
    }
    try {
      const firebaseConfig = {
        apiKey: "AIzaSyAR5AbDVyw2RmW4MCLL2aLVa2NLmf3W-Xc",
        authDomain: "bughosted.firebaseapp.com",
        projectId: "bughosted",
        storageBucket: "bughosted.firebasestorage.app",
        messagingSenderId: "288598058428",
        appId: "1:288598058428:web:a4605e4d8eea73eac137b9",
        measurementId: "G-MPRXZ6WVE9"
      };
      this.app = initializeApp(firebaseConfig);
      this.messaging = await getMessaging(this.app);
      if (this.notificationsEnabled == undefined) {
        if (Notification.permission === 'default') {
          const permission = await Notification.requestPermission();
          if (permission === "granted") {
            const token = await getToken(this.messaging, { vapidKey: "BOdqEEb-xWiCvKqILbKr92U6ETC3O0SmpbpAtulpvEqNMMRq79_0JidqqPgrzOLDo_ZnW3Xh7PNMwzP9uBQSCyA" });
            await this.subscribeToNotificationTopic(token);
            this.userService.updateNotificationsEnabled(parent.user.id, true);
          } else {
            //console.log('User declined notification permission');
            this.userService.updateNotificationsEnabled(parent.user.id, false);
          }
        } else if (Notification.permission === 'granted') {
          const token = await getToken(this.messaging, { vapidKey: "BOdqEEb-xWiCvKqILbKr92U6ETC3O0SmpbpAtulpvEqNMMRq79_0JidqqPgrzOLDo_ZnW3Xh7PNMwzP9uBQSCyA" });
          await this.subscribeToNotificationTopic(token);
          this.userService.updateNotificationsEnabled(parent.user.id, true);
        } else {
          //console.log('User denied notification permission');
          this.userService.updateNotificationsEnabled(parent.user.id, false);
        }
      } else {
        //console.log("User has already enabled or disabled notifications.");
      }
    } catch (error) {
      console.log('Error requesting notification permission:', error);
    }
  }

  getTextForDOM(text?: string, componentId?: any) {
    const parent = this.inputtedParentRef ?? this.parentRef;
    return parent?.getTextForDOM(text, componentId);
  }

  filterUniqueUsers(users: User[]): User[] {
    return users.filter((user, index, self) =>
      index === self.findIndex(u => (u.id === user.id || u.username === user.username))
    );
  }

  quote(message: Message) {
    this.quoteMessage = `[Quoting {${message.sender.username}|${message.sender.id}|${message.timestamp}}: ${this.decryptContent(message.content)}] \n`;
    setTimeout(() => {
      if (this.newMessage && this.newMessage.nativeElement) {
        const input = this.newMessage.nativeElement;
        input.focus();
        const length = input.value.length;
        input.setSelectionRange(length, length);
        input.scrollTop = input.scrollHeight;
      }
    }, 50);
  }

  showMenuPanel() {
    if (this.isMenuPanelOpen) {
      this.closeMenuPanel();
      return;
    }
    setTimeout(() => {
      if (this.changePageMenuSelect && this.changePageMenuSelect.nativeElement) {
        this.changePageMenuSelect.nativeElement.value = this.pageNumber.toString();
      }
    }, 50);

    this.isMenuPanelOpen = true;
    const parent = this.inputtedParentRef ?? this.parentRef;
    parent?.showOverlay();
  }
  closeMenuPanel() {
    this.isMenuPanelOpen = false;
    const parent = this.inputtedParentRef ?? this.parentRef;
    parent?.closeOverlay();
  }



  applyChatTheme(themeClass: string) {
    try {
      // apply a class to the chat container element to scope the theme
      const container = document.querySelector('.chatArea');
      if (!container) return;
      // remove previous theme classes (any class beginning with 'theme-')
      const classesToRemove = Array.from(container.classList).filter((c: string) => c.startsWith('theme-'));
      for (const c of classesToRemove) {
        container.classList.remove(c);
      }
      if (themeClass) container.classList.add(themeClass);
    } catch (ex) {
      // ignore
    }
  }
  async enableGhostRead() {
    const parent = this.inputtedParentRef ?? this.parentRef;
    const user = parent?.user;
    if (!user || !user.id) return alert("You must be logged in to enable Ghost Read.");
    this.userService.updateGhostRead(user.id, !this.ghostReadEnabled).then(res => {
      if (res) {
        parent.showNotification(res);
        this.ghostReadEnabled = !this.ghostReadEnabled;
      }
    });
  }
  getUtcTimestampString(date?: Date) {
    if (!date) return "";
    const parent = this.inputtedParentRef ?? this.parentRef;
    return parent?.convertUtcToLocalTime(date) ?? date;
  }
  private async subscribeToNotificationTopic(token: string) {
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent?.user?.id) {
      this.notificationService.subscribeToTopic(parent.user.id, token, "notification" + parent.user.id);
    }
  }
  getChatUsersWithoutSelf() {
    const user = this.inputtedParentRef?.user ?? this.parentRef?.user;
    return this.currentChatUsers?.filter(x => x.id != user?.id);
  }
  async edit(message: Message) {
    if (!this.isEditing.some(id => id === message.id)) {
      this.isEditing.push(message.id);
    }
  }
  async stopEdit(message: Message) {
    if (this.isEditing.some(id => id === message.id)) {
      this.isEditing = this.isEditing.filter(x => x != message.id);
    }
  }
  async acceptEdit(message: Message) {
    if (this.isEditing.some(id => id === message.id)) {
      this.isEditing = this.isEditing.filter(x => x != message.id);
    }
    // Attempt to read legacy textarea if present (backwards compatibility). If not, instruct user to use the editor's Update button.
    const textarea = document.getElementById(`editTextArea${message.id}`) as HTMLTextAreaElement | null;
    if (!textarea) {
      this.parentRef?.showNotification('Please use the editor Update button to save changes.');
      return;
    }
    const tmpMessage = this.encryptContent(textarea.value.trim());
    if (tmpMessage == message.content) {
      return;
    }
    this.chatService.editMessage(message.id, this.parentRef?.user?.id, tmpMessage).then(res => {
      if (res) {
        this.parentRef?.showNotification(`Message #${message.id} edited successfully.`);
        this.getMessageHistory();
      } else {
        this.parentRef?.showNotification(`Failed to edit message #${message.id}.`);
      }
    });
  }

  // Handler for app-text-input contentUpdated event for chat edits
  async onChatUpdated(event: { results: any, content: any, originalContent: string }, message: Message) {
    try {
      if (event && event.results) {
        this.parentRef?.showNotification(`Message #${message.id} edited successfully.`);
        // Prefer a full message object returned by the server if available
        let updatedMsg: any = null;

        updatedMsg = event.results.message || event.results.Message || event.results.updatedMessage || event.results;


        let decryptedText: string | undefined = undefined;
        if (updatedMsg && updatedMsg.content) {
          message.content = updatedMsg.content;
          decryptedText = event.originalContent ?? this.decryptContent(updatedMsg.content);
        } else if (event.content && event.content.chatText) {
          // fallback: editor provided encrypted chatText
          message.content = event.content.chatText;
          decryptedText = event.originalContent ?? this.decryptContent(event.content.chatText);
        } else {
          // last resort: use originalContent
          decryptedText = event.originalContent;
        }

        // set both transient and convenient decrypted properties on message so templates can use either
        message.decrypted = decryptedText;
        // mark message as edited now
        message.editDate = new Date();
        // clear edit state for this message
        this.isEditing = this.isEditing.filter(x => x != message.id);
      } else {
        this.parentRef?.showNotification(`Failed to edit message #${message.id}.`);
      }
    } catch (err) {
      console.error('onChatUpdated error', err);
    }
  }
  async leaveChat(chatId: number) {
    if (!this.parentRef?.user?.id) { return alert("Must be logged in."); }
    if (!confirm("Warning: This chat will be archived and only reappear if you get a new message. Proceed?")) { return; }
    this.chatService.leaveChat(this.parentRef.user.id, chatId).then(res => {
      if (res) {
        this.parentRef?.showNotification(`You've left chat#${chatId}.`);
        this.closeChat();
      }
    });
  }
  openPostInputPopup() {
    const msg = this.newMessageTmpInput.nativeElement.value;
    this.showPostInput = true;
    this.parentRef?.showOverlay();
    setTimeout(() => {
      this.newMessage.nativeElement.value = msg;
      this.newMessage.nativeElement.focus();
    }, 50);
  }
  closePostInputPopup() {
    console.log("closing post input popup");
    const msg = this.newMessage.nativeElement.value;
    this.showPostInput = false;
    this.parentRef?.closeOverlay();
    setTimeout(() => {
      this.newMessageTmpInput.nativeElement.value = msg;
    }, 50);
  }

  async chatMessagePosted(event: { results: any, originalContent: string }) {
    // If we just sent a message and there's no chatId yet, stash the original content so
    // when the server returns the created message (with chatId) we can encrypt it and
    // call editMessage to replace the plaintext with the encrypted version.
    if (!this.currentChatId && event?.originalContent) {
      this.firstMessageDetails = { content: event.originalContent };
    }

    await this.getMessageHistory().then(x => {
      setTimeout(() => {
        this.chatWindow.nativeElement.scrollTop = this.chatWindow.nativeElement.scrollHeight;
      }, 250);
    });
  }
  private playSoundIfNewMessage(newMessages: Message[]) {
    const user = this.inputtedParentRef?.user ?? this.parentRef?.user ?? new User(0, "Anonymous");
    const receivedNewMessages = newMessages.length > 0 && newMessages.some(x => x.sender.id != user.id);

    if (receivedNewMessages) {
      console.log("playing sound!", new Date());
      const notificationSound = new Audio("https://bughosted.com/assets/Uploads/Users/Max/arcade-ui-30-229499.mp4");
      try {
        notificationSound.volume = 0.3;
        notificationSound.play()
      } catch (e) { console.error("Error playing notification sound:", e) }
    }
  }

  private joinUrl(...parts: (string | undefined | null)[]): string {
    const cleaned = parts
      .filter((p): p is string => !!p)
      .map(p => p.replace(/(^\/+|\/+$)/g, '')); // trim leading/trailing slashes
    return cleaned.join('/');
  }

  private encodePath(path: string): string {
    // Encode each segment separately to keep slashes intact
    return path.split('/').map(s => encodeURIComponent(s)).join('/');
  }
}