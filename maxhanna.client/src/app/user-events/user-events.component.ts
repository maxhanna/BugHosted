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
  
  getEventIcon(eventType: string): string {
    switch (eventType.toLowerCase()) {
      case 'file_upload': return '📁';
      case 'upload_file': return '📁';
      case 'story_post': return '🌍';
      case 'grandtheft': return '🚔';
      case 'comment': return '💬';
      case 'bones_kill': return '⚔️';
      case 'bones_death': return '💀';
      case 'ender_kill': return '🏍️';
      case 'ender_death': return '💥';
      case 'digcraft_play': return '⛏️';
      case 'digcraft_death': return '⛏️';
      case 'digcraft_kill': return '⛏️';
      case 'emulator_play': return '🎮';
      case 'nexus_play': return '🐛';
      case 'meta_encounter': return '🤖';
      case 'daily_meme': return '😂';
      case 'favourite_add': return '⭐';
      case 'digcraft_levelup': return '⬆️';
      case 'trade_executed': return '₿';
      case 'trophy': return '🏆';
      case 'reaction_added': return '😊';
      case 'wordler_win': return '🧠';
      case 'youtube': return '▶️';
      case 'link': return '🕸️';
      case 'flighttracking': return '✈️';
      case 'weaver_card_added': return '🕷️';
      case 'weaver_card_created': return '🕷️';
      case 'recipe_edited': return '🍳';
      case 'recipe_added': return '🍳';
      case 'racing': return '🏎️';
      case 'marbles': return '🌀';
      default: return '📌';
    }
  } 

  getEventDescription(eventType: string): string {
    const descriptions: { [key: string]: string } = {
      'file_upload': 'File Uploads',
      'upload_file': 'File Uploads',
      'story_post': 'Story Posts',
      'comment': 'Comments',
      'bones_kill': 'Bones Kills',
      'bones_death': 'Bones Deaths',
      'ender_kill': 'Ender Kills',
      'ender_death': 'Ender Deaths',
      'grandtheft': 'Grand Theft Play',
      'digcraft_play': 'DigCraft Play',
      'digcraft_death': 'DigCraft Deaths',
      'digcraft_kill': 'DigCraft Kills',
      'emulator_play': 'Emulator Play',
      'nexus_play': 'Nexus Play',
      'meta_encounter': 'Meta Encounters',
      'daily_meme': 'Daily Memes',
      'favourite_add': 'Favourites Added',
      'digcraft_levelup': 'DigCraft Level-ups',
      'trade_executed': 'Trade Executions',
      'trophy': 'Trophies Earned',
      'youtube': 'Viewed Youtube Video',
      'link': 'Visited External Link',
      'recipe_added': 'Recipes Added',
      'recipe_edited': 'Recipes Edited',
      'wordler_win': 'Wordler Wins',
      'weaver_card_added': 'Weaver Cards Created',
      'weaver_card_created': 'Weaver Cards Created',
      'flighttracking': 'Flight Tracking Events',
      'FlightTracking': 'Flight Tracking Events',
      'marbles': 'Lose your Marbles Events',
    };

    return descriptions[eventType] || eventType;
  }

  viewEvent(e: UserEvent) {
    if (e.referenceId == null) return;

    if (e.eventType.includes('digcraft')) {
      this.parentRef?.createComponent('DigCraft');
    }
    if (e.eventType.toLowerCase().includes('grandtheft')) {
      this.parentRef?.createComponent('GrandTheft');
    }
    else if (e.eventType.includes('meta')) {
      this.parentRef?.createComponent('Meta-Bots');
    }
    else if (e.eventType.includes('bones')) {
      this.parentRef?.createComponent('Bones');
    }
    else if (e.eventType.includes('ender')) {
      this.parentRef?.createComponent('Ender');
    }
    else if (e.eventType.includes('nexus')) {
      this.parentRef?.createComponent('Bug-Wars');
    }
    else if (e.eventType.includes('emulator')) {
      this.parentRef?.createComponent('Emulator');
    }
    else if (e.eventType.includes('posted')) {
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
    else if (e.eventType === 'trade_executed') {
      this.parentRef?.createComponent('Crypto-Hub');
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
    const lEType = eventType.toLowerCase();
    return lEType === 'story_post' || lEType === 'comment' || lEType === 'upload' || lEType === 'trophy' || lEType === 'trade_executed'
      || lEType.includes('digcraft') || lEType.includes('meta') || lEType.includes('bones') || lEType.includes('ender') || lEType.includes('nexus')
      || lEType.includes('emulator') || lEType.includes('meme') || lEType.includes('grandtheft') || eventType.includes('recipe');
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
  parseEventText(text: string): { text: string; url?: string }[] {
    if (!text) return [{ text: '' }];
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
