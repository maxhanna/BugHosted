import { Component, OnInit, Input } from '@angular/core';
import { UserService, ActiveGamer } from '../../services/user.service';

@Component({
  selector: 'app-currently-playing',
  templateUrl: './currently-playing.component.html',
  styleUrl: './currently-playing.component.css',
  standalone: false
})
export class CurrentlyPlayingComponent implements OnInit {
  @Input() parentRef?: any;
  @Input() showEmptyMessage? = false;
  public gamers: ActiveGamer[] = [];
  public loading = false;
  public gameGroups: { title: string; players: ActiveGamer[] }[] = [];
  constructor(private userService: UserService) { }

  async ngOnInit(): Promise<void> {
    this.loading = true;
    try {
      this.gamers = await this.userService.getActiveGamers();
    } catch (e) {
      console.error('Failed to load active gamers', e);
    }
    const groups = new Map<string, ActiveGamer[]>();
    for (const gamer of this.gamers) {
      const title = this.mapGameToMenuTitle(gamer.game);
      if (!title) continue;
      const players = groups.get(title) ?? [];
      players.push(gamer);
      groups.set(title, players);
    }
    this.gameGroups = Array.from(groups.entries()).map(([title, players]) => ({ title, players }));
    this.loading = false;
  }

  mapGameToMenuTitle(game?: string) {
    if (!game) return '';
    const g = (game || '').toString().toLowerCase();
    if (g === 'nexus' || g === 'bug-wars') return 'Bug-Wars';
    if (g === 'meta' || g === 'meta-bots') return 'Meta-Bots';
    if (g === 'emulation' || g === 'emu') return 'Emulator';
    if (g === 'digcraft') return 'DigCraft';
    if (g === 'array') return 'Array';
    if (g === 'wordler') return 'Wordler';
    if (g === 'mastermind') return 'Mastermind';
    if (g === 'ender') return 'Ender';
    if (g === 'bones') return 'Bones';
    if (g === 'grandtheft' || g === 'grand theft' || g === 'gta') return 'GrandTheft';
    if (g === 'racing' || g === 'race') return 'Racing';
    if (g === 'marbles' || g === 'marble') return 'Marbles';
    if (g === 'space-evolves' || g === 'space evolves' || g === 'spaceevolves') return 'Space: Evolves';
    return game;
  }
}

