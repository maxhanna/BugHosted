import { AfterViewInit, ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { ChildComponent } from '../child.component';
import { UserEvent } from '../../services/datacontracts/user-event/user-event';
import { UserEventService } from '../../services/user-event.service';
import { AppComponent } from '../app.component';
import { CommentService } from '../../services/comment.service';

@Component({
  selector: 'app-user-events',
  templateUrl: './user-events.component.html',
  styleUrl: './user-events.component.css',
  standalone: false
})
export class UserEventsComponent extends ChildComponent implements OnInit, OnDestroy, AfterViewInit {
  events: UserEvent[] = [];
  loadError: string | null = null;
  @Input() inputtedParentRef?: AppComponent;
  @Input() showTitleBar = true;
  @Output() hasData = new EventEmitter<boolean>();
  loading = false;
  commentLoading = false;
  private pollingInterval: any;
  isMenuPanelOpen = false;
  eventTypes: string[] = [];
  eventToggles: { [key: string]: boolean } = {};
  eventTypeDescriptions: { [key: string]: string } = {};
  excludeSelf = false;
  // Pagination properties
  totalEvents = 0;
  pageSize = 10;
  currentPage = 1;
  hasMoreEvents = false;

  constructor(private userEventService: UserEventService, private commentService: CommentService, private cdr: ChangeDetectorRef) { super(); }

  async ngOnInit() {
    if (this.inputtedParentRef) {
      this.parentRef = this.inputtedParentRef;
    }
    this.excludeSelf = localStorage.getItem('userEventsExcludeSelf') === 'true';
    await this.loadEventToggles();
    await this.loadEvents();
    this.pollingInterval = setInterval(async () => {
      await this.loadEvents();
    }, 30000);
  }
  ngAfterViewInit() { }
  ngOnDestroy(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    this.remove_me("UserEventsComponent");
  }
  safeDestroy() {
    this.ngOnDestroy();
  }

  private getEnabledEventTypes(): string[] {
    return this.eventTypes.filter(et => this.eventToggles[et] !== false);
  }

  private getEventData(eventType: string): { icon: string; description: string } {
    const icon = this.getEventIcon(eventType);
    const description = this.getEventDescription(eventType);
    return { icon, description };
  }

  async loadEvents() {
    this.loadError = null;
    this.loading = true;
    try {
      const enabledTypes = this.getEnabledEventTypes();
      // Exclude self in SQL (not client-side) so pagination stays correct even
      // when the user's own activity fills an entire page.
      const excludeUserId = this.excludeSelf ? this.parentRef?.user?.id : undefined;
      const result = await this.userEventService.getUserEvents(this.pageSize, 0, enabledTypes, excludeUserId);
      this.events = result.events;
      this.totalEvents = result.totalCount;
      this.hasMoreEvents = this.events.length < this.totalEvents;
    } catch (e) {
      console.error('Failed to load user events', e);
      this.events = [];
      this.loadError = 'Failed to load events.';
    } finally {
      this.loading = false;
      try { this.hasData.emit((this.events?.length ?? 0) > 0); } catch { }
    }
  }

  async loadMoreEvents() {
    this.loading = true;
    try {
      const offset = this.events.length;
      const enabledTypes = this.getEnabledEventTypes();
      const excludeUserId = this.excludeSelf ? this.parentRef?.user?.id : undefined;
      const result = await this.userEventService.getUserEvents(this.pageSize, offset, enabledTypes, excludeUserId);
      this.events = [...this.events, ...result.events];
      this.totalEvents = result.totalCount;
      this.hasMoreEvents = this.events.length < this.totalEvents;
    } catch (e) {
      console.error('Failed to load more user events', e);
      this.loadError = 'Failed to load more events.';
    } finally {
      this.loading = false;
    }
  }

  private resolveReactionEmoji(reactionType: string): string | undefined {
    if (!this.parentRef?.emojiMap) return undefined;
    const map = this.parentRef.emojiMap;
    // Already has colons (e.g. :thumbsup:) — use directly
    if (reactionType.startsWith(':') && reactionType.endsWith(':') && map[reactionType]) return map[reactionType];
    // Bare key in map (e.g. <3)
    if (map[reactionType]) return map[reactionType];
    // Bare word — try wrapping in colons (e.g. heart_heart → :heart_heart:)
    const wrapped = ':' + reactionType + ':';
    return map[wrapped];
  }

  getEvent(eventType: string): { icon: string; description: string; component: string | null } {
    const type = eventType.toLowerCase();

    let tmpIcon = undefined;
    const isReaction = type.includes(" reaction");
    if (isReaction) {
      let tmpReactionType = type.split(' ')[0];
      if (tmpReactionType && tmpReactionType != "reaction") {
        tmpReactionType = tmpReactionType.toLowerCase();
        tmpIcon = this.resolveReactionEmoji(tmpReactionType);
      }
    }

    const navIcon = (title: string, fallback: string) =>
      this.parentRef?.navigationItems.find(x => x.title === title)?.icon || fallback;

    const map: Record<string, { icon: string; description: string; component: string | null }> = {
      file_upload: { icon: navIcon('Files', '📁'), description: 'File uploaded', component: 'Files' },
      upload_file: { icon: navIcon('Files', '📁'), description: 'File uploaded', component: 'Files' },
      story_post: { icon: navIcon('Social', '🌍'), description: 'Story posted', component: 'Social' },
      grandtheft: { icon: navIcon('GrandTheft', '🚔'), description: 'Grand Theft Play', component: 'GrandTheft' },
      comment: { icon: '💬', description: 'Comment added', component: null },
      bones_kill: { icon: navIcon('Bones', '⚔️'), description: 'Bones kill', component: 'Bones' },
      bones_death: { icon: navIcon('Bones', '💀'), description: 'Bones death', component: 'Bones' },
      ender_kill: { icon: navIcon('Ender', '🏍️'), description: 'Ender kill', component: 'Ender' },
      ender_death: { icon: navIcon('Ender', '💥'), description: 'Ender death', component: 'Ender' },
      digcraft_play: { icon: navIcon('DigCraft', '⛏️'), description: 'DigCraft play', component: 'DigCraft' },
      digcraft_death: { icon: navIcon('DigCraft', '⛏️'), description: 'DigCraft death', component: 'DigCraft' },
      digcraft_kill: { icon: navIcon('DigCraft', '⛏️'), description: 'DigCraft kill', component: 'DigCraft' },
      emulator_play: { icon: navIcon('Emulator', '🎮'), description: 'Emulator play', component: 'Emulator' },
      nexus_play: { icon: navIcon('Bug-Wars', '🐛'), description: 'Bug-Wars play', component: 'Bug-Wars' },
      meta_encounter: { icon: navIcon('Meta-Bots', '🤖'), description: 'Meta encounter', component: 'Meta-Bots' },
      daily_meme: { icon: navIcon('Memes', '😂'), description: 'Daily meme', component: null },
      favourite_add: { icon: '⭐', description: 'Favourite added', component: null },
      digcraft_levelup: { icon: navIcon('DigCraft', '⬆️'), description: 'DigCraft level up', component: 'DigCraft' },
      trade_executed: { icon: navIcon('Crypto-Hub', '₿'), description: 'Trade executed', component: 'Crypto-Hub' },
      trophy: { icon: '🏆', description: 'Trophy earned', component: null },
      reaction_added: { icon: tmpIcon || '😊', description: 'Reaction added', component: null },
      wordler_win: { icon: navIcon('Wordler', '🧠'), description: 'Wordler win', component: 'Wordler' },
      youtube: { icon: navIcon('YouTube', '📺'), description: 'YouTube watch', component: 'YouTube' },
      link: { icon: '🔗', description: 'Link shared', component: null },
      flighttracking: { icon: '✈️', description: 'Flight tracked', component: null },
      weaver_card_added: { icon: navIcon('Weaver', '🕷️'), description: 'Weaver card added', component: 'Weaver' },
      weaver_card_created: { icon: navIcon('Weaver', '🕷️'), description: 'Weaver card created', component: 'Weaver' },
      recipe_edited: { icon: navIcon('Recipe', '🍳'), description: 'Recipe edited', component: 'Recipe' },
      recipe_added: { icon: navIcon('Recipe', '🍳'), description: 'Recipe added', component: 'Recipe' },
      racing: { icon: navIcon('Racing', '🏎️'), description: 'Racing event', component: 'Racing' },
      marbles: { icon: navIcon('Marbles', '🌀'), description: 'Marbles event', component: 'Marbles' },
      save_note: { icon: navIcon('Notepad', '🗒️'), description: 'Note saved', component: 'Notepad' },
      downloaded_painting: { icon: navIcon('Paint', '🖍️'), description: 'Painting downloaded', component: 'Paint' },
      plant_added: { icon: navIcon('Planter', '🌱'), description: 'Plant Identified', component: 'Planter' },
      todo_added: { icon: navIcon('Todo', '✔️'), description: 'Todo Added', component: 'Todo' },
      todo_deleted: { icon: navIcon('Todo', '✔️'), description: 'Todo Deleted', component: 'Todo' },
    };

    return map[type] || { icon: '📌', description: eventType, component: null };
  }


  getEventIcon(eventType: string): string {
    return this.getEvent(eventType).icon;
  }

  getEventDescription(eventType: string): string {
    return this.getEvent(eventType).description;
  }

  viewEvent(e: UserEvent) {
    if (e.referenceId == null) return;
    const eData = this.getEvent(e.eventType);

    if (e.eventType.includes('posted')) {
      this.parentRef?.createComponent('Social', { 'storyId': e.referenceId });
    }
    else if (e.eventType === 'story_post') {
      this.parentRef?.createComponent('Social', { 'storyId': e.referenceId });
    }
    else if (e.eventType === 'comment') {
      this.viewComment(e);
    }
    else if (e.eventType === 'upload') {
      this.parentRef?.createComponent('Files', { 'FileId': e.referenceId });
    }
    else if (e.eventType === 'trophy') {
      this.parentRef?.createComponent('User', { 'UserId': e.referenceId });
    }
    else if (e.eventType === 'save_note') {
      this.parentRef?.createComponent('Notepad', { 'noteId': e.referenceId });
    }
    else if (eData.component) {
      this.parentRef?.createComponent(eData.component);
    }
  }

  async viewComment(e: UserEvent) {
    this.commentLoading = true;
    this.cdr.detectChanges();
    try {
      const comment = await this.commentService.getCommentById(e.referenceId);
      if (comment && comment.storyId) {
        this.parentRef?.createComponent('Social', { 'storyId': comment.storyId, 'commentId': comment.id });
      } else if (comment && comment.fileId) {
        this.parentRef?.createComponent('Files', { 'fileId': comment.fileId.toString() });
      } else {
        this.parentRef?.showNotification('Could not find the original post or file for this comment.');
      }
    } catch (error) {
      console.error('Failed to load comment:', error);
      this.parentRef?.showNotification('Failed to load comment.');
    } finally {
      this.commentLoading = false;
    }
  }

  isClickableEvent(eventType: string): boolean {
    const lEtype = eventType.toLowerCase();
    if (lEtype === "comment"
      || lEtype === "posted"
      || lEtype === "story_post"
      || lEtype === "upload"
      || lEtype === "trophy"
      || lEtype === "save_note") {
      return true;
    }

    const eData = this.getEvent(eventType);
    return eData.component != null;
  }

  showMenuPanel() {
    this.isMenuPanelOpen = true;
    this.parentRef?.showOverlay();
  }

  closeMenuPanel() {
    this.isMenuPanelOpen = false;
    this.parentRef?.closeOverlay();
  }

  async loadEventToggles() {
    if (!this.parentRef?.user?.id) {
      return;
    }

    try {
      const allEventTypes = await this.userEventService.getAllEventTypes();
      this.eventTypes = allEventTypes && allEventTypes.length > 0 ? allEventTypes.sort() : [];

      this.eventTypeDescriptions = {};
      this.eventTypes.forEach(eventType => {
        this.eventTypeDescriptions[eventType] = this.getEventDescription(eventType);
      });

      const eventToggles = await this.userEventService.getUserEventPreferences(this.parentRef.user.id);
      if (eventToggles) {
        for (const eventType of this.eventTypes) {
          const toggle = eventToggles.find(t => t.eventType === eventType);
          this.eventToggles[eventType] = toggle ? toggle.isEnabled : true;
        }
      } else {
        this.eventTypes.forEach(eventType => {
          this.eventToggles[eventType] = true;
        });
      }
    } catch (error) {
      console.error('Failed to load event toggles:', error);
      this.eventTypes.forEach(eventType => {
        this.eventToggles[eventType] = true;
      });
    }
  }

  async toggleEventType(eventType: string) {
    this.eventToggles[eventType] = !this.eventToggles[eventType];

    if (!this.parentRef?.user?.id) {
      return;
    }

    try {
      const preferences = this.eventTypes.map(et => ({
        userId: this.parentRef?.user?.id ?? 0,
        eventType: et,
        isEnabled: this.eventToggles[et]
      }));

      await this.userEventService.saveUserEventPreferences(preferences);
    } catch (error) {
      console.error('Failed to save event toggle:', error);
    }

    await this.loadEvents();
  }

  toggleExcludeSelf() {
    this.excludeSelf = !this.excludeSelf;
    localStorage.setItem('userEventsExcludeSelf', String(this.excludeSelf));
    this.loadEvents();
  }
  isYoutubeLink(link?: string): boolean {
    return this.parentRef?.isYoutubeUrl(link) ?? false;
  }
  private replaceEmojiShortcodes(text: string): string {
    if (!this.parentRef?.emojiMap) return text;
    const map = this.parentRef.emojiMap;
    // Replace <3, ;), :-D etc. first (non-colon shortcodes)
    for (const [key, emoji] of Object.entries(map)) {
      if (key.startsWith(':')) continue;
      text = text.split(key).join(emoji);
    }
    // Replace :shortcode: patterns
    for (const [key, emoji] of Object.entries(map)) {
      if (!key.startsWith(':')) continue;
      text = text.split(key).join(emoji);
    }
    return text;
  }

  parseEventText(text: string): { text: string; url?: string }[] {
    if (!text) return [{ text: '' }];
    // Resolve emoji shortcodes in event text
    text = this.replaceEmojiShortcodes(text);
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts: { text: string; url?: string }[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = urlRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ text: text.slice(lastIndex, match.index) });
      }
      parts.push({ text: match[0], url: match[0] });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      parts.push({ text: text.slice(lastIndex) });
    }
    return parts;
  }
}
