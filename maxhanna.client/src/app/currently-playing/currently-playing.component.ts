import { Component, OnInit, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UserService, ActiveGamer } from '../../services/user.service';
import { AppMenuItemComponent } from '../app-menu-item/app-menu-item.component';

@Component({
  selector: 'app-currently-playing',
  standalone: true,
  imports: [CommonModule, AppMenuItemComponent],
  templateUrl: './currently-playing.component.html',
  styleUrls: ['./currently-playing.component.css']
})
export class CurrentlyPlayingComponent implements OnInit {
  @Input() parentRef?: any;
  public gamers: ActiveGamer[] = [];
  public loading = false;
  constructor(private userService: UserService) { }

  async ngOnInit(): Promise<void> {
    this.loading = true;
    try {
      this.gamers = await this.userService.getActiveGamers();
    } catch (e) {
      console.error('Failed to load active gamers', e);
    }
    this.loading = false;
  }

  mapGameToMenuTitle(game?: string) {
    if (!game) return '';
    const g = (game || '').toString().toLowerCase();
    if (g === 'nexus' || g === 'bug-wars') return 'Bug-Wars';
    if (g === 'meta' || g === 'meta-bots') return 'Meta-Bots';
    if (g === 'emulation' || g === 'emu') return 'Emulation';
    if (g === 'array') return 'Array';
    if (g === 'wordler') return 'Wordler';
    if (g === 'mastermind') return 'Mastermind';
    if (g === 'ender') return 'Ender';
    if (g === 'bones') return 'Bones';
    return game;
  }
}

