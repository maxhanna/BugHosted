import { AfterViewInit, Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { ChildComponent } from '../child.component';
import { UserEvent } from '../../services/datacontracts/user-event/user-event';
import { UserEventService } from '../../services/user-event.service';
import { AppComponent } from '../app.component';
import { CommentService } from '../../services/comment.service';
import { UserService } from '../../services/user.service';

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
  private pollingInterval: any;
  isMenuPanelOpen = false;
  eventTypes: string[] = [];
  eventToggles: { [key: string]: boolean } = {};

  constructor(private userEventService: UserEventService, private commentService: CommentService, private userService: UserService) { super(); }

  async ngOnInit() {
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
  }

  async viewComment(e: UserEvent) {
    const comment = await this.commentService.getCommentById(e.referenceId);
    if (comment && comment.storyId) {
      this.parentRef?.createComponent('Social', { 'storyId': comment.storyId, 'commentId': comment.id });
    } else if (comment && comment.fileId) {
      this.parentRef?.createComponent('Files', { 'fileId': comment.fileId.toString() });
    } else {
      this.parentRef?.showNotification('Could not find the original post or file for this comment.');
    }
  }

  isClickableEvent(eventType: string): boolean {
    return eventType === 'story_post' || eventType === 'comment' || eventType === 'upload' || eventType === 'trophy' || eventType.includes('digcraft') || eventType.includes('meta')
      || eventType.includes('bones') || eventType.includes('ender') || eventType.includes('nexus') || eventType.includes('emulator')
      || eventType.includes('posted');
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
      // First, try to get all available event types from the server
      const allEventTypes = await this.userEventService.getAllEventTypes();
      
      // If we have events loaded, merge with them to make sure we have all types
      const uniqueEventTypes = new Set<string>();
      this.events.forEach(event => {
        uniqueEventTypes.add(event.eventType);
      });
      
      // Add all event types from server
      allEventTypes.forEach(et => uniqueEventTypes.add(et));
      
      this.eventTypes = Array.from(uniqueEventTypes);
      
      // Load toggles for each event type
      const eventToggles = await this.userService.fetchUserSettings(this.parentRef.user.id, this.eventTypes.map(et => `event_toggle_${et}`));
      if (eventToggles) {
        for (const eventType of this.eventTypes) {
          const key = `event_toggle_${eventType}`;
          this.eventToggles[eventType] = eventToggles[key] !== 'false';
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
      await this.userService.updateUserSettings(this.parentRef.user.id, [
        {
          settingName: `event_toggle_${eventType}` as any,
          value: this.eventToggles[eventType]
        }
      ]);
    } catch (error) {
      console.error('Failed to save event toggle:', error);
    }
  }

  isEventVisible(event: UserEvent): boolean {
    return this.eventToggles[event.eventType] !== false;
  }
}
