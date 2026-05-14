import { AfterViewInit, Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
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
  private pollingInterval: any;

  constructor(private userEventService: UserEventService, private commentService: CommentService) { super(); }

  async ngOnInit() {
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
    if (e.eventType === 'story_post') {
      this.parentRef?.createComponent('Social', { 'storyId': e.referenceId });
    } else if (e.eventType === 'comment') {
      this.viewComment(e);
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
    return eventType === 'story_post' || eventType === 'comment';
  }
}
