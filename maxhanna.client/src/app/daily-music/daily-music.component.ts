import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, Input, OnInit, Output, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { Todo } from '../../services/datacontracts/todo';
import { TodoService } from '../../services/todo.service';
import { AppComponent } from '../app.component';

@Component({
  selector: 'app-daily-music',
  templateUrl: './daily-music.component.html',
  styleUrl: './daily-music.component.css',
  standalone: false
})
export class DailyMusicComponent extends ChildComponent implements OnInit, AfterViewInit {

  songs: Array<Todo> = [];
  @Input() inputtedParentRef?: AppComponent; 
  @Output() hasData = new EventEmitter<boolean>();
  fileId?: number | undefined = undefined;
  showPopup: boolean = false;

  constructor(private todoService: TodoService, private cdr: ChangeDetectorRef) { super(); }

  async ngOnInit() {
    await this.loadTodayMusic();
  }
  ngAfterViewInit() {}

  async loadTodayMusic() {
    const res = await this.todoService.getTodayMusic();
    if (res) { 
      this.songs = res;
    }
    try { 
      this.hasData.emit((this.songs?.length ?? 0) > 0); 
    } catch {}
    this.cdr.detectChanges();
  }

  play(url?: string, fileId?: number) {
    console.log('Attempting to play music with url:', url, ', and fileId:', fileId);
    if (!url && !fileId) return;
    const parent = this.inputtedParentRef ?? this.parentRef;
    // Prefer using the app-level YouTube player when available
    // If there's no URL but we have a fileId, open the MediaViewer for that file
    if (!url && fileId) {
      // Open a local popup containing a MediaViewer instance. The MediaViewer inside
      // the popup is *ngIf-bound to `fileId`, so it will load when we set it.
      this.fileId = fileId;
      this.showPopup = true;
      parent?.showOverlay();
      return;
    }

    if (url && parent) {
      const videoId = parent.getYouTubeVideoId(url);
      if (videoId) {
        try {
          if (typeof parent.playYoutubeVideo === 'function') {
            parent.playYoutubeVideo(videoId);
            this.cdr.detectChanges();
            return;
          }
        } catch (e) {
          console.warn('playYoutubeVideo call failed on parentRef', e);
        }
        // fallthrough to fallback below
      }
    }

    // Fallback: trigger the global hidden youtube button (works if parentRef wasn't wired)
    try {
      const input = document.getElementById('youtubeVideoIdInput') as HTMLInputElement | null;
      if (input && url) input.value = url;
      const btn = document.getElementById('youtubeVideoButton') as HTMLButtonElement | null;
      if (btn) btn.click();
    } catch (e) {
      console.warn('Fallback youtube trigger failed', e);
    }
    this.cdr.detectChanges();
  }

  closeButton() {
    this.fileId = undefined;
    this.showPopup = false;
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent) {
      parent.closeOverlay();
    }
    this.cdr.detectChanges();
  }
}
