import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { Location } from '@angular/common';
import { ChildComponent } from '../child.component';
import { Todo } from '../../services/datacontracts/todo';
import { TodoService } from '../../services/todo.service';
import { RadioService, RadioCountry, RadioLanguage, RadioTag, RadioStation } from '../../services/radio.service';
import { User } from '../../services/datacontracts/user/user';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { MediaSelectorComponent } from '../media-selector/media-selector.component';
import { MediaViewerComponent } from '../media-viewer/media-viewer.component';
import { AppComponent } from '../app.component'; 
import { SubscriptionLike } from 'rxjs';

@Component({
  selector: 'app-music',
  templateUrl: './music.component.html',
  styleUrl: './music.component.css',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush
})

export class MusicComponent extends ChildComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('titleInput') titleInput!: ElementRef<HTMLInputElement>;
  @ViewChild('urlInput') urlInput!: ElementRef<HTMLInputElement>;
  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;
  @ViewChild('musicVideo') musicVideo!: ElementRef<HTMLDivElement>;
  @ViewChild('orderSelect') orderSelect!: ElementRef<HTMLSelectElement>;
  @ViewChild('componentMain') componentMain!: ElementRef<HTMLDivElement>;
  @ViewChild('mediaSelector') mediaSelector!: MediaSelectorComponent;
  @ViewChild('fileMediaViewer') fileMediaViewer!: MediaViewerComponent;

  songs: Array<Todo> = [];
  fileSongs: Array<Todo> = [];
  youtubeSongs: Array<Todo> = [];
  paginatedSongs: Array<Todo> = [];
  orders: Array<string> = ["Newest", "Oldest", "Alphanumeric ASC", "Alphanumeric DESC", "Random"];
  isMusicPlaying = false;
  selectedFile?: FileEntry;
  fileIdPlaylist?: number[];
  fileIdPlaying?: number;
  currentPage = 1;
  itemsPerPage = 50;
  totalPages = 1;
  isSongListCollapsed = false;
  selectedType: 'youtube' | 'file' | 'radio' = 'youtube';
  isEditing: number[] = [];
  showHelpPopup = false;
  isFullscreen = false;
  isShowingYoutubeSearch = false;
  hasEditedSong = false;

  // Radio properties
  radioStations: RadioStation[] = [];
  radioCountries: RadioCountry[] = [];
  radioLanguages: RadioLanguage[] = [];
  radioTags: RadioTag[] = [];
  isLoadingRadio = false;
  radioFilters = {
    country: '',
    language: '',
    tag: ''
  };
  currentRadioStation?: RadioStation;
  trackSong = (_: number, s: { id?: number }) => s.id ?? _;
  private currentUrl?: string;
  private currentFileId?: number | null; 
  private ytPlayer?: YT.Player;
  private ytReady = false;
  private pendingPlay?: { url?: string; fileId?: number | null }; // queue if API not ready yet
  private ytApiPromise?: Promise<void>; 
  private resizeHandler?: () => void;
  private ro?: ResizeObserver;
  private locationSub?: SubscriptionLike;
  private radioAudioEl?: HTMLAudioElement;
  ytSearchTerm = '';



  @Input() user?: User;
  @Input() smallPlayer = false;
  @Input() inputtedParentRef?: AppComponent;
  @Output() gotPlaylistEvent = new EventEmitter<Array<Todo>>();

  constructor(private todoService: TodoService,
    private location: Location,
    private radioService: RadioService,
    private cdr: ChangeDetectorRef
  ) {
    super(); 
    this.locationSub = this.location.subscribe(() => {
      if (this.isFullscreen) {
        this.closeFullscreen();
      }
    });
  }

  @HostListener('document:keydown.escape', ['$event'])
  handleEscapeKey(event: KeyboardEvent) {
    if (this.isFullscreen) {
      this.closeFullscreen();
      event.preventDefault();
    }
  }

  @HostListener('document:visibilitychange')
  onVisChange() {
    if (document.visibilityState === 'visible' && this.isMusicPlaying) {
      try { this.ytPlayer?.playVideo(); } catch { }
    }
  } 

  async ngOnInit() {
    await this.tryInitialLoad();
  }

  ngOnDestroy(): void { 
    try { this.ytPlayer?.stopVideo(); } catch {}
    try { this.ytPlayer?.destroy(); } catch {}
    this.ytPlayer = undefined;

    // Clear pending play queue
    this.pendingPlay = undefined;

    // Tear down resize listeners / observers
    this.detachResizeHandling();

    // Clear timers
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }

    // Unsubscribe from Location (and any other RxJS subscriptions)
    if (this.locationSub) {
      try { this.locationSub.unsubscribe(); } catch {}
      this.locationSub = undefined;
    }

    // Remove radio audio element
    if (this.radioAudioEl) {
      try { this.radioAudioEl.pause(); } catch {}
      try { this.radioAudioEl.remove(); } catch {}
      this.radioAudioEl = undefined;
    } 
  } 

  private attachResizeHandling() {
    const hostEl = this.musicVideo.nativeElement as HTMLElement;
    hostEl.style.display = 'block'; 
    hostEl.style.minHeight = '200px';
    
    const resize = () => {
      const r = hostEl.getBoundingClientRect();
      const w = Math.max(300, Math.round(r.width));
      const h = Math.max(250, Math.round(r.height));
      try { this.ytPlayer?.setSize(w, h); } catch {}
    };
    
    // Save so we can remove later
    this.resizeHandler = resize; 
    window.addEventListener('resize', resize);

    // ResizeObserver is great for container-size changes
    this.ro = new ResizeObserver(() => resize());
    this.ro.observe(hostEl);
    resize(); 
  }

  private detachResizeHandling() {
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = undefined;
    }
    if (this.ro) {
      try { this.ro.disconnect(); } catch {}
      this.ro = undefined;
    }
  }


  private async tryInitialLoad() {
    const parent = this.inputtedParentRef ?? this.parentRef;
    const user = this.user ?? parent?.user;

    if (!user?.id) {
      await Promise.resolve();
    }
    await this.refreshPlaylist();
    if (this.songs.length && this.songs[0].url) {
      this.play(this.songs[0].url!);
    }
    console.log('[Music] Loaded', this.songs.length, 'songs; page', this.currentPage);
  }

  async ngAfterViewInit() {
    if (this.user) {
      this.componentMain.nativeElement.style.padding = 'unset';
    }

    await this.ensureYouTubeApi();

    if (!(window as any).YT?.Player) {
      console.error('[Music] YT still undefined after ensureYouTubeApi()');
      return;
    }

    this.ytReady = true;

    // If you want to autostart when you already have songs loaded:
    if (this.songs.length && this.songs[0]?.url) {
      const ids = this.getYoutubeIdsInOrder();
      const firstId = this.trimYoutubeUrl(this.songs[0].url!);
      let index = ids.indexOf(firstId);
      if (index < 0) { ids.unshift(firstId); index = 0; }

      // ✅ Recreate the player with URL-level playlist
      this.rebuildYTPlayer(firstId, ids, index);
    } else if (this.pendingPlay?.url) {
      this.consumePendingPlay();
    }
  }


  async next() {
    if (!this.ytPlayer) return;

    const beforeIdx = this.ytPlayer.getPlaylistIndex?.() ?? -1;
    const hadPlaylist = (this.ytPlayer.getPlaylist?.() || []).length > 0;

    let advanced = false;
    try {
      this.ytPlayer.nextVideo();       // may silently do nothing if no playlist attached
      await new Promise(r => setTimeout(r, 200)); // let player react
      const afterIdx = this.ytPlayer.getPlaylistIndex?.() ?? -1;
      advanced = hadPlaylist && afterIdx !== beforeIdx;
    } catch {
      // swallow, we’ll fallback
    }

    if (!advanced) {
      this.nextFallback();             // your array-based re-load
    }
  }

  async prev() {
    if (!this.ytPlayer) return;

    const beforeIdx = this.ytPlayer.getPlaylistIndex?.() ?? -1;
    const hadPlaylist = (this.ytPlayer.getPlaylist?.() || []).length > 0;

    let moved = false;
    try {
      this.ytPlayer.previousVideo();
      await new Promise(r => setTimeout(r, 200));
      const afterIdx = this.ytPlayer.getPlaylistIndex?.() ?? -1;
      moved = hadPlaylist && afterIdx !== beforeIdx;
    } catch { }

    if (!moved) {
      this.prevFallback();
    }
  }


  private consumePendingPlay() {
    if (this.pendingPlay?.url && this.ytReady) {
      const { url } = this.pendingPlay;
      this.pendingPlay = undefined;
      this.play(url);
    }
  }

  private nextFallback() {
    const ids = this.getYoutubeIdsInOrder();
    if (!ids.length) return;
    const idx = (this.getCurrentIndex(ids) + 1) % ids.length;
    this.ytPlayer?.loadPlaylist(ids, idx, undefined, 'small');  // array overload

    setTimeout(() => {
      const pl = this.ytPlayer?.getPlaylist?.() || [];
      const pi = this.ytPlayer?.getPlaylistIndex?.() ?? 0;
      console.log('[YT] playlist size:', pl.length, 'index:', pi);
    }, 500);

    this.ytPlayer?.playVideo();
  }

  private prevFallback() {
    const ids = this.getYoutubeIdsInOrder();
    if (!ids.length) return;
    const idx = this.getCurrentIndex(ids) - 1;
    const prevIdx = (idx < 0) ? (ids.length - 1) : idx;
    this.ytPlayer?.loadPlaylist(ids, prevIdx, undefined, 'small');

    setTimeout(() => {
      const pl = this.ytPlayer?.getPlaylist?.() || [];
      const pi = this.ytPlayer?.getPlaylistIndex?.() ?? 0;
      console.log('[YT] playlist size:', pl.length, 'index:', pi);
    }, 500);

    this.ytPlayer?.playVideo();
  }

  private ensureYouTubeApi(): Promise<void> {
    if (this.ytApiPromise) return this.ytApiPromise;

    this.ytApiPromise = new Promise<void>((resolve, reject) => {
      const w = window as any;

      // Already loaded?
      if (w.YT?.Player) { resolve(); return; }

      // Set the global ready callback BEFORE injecting the script (prevents race)
      w.onYouTubeIframeAPIReady = () => resolve();

      // Avoid duplicate script inserts
      const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
      if (!existing) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        tag.async = true;
        tag.onerror = () => reject(new Error('Failed to load YouTube IFrame API'));
        document.head.appendChild(tag);
      }
    });

    // ✅ Return the promise so `await` actually waits
    return this.ytApiPromise;
  }

  private getYoutubeIdsInOrder(): string[] {
    const ids: string[] = [];
    for (const s of this.songs) {
      if (s.url) {
        const id = this.trimYoutubeUrl(s.url);
        if (id) ids.push(id);
      }
    }
    return ids;
  }

  private getCurrentIndex(ids: string[]): number {
    const vid = this.ytPlayer?.getVideoData()?.video_id;
    if (!vid) return 0;
    return Math.max(0, ids.indexOf(vid));
  }

  async getSongList() {
    try {
      const parent = this.inputtedParentRef ?? this.parentRef;
      const user = this.user ?? parent?.user;
      if (!user?.id || !parent) return;

      const tmpSongs = await this.todoService.getTodo(user.id, 'Music');

      // Build fresh arrays (new references)
      this.youtubeSongs = tmpSongs.filter((song: Todo) => parent.isYoutubeUrl(song.url));
      this.fileSongs = tmpSongs.filter((song: Todo) => !parent.isYoutubeUrl(song.url));

      this.songs = this.selectedType === 'file'
        ? [...this.fileSongs]
        : [...this.youtubeSongs];
    } finally {
      this.updatePaginatedSongs();   // ensures new reference for paginatedSongs
      this.gotPlaylistEvent.emit([...this.songs]); // emit a new ref as well
      this.cdr.markForCheck();
    }
  }


  async searchForSong() {
    const search = this.searchInput?.nativeElement.value || '';
    const user = this.user ?? this.parentRef?.user;
    if (!user?.id) return;

    if (!search) {
      await this.getSongList();
    } else {
      const tmpSongs = await this.todoService.getTodo(user.id, "Music", search);
      this.youtubeSongs = tmpSongs.filter((song: Todo) => this.parentRef?.isYoutubeUrl(song.url));
      this.fileSongs = tmpSongs.filter((song: Todo) => !this.parentRef?.isYoutubeUrl(song.url));
      this.songs = this.selectedType === 'file' ? [...this.fileSongs] : [...this.youtubeSongs];
      this.currentPage = 1; // Reset to first page on search
      this.updatePaginatedSongs();
    }
    this.reorderTable(undefined, this.orderSelect?.nativeElement.value || 'Newest');
  }

  updatePaginatedSongs() {
    console.log("Updating paginated songs for page:", this.currentPage, this.songs.length, "total songs");
    this.totalPages = Math.ceil(this.songs.length / this.itemsPerPage) || 1;
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;

    // Create a NEW array reference - this is key for OnPush + *ngFor
    this.paginatedSongs = this.songs.slice(startIndex, startIndex + this.itemsPerPage);
  }

  goToPreviousPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.updatePaginatedSongs();
      this.scrollToTop();
    }
  }

  goToNextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.updatePaginatedSongs();
      this.scrollToTop();
    }
  }

  toggleSongList() {
    this.isSongListCollapsed = !this.isSongListCollapsed;
  }

  async addSong() {
    if (this.user) {
      alert("Can't add song on another person's list");
      return;
    }
    if (!this.parentRef?.user?.id) {
      alert("You must be logged in to add to the music list.");
      return;
    }
    const url = this.extractYouTubeVideoId(this.urlInput.nativeElement.value);
    const title = this.titleInput.nativeElement.value;
    if (((!url || url.trim() === "") && !this.selectedFile) || !title || title.trim() === "") {
      alert("Title & URL/File cannot be empty!");
      return;
    }
    let tmpTodo = new Todo();
    tmpTodo.type = "music";
    tmpTodo.url = url.trim();
    tmpTodo.todo = title.trim();
    tmpTodo.fileId = this.selectedFile?.id;
    tmpTodo.date = new Date(); // Ensure date is set for sorting
    const resTodo = await this.todoService.createTodo(this.parentRef.user.id, tmpTodo);
    if (resTodo) {
      tmpTodo.id = parseInt(resTodo);
      this.selectedFile = undefined;
      this.songs.unshift(tmpTodo);
      this.updateSongTypeArrays(tmpTodo);
      this.updatePaginatedSongs();
      this.titleInput.nativeElement.value = '';
      this.urlInput.nativeElement.value = '';
    }
  }

  async deleteSong(id: number) {
    if (!confirm("Deleting song. Are you sure?") || !this.parentRef?.user?.id) return;
    await this.todoService.deleteTodo(this.parentRef.user.id, id);
    const index = this.songs.findIndex(song => song.id === id);
    if (index !== -1) {
      this.songs.splice(index, 1);
      this.updateSongTypeArrays();
      this.updatePaginatedSongs();
    }
    if (document.getElementById("songId" + id)) {
      document.getElementById("songId" + id)!.style.textDecoration = "line-through";
    }
    this.clearInputs();
    this.closeEditPopup(false);
  }

  selectType(type: 'youtube' | 'file' | 'radio') {
    this.selectedType = type;
    if (type != 'youtube') { 
      this.ytPlayer?.stopVideo();
      setTimeout(() => {
        this.ytPlayer?.destroy();
      }, 100);
    }
    if (type != 'radio') {
      const iframeDiv = document.getElementById('iframeDiv'); 
      const existingAudio = iframeDiv?.querySelector('audio');
      if (existingAudio) {
        existingAudio.remove();
      }
    }

    if (type === 'radio') {
      this.loadRadioData();
    } else { 
      this.songs = type === 'file' ? [...this.fileSongs] : [...this.youtubeSongs];
      this.fileIdPlaylist = type === 'file' ? this.fileSongs.map(song => song.fileId!).filter(id => id !== undefined) : undefined;
    }

    this.currentPage = 1;
    this.updatePaginatedSongs();
    this.reorderTable(undefined, this.orderSelect?.nativeElement.value || 'Newest');
    this.stopMusic();
  }


  play(url?: string, fileId?: number) {
    console.log("Play called with url:", url, "fileId:", fileId);
    if (!url && !fileId) { 
      this.parentRef?.showNotification("Url/File can't be empty"); 
      return;
   }

    // Ignore redundant replays
    if (url != undefined && url === this.currentUrl) return;
    if (fileId != undefined && fileId === this.currentFileId) return;

    // ✅ Only gate on API readiness.
    // We purposely do NOT check `ytPlayer` here anymore.
    if (!this.ytReady && url) {
      this.pendingPlay = { url, fileId: null };
      console.log("YT API not ready, queuing play for url:", url);
      return;
    }

    // FILE branch unchanged...
    if (fileId) {
      this.fileIdPlaying = fileId;
      setTimeout(async () => {
        if (this.fileMediaViewer) {
          this.fileMediaViewer.resetSelectedFile();
          setTimeout(async () => {
            await this.fileMediaViewer.setFileSrcById(fileId);
            this.cdr.markForCheck();
          }, 50);
        }
      }, 10);
      console.log("Playing file with ID:", fileId);
      this.cdr.markForCheck();
      return;
    }

    const ids = this.getYoutubeIdsInOrder();
    const firstId = this.trimYoutubeUrl(url!);
    let index = ids.indexOf(firstId);
    if (index < 0) { ids.unshift(firstId); index = 0; }

    // ✅ Use array-based rebuild for huge lists
    this.rebuildYTPlayer(firstId, ids, index);


    // Update UI state
    this.currentUrl = url;
    this.currentFileId = null;
    this.isMusicPlaying = true;
    this.isMusicControlsDisplayed(true);

    console.log("rebuilt player with first:", firstId, "playlist length:", ids.length, "index:", index);
  }



  randomSong() {
    if (this.fileIdPlaylist && this.fileIdPlaylist.length > 0) {
      const randomFileId = this.fileIdPlaylist[Math.floor(Math.random() * this.fileIdPlaylist.length)];
      this.play(undefined, randomFileId);
    } else {
      const randomIndex = Math.floor(Math.random() * this.songs.length);
      this.play(this.songs[randomIndex].url!);
    }
  }

  followLink() {
    if (!this.currentUrl) {
      alert("No currently selected song!");
      return;
    }
    const currUrl = this.currentUrl;
    const regex = /\/embed[^?]+\?playlist=/;
    const newUrl = currUrl.replace(regex, "/watch_videos?video_ids=");
    window.open(newUrl);
    this.stopMusic();
  }

  reorderTable(event?: Event, targetOrder?: string) {
    if (!this.songs || this.songs.length === 0) return;
    const order = event ? (event.target as HTMLSelectElement).value : targetOrder;
    const songsCopy = [...this.songs]; // Create a copy to avoid modifying original
    switch (order) {
      case "Alphanumeric ASC":
        this.songs = songsCopy.sort((a, b) => (a.todo || '').localeCompare(b.todo || ''));
        break;
      case "Alphanumeric DESC":
        this.songs = songsCopy.sort((a, b) => (b.todo || '').localeCompare(a.todo || ''));
        break;
      case "Newest":
        this.songs = songsCopy.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
        break;
      case "Oldest":
        this.songs = songsCopy.sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());
        break;
      case "Random":
        this.shuffleSongs(songsCopy);
        this.songs = songsCopy;
        break;
      default:
        this.songs = songsCopy.sort((a, b) => (a.todo || '').localeCompare(b.todo || ''));
    }
    this.currentPage = 1; // Reset to first page on reorder
    this.updatePaginatedSongs();
  }

  getPlaylistForYoutubeUrl(url: string): string[] {
    let playlist = [];
    let offset = this.songs.indexOf(this.songs.find(x => x.url === url)!);
    if (offset < 0) offset = 0;
    for (let i = offset; i < this.songs.length; i++) {
      playlist.push(this.trimYoutubeUrl(this.songs[i].url || ''));
    }
    for (let i = 0; i < offset; i++) {
      playlist.push(this.trimYoutubeUrl(this.songs[i].url || ''));
    }
    return playlist;
  }

  clearInputs() {
    if (this.searchInput) this.searchInput.nativeElement.value = "";
    if (this.titleInput) this.titleInput.nativeElement.value = "";
    if (this.urlInput) this.urlInput.nativeElement.value = "";
  }

  shuffleSongs(array: any[]) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }


  stopMusic() {
    this.isMusicPlaying = false;
    this.isMusicControlsDisplayed(false);

    // Stop YT without unloading the iframe
    try { this.ytPlayer?.stopVideo(); } catch { }

    // Stop file playback
    if (this.fileMediaViewer) {
      this.fileMediaViewer.resetSelectedFile();
    }
    this.fileIdPlaying = undefined;
  }


  fullscreen() {
    const youtubePopup = document.getElementById('musicVideo');
    if (youtubePopup) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        youtubePopup.requestFullscreen().catch(err => {
          console.error("Error attempting to enable full-screen mode:", err);
        });
        this.isFullscreen = true;
      }
    } else {
      console.error("YouTube popup element not found.");
    }
  }
  closeFullscreen() {
    const youtubePopup = document.getElementById('musicVideo');
    if (youtubePopup) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      }
    }
    this.isFullscreen = false;
    if (!this.smallPlayer) {
      const parent = this.inputtedParentRef ?? this.parentRef;
      parent?.closeOverlay();
    }
  }

  trimYoutubeUrl(url: string) {
    if (!url || url.trim() == '') return '';
    if (url.includes("youtu.be")) {
      return url.substring(url.indexOf("youtu.be/") + 9, url.length);
    }
    if (url.includes("?v=") || url.includes("&v=")) {
      const regex = /[?&]v=([^&,$]+)/;
      const match = url.match(regex);
      return match && match[1] ? match[1] : '';
    } else {
      console.error("URL doesn't contain v parameter: " + url);
      return '';
    }
  }

  isMusicControlsDisplayed(setter: boolean) {
    const elements = [
      document.getElementById("stopMusicButton"),
      document.getElementById("followLinkButton"),
      document.getElementById("openPlaylistButton"),
      document.getElementById("fullscreenMusicButton"),
    ];
    elements.forEach(el => {
      if (el) el.style.display = setter ? "inline-block" : "none";
    });
    this.cdr.markForCheck();
  }

  extractYouTubeVideoId(url: string) {
    const youtubeRegex = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(youtubeRegex);
    return match && match[1] ? `https://www.youtube.com/watch?v=${match[1]}` : url;
  }

  onSearchEnter() {
    clearTimeout(this.debounceTimer);
    this.ytSearchTerm = this.searchInput?.nativeElement.value || '';
    this.debounceTimer = setTimeout(() => {
      this.searchForSong();
    }, 100);
  }

  selectFile(fileEntry: FileEntry[]) {
    this.selectedFile = fileEntry[0];
  }

  mediaEndedEvent() {
    const currentId = this.fileIdPlaying;
    if (this.fileIdPlaylist && this.fileIdPlaylist.length > 0) {
      const currentIndex = this.fileIdPlaylist.indexOf(currentId!);
      if (currentIndex >= 0 && currentIndex < this.fileIdPlaylist.length - 1) {
        const nextFileId = this.fileIdPlaylist[currentIndex + 1];
        this.play(undefined, nextFileId);
      } else {
        this.randomSong();
      }
    }
  }

  private updateSongTypeArrays(newSong?: Todo) {
    if (newSong) {
      if (this.parentRef?.isYoutubeUrl(newSong.url)) {
        this.youtubeSongs.unshift(newSong);
      } else {
        this.fileSongs.unshift(newSong);
      }
    }
    this.youtubeSongs = this.songs.filter(song => this.parentRef?.isYoutubeUrl(song.url));
    this.fileSongs = this.songs.filter((song: Todo) => !this.parentRef?.isYoutubeUrl(song.url));
  }

  async editSong(id?: number) {
    if (!id) return;
    const parent = this.inputtedParentRef ?? this.parentRef;
    this.hasEditedSong = false;
    if (!this.isEditing.includes(id)) {
      parent?.showOverlay();
      this.isEditing.push(id);
    } else {
      const todoDiv = document.getElementById('songId' + id) as HTMLTableCellElement;
      const textInput = document.getElementById("editSongNameInput") as HTMLInputElement;
      const urlInput = document.getElementById("editSongUrlInput") as HTMLInputElement;

      try {
        await this.todoService.editTodo(id, textInput.value, urlInput?.value).then(res => {
          if (res) {
            parent?.showNotification(res);
          }
        });
        const todoIndex = this.songs.findIndex(todo => todo.id === id);
        if (todoIndex !== -1) {
          this.songs[todoIndex].todo = textInput.value;
        }
        parent?.closeOverlay();
        this.isEditing = this.isEditing.filter(x => x !== id);
      } catch (error) {
        console.error("Error updating todo:", error);
        parent?.showNotification("Failed to update todo");
      }
    }
  }

  closeHelpPanel() {
    this.showHelpPopup = false;
    this.parentRef?.closeOverlay();
  }
  openHelpPanel() {
    this.showHelpPopup = true;
    this.parentRef?.showOverlay();
  }
  showYoutubeSearch() {
    this.ytSearchTerm = this.searchInput?.nativeElement.value || '';
    this.isShowingYoutubeSearch = true;
    this.parentRef?.showOverlay();
    this.cdr.markForCheck();
  }
  closeYoutubeSearch() {
    this.isShowingYoutubeSearch = false;
    this.parentRef?.closeOverlay(); 
    this.cdr.markForCheck(); 
  }
  async selectYoutubeVideoEvent(video: any) {
    this.urlInput.nativeElement.value = video.url;
    this.titleInput.nativeElement.value = video.title;
    await this.addSong();
    this.closeYoutubeSearch();
    this.cdr.markForCheck();
  }
  closeEditPopup(editSong = true) {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => {
      if (this.parentRef) {
        this.parentRef.closeOverlay(false);
      }
      if (this.hasEditedSong && editSong) {
        this.editSong(this.isEditing[0]);
      } else {
        this.isEditing = [];
      }
    }, 50);
  }
  scrollToTop() {
    const div = document.getElementsByClassName("musicControls")[0] as HTMLDivElement;
    if (div) {
      div.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      console.log("Div not found!");
    }
  }


  get playerClasses(): string {
    const base = this.smallPlayer ? 'smallIframeDiv'
                : this.onMobile() ? 'mobileIframeDiv'
                : 'iframeDiv';
    // apply popupPanel only when you actually need overlay behavior
    const overlay = this.isFullscreen ? 'music-fullscreen' : '';
    return `${base} ${overlay}`.trim();
  }


  get isVisible(): boolean {
    return !!(this.songs && this.songs.length > 0 && this.isMusicPlaying);
  }




  private rebuildYTPlayer(firstId: string, songIds: string[], index: number) {
    if (!this.musicVideo?.nativeElement) return;

    this.detachResizeHandling();

    try { this.ytPlayer?.destroy(); } catch { console.warn('[YT] Failed to destroy existing player'); }
    
    const initialChunk = songIds.slice(0, 50).join(',');

    this.ytPlayer = new YT.Player(this.musicVideo.nativeElement as HTMLElement, {
      videoId: firstId,
      playerVars: {
        playsinline: 1,
        rel: 0,
        modestbranding: 1,
        enablejsapi: 1,
        origin: window.location.origin,
        controls: 1,
        playlist: initialChunk, // <-- string, not string[]
      },
      events: {
        onReady: () => {  
          this.ytPlayer?.loadPlaylist(songIds, index, undefined, 'small');
          try { this.ytPlayer?.playVideoAt(index); } catch {}
          this.ytPlayer?.playVideo();
          try { this.ytPlayer?.setLoop(true); } catch {} 
          this.attachResizeHandling(); 
        },
        onStateChange: (e: YT.OnStateChangeEvent) => {
          if (e.data === YT.PlayerState.ENDED) this.next();
        },
        onError: (_e: YT.OnErrorEvent) => this.next(),
      }
    });
  }

  // Radio Browser API methods
  async loadRadioData() {
    this.isLoadingRadio = true;
    try {
      // Load countries, languages, and tags
      await Promise.all([
        this.fetchRadioCountries(),
        this.fetchRadioLanguages(),
        this.fetchRadioTags()
      ]);
      // Load default stations
      await this.fetchRadioStations();
    } catch (error) {
      console.error('Error loading radio data:', error);
    } finally {
      this.isLoadingRadio = false;
      this.cdr.markForCheck();
    }
  }

  async fetchRadioCountries() {
    this.radioCountries = await this.radioService.fetchCountries();
  }

  async fetchRadioLanguages() {
    this.radioLanguages = await this.radioService.fetchLanguages();
  }

  async fetchRadioTags() {
    this.radioTags = await this.radioService.fetchTags();
  }

  async fetchRadioStations() {
    this.isLoadingRadio = true;
    try {
      this.radioStations = await this.radioService.fetchStations(this.radioFilters);
    } finally {
      this.isLoadingRadio = false;
    }
  }

  onRadioFilterChange(filterType: 'country' | 'language' | 'tag', event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    this.radioFilters[filterType] = value;
    this.fetchRadioStations();
  }

  playRadioStation(station: RadioStation) {
    if (!station || !station.url_resolved) {
      alert('Invalid radio station URL');
      return;
    }

    const iframeDiv = document.getElementById('iframeDiv');
    if (iframeDiv) {
      // Remove any existing instance we created
      if (this.radioAudioEl) {
        try { this.radioAudioEl.pause(); } catch {}
        this.radioAudioEl.remove();
      }

      this.currentRadioStation = station;
      this.isMusicPlaying = true;

      // Create an audio element to play the radio stream
      const audioPlayer = document.createElement('audio');
      audioPlayer.src = station.url_resolved;
      audioPlayer.autoplay = true;
      audioPlayer.controls = true;
      audioPlayer.style.width = '100%';
      audioPlayer.style.marginTop = '10px';
  
      // Remove any existing audio players
      const existingAudio = iframeDiv.querySelector('audio');
      if (existingAudio) {
        existingAudio.remove();
      }
      iframeDiv.appendChild(audioPlayer);
    }

    // Register click for popularity tracking
    if (station.stationuuid) {
      this.radioService.registerStationClick(station.stationuuid);
    }

    this.isMusicControlsDisplayed(true);
  }

  async refreshPlaylist() {
    await this.getSongList().then(() => {
      this.updatePaginatedSongs();
      this.cdr.markForCheck();
    });
  }
}
