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

  constructor(private userEventService: UserEventService, private commentService: CommentService, private cdr: ChangeDetectorRef) { super(); }

  async ngOnInit() {
    if (this.inputtedParentRef) {
      this.parentRef = this.inputtedParentRef;
    }
    await this.loadEvents();
    this.pollingInterval = setInterval(async () => {
      await this.loadEvents();
    }, 30000);
    
    // Load event type toggles
    await this.loadEventToggles();
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

  async loadEvents() {
    this.loadError = null;
    this.loading = true;
    try {
      this.events = await this.userEventService.getUserEvents(50);
    } catch (e) {
      console.error('Failed to load user events', e);
      this.events = [];
      this.loadError = 'Failed to load events.';
    } finally {
      this.loading = false;
      try { this.hasData.emit((this.events?.length ?? 0) > 0); } catch { }
    }
  }

  getEventIcon(eventType: string): string {
    switch (eventType) {
      case 'file_upload': return '📁';
      case 'story_post': return '📝';
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
      default: return '📌';
    }
  }

  viewEvent(e: UserEvent) {
    if (e.referenceId == null) return;

    if (e.eventType.includes('digcraft')) {
      this.parentRef?.createComponent('DigCraft');
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
    return eventType === 'story_post' || eventType === 'comment' || eventType === 'upload' || eventType === 'trophy' || eventType === 'trade_executed'
      || eventType.includes('digcraft') || eventType.includes('meta') || eventType.includes('bones') || eventType.includes('ender') || eventType.includes('nexus') 
      || eventType.includes('emulator') || eventType.includes('meme');
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
      // Get all unique event types from the events we have loaded
      const uniqueEventTypes = new Set<string>();
      this.events.forEach(event => {
        uniqueEventTypes.add(event.eventType);
      });
      
      this.eventTypes = Array.from(uniqueEventTypes);
      
      // Set user-friendly descriptions for event types
      this.eventTypeDescriptions = {};
      this.eventTypes.forEach(eventType => {
        this.eventTypeDescriptions[eventType] = this.getEventTypeDescription(eventType);
      });
      
      // Load toggles for each event type from the new user_event_preferences table
      const eventToggles = await this.userEventService.getUserEventPreferences(this.parentRef.user.id);
      if (eventToggles) {
        for (const eventType of this.eventTypes) {
          const toggle = eventToggles.find(t => t.eventType === eventType);
          this.eventToggles[eventType] = toggle ? toggle.isEnabled : true;
        }
      } else {
        // Default all toggles to true if no settings exist
        this.eventTypes.forEach(eventType => {
          this.eventToggles[eventType] = true;
        });
      }
    } catch (error) {
      console.error('Failed to load event toggles:', error);
      // Default all toggles to true on error
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
      // Get all current toggles to save them all together
      const preferences = this.eventTypes.map(et => ({
        userId: this.parentRef?.user?.id ?? 0,
        eventType: et,
        isEnabled: this.eventToggles[et]
      }));
      
      await this.userEventService.saveUserEventPreferences(preferences);
    } catch (error) {
      console.error('Failed to save event toggle:', error);
    }
  }

  getEventTypeDescription(eventType: string): string {
    const descriptions: { [key: string]: string } = {
      'file_upload': 'File Uploads',
      'story_post': 'Story Posts',
      'comment': 'Comments',
      'bones_kill': 'Bones Kills',
      'bones_death': 'Bones Deaths',
      'ender_kill': 'Ender Kills',
      'ender_death': 'Ender Deaths',
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
      'trophy': 'Trophies Earned'
    };
    
    return descriptions[eventType] || eventType;
  }

  isEventVisible(event: UserEvent): boolean {
    return this.eventToggles[event.eventType] !== false;
  }
}
