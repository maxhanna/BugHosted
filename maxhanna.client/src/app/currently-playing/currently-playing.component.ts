import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UserService, ActiveGamer } from '../../services/user.service';

@Component({
  selector: 'app-currently-playing',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './currently-playing.component.html',
  styleUrls: ['./currently-playing.component.css']
})
export class CurrentlyPlayingComponent implements OnInit {
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
}

