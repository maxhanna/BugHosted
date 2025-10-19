import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnInit, Output, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { Todo } from '../../services/datacontracts/todo';
import { TodoService } from '../../services/todo.service';
import { User } from '../../services/datacontracts/user/user';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { AppComponent } from '../app.component';

@Component({
  selector: 'app-daily-music',
  templateUrl: './daily-music.component.html',
  styleUrls: ['./daily-music.component.css'],
  standalone: false
})
export class DailyMusicComponent extends ChildComponent implements OnInit, AfterViewInit {

  songs: Array<Todo> = [];
  @Input() inputtedParentRef?: AppComponent; 

  constructor(private todoService: TodoService) { super(); }

  async ngOnInit() {
    await this.loadTodayMusic();
  }
  ngAfterViewInit() {}

  async loadTodayMusic() {
    const res = await this.todoService.getTodayMusic();
    if (res) this.songs = res;
  }

  play(url?: string, fileId?: number) {
    if (!url && !fileId) return;
    const parent = this.inputtedParentRef ?? this.parentRef;
    // Prefer using the app-level YouTube player when available
    if (url && parent) {
      const videoId = parent.getYouTubeVideoId(url);
      if (videoId) {
        parent.playYoutubeVideo(videoId);
        return;
      }
    } 
  }
}
