import { Component, QueryList, ViewChildren, AfterViewInit, Input } from '@angular/core';
import { MastermindScoresComponent } from '../mastermind-scores/mastermind-scores.component';
import { EnderHighScoresComponent } from '../ender-high-scores/ender-high-scores.component';
import { WordlerHighScoresComponent } from '../wordler-high-scores/wordler-high-scores.component';
import { DailyMusicComponent } from '../daily-music/daily-music.component';
import { NewUsersComponent } from '../new-users/new-users.component';

@Component({
  selector: 'app-profile-widgets',
  templateUrl: './profile-widgets.component.html',
  styleUrls: ['./profile-widgets.component.css'],
  standalone: false
})
export class ProfileWidgetsComponent implements AfterViewInit {
  @Input() parentRef: any;

  // expose simple boolean availability for template binding
  availabilityMastermind: boolean = false;
  availabilityEnder: boolean = false;
  availabilityWordler: boolean = false;
  availabilityMusic: boolean = false;
  availabilityNewUsers: boolean = false;
  availabilityCurrentlyPlaying: boolean = false;
  @ViewChildren(MastermindScoresComponent) mastermindComponents!: QueryList<MastermindScoresComponent>;
  @ViewChildren(EnderHighScoresComponent) enderComponents!: QueryList<EnderHighScoresComponent>;
  @ViewChildren(WordlerHighScoresComponent) wordlerComponents!: QueryList<WordlerHighScoresComponent>;
  @ViewChildren(DailyMusicComponent) musicComponents!: QueryList<DailyMusicComponent>;
  @ViewChildren(NewUsersComponent) newUsersComponents!: QueryList<NewUsersComponent>;

  orderedKeys: string[] = [];
  // track hasData values keyed by component id
  private availability: Record<string, boolean> = {};

  ngAfterViewInit(): void {
    // nothing to do until children emit their hasData outputs; ordering happens via callbacks
  }

  onChildHasData(key: string, has: boolean) {
    this.availability[key] = has;
    switch (key) {
      case 'mastermind': this.availabilityMastermind = has; break;
      case 'ender': this.availabilityEnder = has; break;
      case 'wordler': this.availabilityWordler = has; break;
      case 'currently-playing': this.availabilityCurrentlyPlaying = has; break;
      case 'music': this.availabilityMusic = has; break;
      case 'newusers': this.availabilityNewUsers = has; break;
    }
    this.reorder();
  }

  private reorder() {
    // create list of components by key and sort with hasData first
    const entries = Object.keys(this.availability).map(k => ({ k, has: this.availability[k] }));
    entries.sort((a, b) => Number(b.has) - Number(a.has));
    this.orderedKeys = entries.map(e => e.k);
  }
}
