import { AfterViewInit, Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { ChildComponent } from '../child.component';
import { UserEvent } from '../../services/datacontracts/user-event/user-event';
import { UserEventService } from '../../services/user-event.service';
import { AppComponent } from '../app.component';

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

  constructor(private userEventService: UserEventService) { super(); }

  async ngOnInit() {
    await this.loadEvents();
  }
  ngAfterViewInit() { }
  ngOnDestroy(): void {
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
}
