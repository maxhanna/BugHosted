import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, Input, NgZone, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
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
  isMenuPanelOpen = false;

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
  private locationSub?: SubscriptionLike;
  private radioAudioEl?: HTMLAudioElement;
  private screenLock?: any;
  private readonly instance = Math.random().toString(16).slice(2);
  private mo?: MutationObserver;
  private ytHealthTimer?: number;
  private playerReady = false;  // <- REAL ready state
  private pendingSwitch?: { ids: string[]; index: number; firstId: string };
  private lastPlaylistKey = '';
  private lastTap = 0; 
  private ytIds: string[] = [];
  private ytIndex = 0;
  private switching = false;
private ytDeadCount = 0;

  ytSearchTerm = '';

  @Input() user?: User;
  @Input() smallPlayer = false;
  @Input() inputtedParentRef?: AppComponent;
  @Output() gotPlaylistEvent = new EventEmitter<Array<Todo>>();

  constructor(private todoService: TodoService,
    private location: Location,
    private radioService: RadioService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
  ) {
    super();
    this.locationSub = this.location.subscribe(() => {
      if (this.isFullscreen) {
        this.closeFullscreen();
      }
    });
  }

  showMenuPanel() {
    if (this.isMenuPanelOpen) {
      this.closeMenuPanel();
      return;
    }
    this.isMenuPanelOpen = true;
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent) {
      try { parent.showOverlay(); } catch { }
    }
  }

  closeMenuPanel() {
    this.isMenuPanelOpen = false;
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent) {
      try { parent.closeOverlay(); } catch { }
    }
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
    if (document.visibilityState === 'visible') {
      if (this.isMusicPlaying) {
        try { this.ytPlayer?.playVideo(); } catch { }
      }
    }
  }

  async ngOnInit() {
    console.log('[Music]', this.instance, 'ngOnInit');
    await this.tryInitialLoad();
  }

  async ngAfterViewInit() {
    console.log('[Music]', this.instance, 'ngAfterViewInit');
    if (this.user) {
      this.componentMain.nativeElement.style.padding = 'unset';
    }
    await this.ensureYouTubeApi();
    if (!(window as any).YT?.Player) {
      console.error('[Music] YT still undefined after ensureYouTubeApi()');
      return;
    }

    this.ytReady = true;

    if (!this.ytPlayer && this.songs.length && this.songs[0]?.url) {
      const ids = this.getYoutubeIdsInOrder();
      const firstId = this.parseYoutubeId(this.songs[0].url!);
      let index = ids.indexOf(firstId);
      if (index < 0) { ids.unshift(firstId); index = 0; }

      // ✅ Recreate the player with URL-level playlist
      this.rebuildYTPlayer(firstId, ids, index);
    } else if (this.pendingPlay?.url) {
      this.consumePendingPlay();
    }

    this.observePlayerDom();
  }

  ngOnDestroy(): void {
    console.log('[Music]', this.instance, 'ngOnDestroy');
    console.trace('[Music] destroy stack');
 
    this.stopYtHealthWatch();
    try { this.ytPlayer?.stopVideo(); } catch { console.error("Error stopping YT video"); }
    try { this.ytPlayer?.destroy(); } catch { console.error("Error destroying YT player"); }
    this.ytPlayer = undefined;

    // Clear pending play queue
    this.pendingPlay = undefined;

    // Clear timers
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }

    // Unsubscribe from Location (and any other RxJS subscriptions)
    if (this.locationSub) {
      try { this.locationSub.unsubscribe(); } catch { }
      this.locationSub = undefined;
    }

    // Remove radio audio element
    if (this.radioAudioEl) {
      try { this.radioAudioEl.pause(); } catch { }
      try { this.radioAudioEl.remove(); } catch { }
      this.radioAudioEl = undefined;
    }

    this.mo?.disconnect();
  }

  private async tryInitialLoad() {
    const parent = this.inputtedParentRef ?? this.parentRef;
    const user = this.user ?? parent?.user;

    if (!user?.id) {
      await Promise.resolve();
    }
    await this.refreshPlaylist(); 
    
    if (this.songs.length && this.songs[0].url) {
      const url = this.songs[0].url!;
      if (!this.ytReady) this.pendingPlay = { url, fileId: null };
      else this.play(url);
    }

    console.log('[Music] Loaded', this.songs.length, 'songs; page', this.currentPage);
  }

async next() { this.playByIndex(this.ytIndex + 1); }
async prev() { this.playByIndex(this.ytIndex - 1); }


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
        const id = this.parseYoutubeId(s.url);
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
    this.startLoading();
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
      this.stopLoading();
      this.cdr.markForCheck();
    }
  }


  async searchForSong() {
    const search = this.searchInput?.nativeElement.value || '';
    const user = this.user ?? this.parentRef?.user;
    if (!user?.id) return;

    this.startLoading();
    if (!search) {
      await this.getSongList(); 
      this.rebuildLocalYtQueue(); 
    } else {
      const tmpSongs = await this.todoService.getTodo(user.id, "Music", search);
      this.youtubeSongs = tmpSongs.filter((song: Todo) => this.parentRef?.isYoutubeUrl(song.url));
      this.fileSongs = tmpSongs.filter((song: Todo) => !this.parentRef?.isYoutubeUrl(song.url));
      this.songs = this.selectedType === 'file' ? [...this.fileSongs] : [...this.youtubeSongs];
      this.currentPage = 1; // Reset to first page on search
      this.updatePaginatedSongs();
    }
    this.reorderTable(undefined, this.orderSelect?.nativeElement.value || 'Newest');
    this.stopLoading();
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
    const title = this.titleInput.nativeElement.value;
    if (!title || title.trim() === "") {
      alert("Title cannot be empty!");
      return;
    }
    const url = this.extractYouTubeVideoId(this.urlInput.nativeElement.value);
    if ((!url || url.trim() === '') && !this.selectedFile) {
      alert("Invalid YouTube URL!");
      return;
    }
    this.startLoading();
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
    this.stopLoading();
  }

  async deleteSong(id?: number) {
    if (!id) {
      this.parentRef?.showNotification("Invalid song ID");
      return;
    }
    if (!confirm("Deleting song. Are you sure?") || !this.parentRef?.user?.id) return;
    this.startLoading();
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
    this.stopLoading();
  }

  async selectType(type: 'youtube' | 'file' | 'radio') {
    this.selectedType = type;
    setTimeout(() => {
      try {
        this.stopMusic();
      } catch (e) {
        console.error(e);
      }
    }, 50);//allow for adjustment time

    if (type != 'radio') {
      const iframeDiv = document.getElementById('iframeDiv');
      const existingAudio = iframeDiv?.querySelector('audio');
      if (existingAudio) {
        existingAudio.remove();
      }
    }

    if (type != 'file') {
      this.fileIdPlaying = undefined;
      this.fileMediaViewer?.stopAllMedia();
    }

    if (type === 'radio') {
      this.loadRadioData();
    }
    else {
      this.currentPage = 1;
      await this.refreshPlaylist();  
      this.songs = type === 'file' ? [...this.fileSongs] : [...this.youtubeSongs];
      this.fileIdPlaylist = type === 'file' ? this.fileSongs.map(song => song.fileId!).filter(id => id !== undefined) : undefined;
    }
  }


  play(url?: string, fileId?: number) {
    console.log("Play called with url:", url, "fileId:", fileId);
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (!url && !fileId) {
      parent?.showNotification("Url/File can't be empty");
      return;
    }

    if (url) {
      const requestedId = this.parseYoutubeId(url);
      const currentId = this.ytPlayer?.getVideoData()?.video_id || this.parseYoutubeId(this.currentUrl || '');
      if (requestedId && currentId && requestedId === currentId) {
        return; // actually same video
      }
    }

    if (fileId != undefined && fileId === this.currentFileId) {
      parent?.showNotification("Already playing this file");
      return;
    }

    if (!this.ytReady && url) {
      this.pendingPlay = { url, fileId: null };
      console.log("YT API not ready, queuing play for url:", url);
      return;
    }
    this.startLoading();

    if (fileId) {
      this.fileIdPlaying = fileId;
      setTimeout(async () => {
        if (this.fileMediaViewer) {
          this.fileMediaViewer.resetSelectedFile();
          setTimeout(async () => {
            await this.fileMediaViewer.setFileSrcById(fileId);
            this.fileMediaViewer.unmuteAllMedia();
            this.stopLoading();
            this.cdr.markForCheck();
          }, 50);
        }
      }, 10);
      console.log("Playing file with ID:", fileId);
      return;
    }


const requestedId = this.parseYoutubeId(url!);
this.rebuildLocalYtQueue(); // ensure queue current
const idx = this.ytIds.indexOf(requestedId);
this.playByIndex(idx >= 0 ? idx : 0);
  
    // Update UI state
    this.currentUrl = url;
    this.currentFileId = null;
    this.isMusicPlaying = true;
    this.setupMediaSession();
    this.keepScreenAwake(true);
    this.isMusicControlsDisplayed(true);
    this.stopLoading();
  }



  randomSong() {
    if (this.selectedType === 'file') {
      const fileIds = (this.fileIdPlaylist || []).filter(id => id != null) as number[];
      if (fileIds.length) {
        const randomFileId = fileIds[Math.floor(Math.random() * fileIds.length)];
        this.play(undefined, randomFileId);
        return;
      }
    }

    if (this.selectedType !== 'youtube') return;

    const parent = this.inputtedParentRef ?? this.parentRef;
    const randomSong = this.pickRandomSong(this.songs);
    if (!randomSong) {
      parent?.showNotification('No songs available');
      return;
    }

    const ids = this.getYoutubeIdsInOrder();
    const rndId = this.parseYoutubeId(randomSong.url || '');
    if (!rndId || !ids.length) {
      parent?.showNotification('Invalid YouTube ID');
      return;
    }

    const rotated = this.rotatePlaylistFromId(ids, rndId);

    // ❗USE ensureYTPlayerBuilt — do NOT rebuild
    this.ensureYTPlayerBuilt(rotated[0], rotated, 0);

    this.currentUrl = randomSong.url;
    this.currentFileId = null;
    this.isMusicPlaying = true;
    this.isMusicControlsDisplayed(true);
    this.cdr.markForCheck();
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
      playlist.push(this.parseYoutubeId(this.songs[i].url || ''));
    }
    for (let i = 0; i < offset; i++) {
      playlist.push(this.parseYoutubeId(this.songs[i].url || ''));
    }
    return playlist;
  }

  private setupMediaSession() {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: 'Music', artist: '', album: '' });
      navigator.mediaSession.playbackState = 'playing';
      navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
      navigator.mediaSession.setActionHandler('previoustrack', () => this.prev());
    }
  }

  async keepScreenAwake(keep: boolean) {
    try {
      if (keep) this.screenLock = await (navigator as any).wakeLock?.request('screen');
      else await this.screenLock?.release();
    } catch { }
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

  pickRandomSong(array: Array<Todo>): Todo | undefined {
    const idx = Math.floor(Math.random() * array.length);
    return array[idx];
  }

  stopMusic() {
    this.isMusicPlaying = false;
    this.isMusicControlsDisplayed(false);

    // Stop YT without unloading the iframe
    try { this.ytPlayer?.stopVideo(); } catch { console.error("Error stopping YT video"); }

    // Stop file playback
    if (this.fileMediaViewer) {
      this.fileMediaViewer.resetSelectedFile();
    }
    this.fileIdPlaying = undefined;
    this.keepScreenAwake(false);
  }


  fullscreen() {
    const el = document.getElementById('iframeDiv');
    if (!el) return;

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      this.isFullscreen = true;
      el.requestFullscreen().catch(err => console.error(err));
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
    const id = this.parseYoutubeId(url);
    return id ? `https://www.youtube.com/watch?v=${id}` : '';
  }

  private observePlayerDom() {
    const el = this.musicVideo?.nativeElement;
    if (!el) return;

    this.mo = new MutationObserver(() => {
      const iframe = el.querySelector('iframe');
      if (!iframe) {
        console.warn('[YT] iframe missing! DOM likely replaced/cleared');
      }
    });

    this.mo.observe(el, { childList: true, subtree: true });
  }

  private rotatePlaylistFromId(allIds: string[], startId: string): string[] {
    if (!allIds.length) return [];
    const idx = Math.max(0, allIds.indexOf(startId));
    return allIds.slice(idx).concat(allIds.slice(0, idx));
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
    if (this.selectedType != "file") {
      return;
    }
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
        await this.todoService.editTodoUrlAndTitle(id, textInput.value, urlInput?.value).then(res => {
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
    this.titleInput.nativeElement.value = this.unescapeYoutubeTitle(video.title);
    await this.addSong();
    this.closeYoutubeSearch();
    this.cdr.markForCheck();
  }

  // Unescape common YouTube-escaped sequences (e.g. "\\u0026") then decode HTML entities
  private unescapeYoutubeTitle(input?: string): string {
    if (!input) return '';
    try {
      // Convert literal \uXXXX sequences to characters
      const unicodeFixed = input.replace(/\\u([0-9a-fA-F]{4})/g, (_m, g1) => String.fromCharCode(parseInt(g1, 16)));
      // Convert any remaining escaped slashes or quotes
      const simpleUnescaped = unicodeFixed.replace(/\\([\\"\/bfnrt])/g, (_m, g1) => {
        switch (g1) {
          case '\\': return '\\';
          case '"': return '"';
          case '/': return '/';
          case 'b': return '\b';
          case 'f': return '\f';
          case 'n': return '\n';
          case 'r': return '\r';
          case 't': return '\t';
          default: return g1;
        }
      });
      // Decode HTML entities
      const txt = document.createElement('textarea');
      txt.innerHTML = simpleUnescaped;
      return txt.value;
    } catch (e) {
      return input;
    }
  }
  closeEditPopup(editSong = true) {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => {
      if (this.parentRef) {
        this.parentRef.closeOverlay(false);
      }
      if (this.hasEditedSong && editSong) {
        this.editSong(this.isEditing[0]);
      }
      this.isEditing = [];
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

  
private rebuildYTPlayer(firstId: string, _unusedIds: string[], _unusedIndex: number) {
  if (!this.musicVideo?.nativeElement) return;
  this.playerReady = false;

  try { this.ytPlayer?.destroy(); } catch {}
  this.ytPlayer = undefined;

  this.ngZone.runOutsideAngular(() => {
    this.ytPlayer = new YT.Player(this.musicVideo.nativeElement, {
      videoId: firstId,
      playerVars: {
        playsinline: 1,
        rel: 0,
        modestbranding: 1,
        enablejsapi: 1,
        origin: window.location.origin,
        controls: 1,
      },
      events: {
        onReady: () => {
          this.playerReady = true;

          // load current selection
          try {
            this.ytPlayer!.loadVideoById(firstId);
            this.ytPlayer!.playVideo();
          } catch {}

          // set attributes
          try {
            const iframe = this.ytPlayer!.getIframe() as HTMLIFrameElement;
            iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
            iframe.setAttribute('referrerpolicy', 'origin-when-cross-origin');
          } catch {}

          this.ngZone.run(() => this.startYtHealthWatch());
        },

        onStateChange: (e) => {
          if (e.data === YT.PlayerState.ENDED) this.playByIndex(this.ytIndex + 1);
          if (e.data === YT.PlayerState.PLAYING) {
            const vid = this.ytPlayer?.getVideoData()?.video_id;
            if (vid) this.currentUrl = `https://www.youtube.com/watch?v=${vid}`;
          }
        },

        onError: () => this.playByIndex(this.ytIndex + 1),
      }
    });
  });
} 

  private ensureYTPlayerBuilt(firstId: string, songIds: string[], index: number) {
    // Build if missing
    if (!this.ytPlayer) {
      this.pendingSwitch = { ids: songIds, index, firstId };
      this.rebuildYTPlayer(firstId, songIds, index);
      return;
    }

    // Queue if player not ready yet
    if (!this.playerReady) {
      this.pendingSwitch = { ids: songIds, index, firstId };
      return;
    }

    // ✅ Switch immediately (no debounce timer)
    this.switchWithinPlaylist(songIds, index);
  }

  private async forceSwitchToId(videoId: string) {
    if (!this.ytPlayer) return;
    try {
      this.ytPlayer.loadVideoById(videoId);
      this.ytPlayer.playVideo();
    } catch (e) {
      console.warn('[YT] forceSwitchToId failed, rebuilding', e);
      this.rebuildYTPlayer(videoId, this.getYoutubeIdsInOrder(), 0);
    }
  }

  private switchWithinPlaylist(ids: string[], index: number) {
    if (!this.ytPlayer) return;

    const desiredId = ids[index];
    const beforeId = this.ytPlayer.getVideoData()?.video_id;

    try {
      const key = ids.join(',');
      const pl = this.ytPlayer.getPlaylist?.() || [];

      if (this.lastPlaylistKey === key && pl.length) {
        this.ytPlayer.playVideoAt(index);
        this.ytPlayer.playVideo();
      } else {
        this.lastPlaylistKey = key;
        this.ytPlayer.loadPlaylist(ids, index, 0, 'small');
        this.ytPlayer.playVideo();
      }
    } catch (e) {
      console.warn('[YT] switchWithinPlaylist failed', e);
      if (desiredId) this.forceSwitchToId(desiredId);
      return;
    }

    // ✅ Verify after a short moment: did the player actually change?
    setTimeout(() => {
      const afterId = this.ytPlayer?.getVideoData()?.video_id;
      if (desiredId && afterId && afterId !== desiredId) {
        console.warn('[YT] playlist command ignored, forcing loadVideoById', { desiredId, afterId });
        this.forceSwitchToId(desiredId);
      } else if (desiredId && !afterId) {
        // sometimes videoData not ready yet, still force
        this.forceSwitchToId(desiredId);
      }
    }, 250);
  }




  private handleEndedFallback() {
    // If there's a playlist attached, normal flow
    const pl = this.ytPlayer?.getPlaylist?.() || [];
    if (pl.length > 0) {
      this.next();
      return;
    }

    // Fallback: compute next using our own list
    const ids = this.getYoutubeIdsInOrder();
    if (!ids.length) return;

    const currentId =
      this.ytPlayer?.getVideoData()?.video_id ||
      this.parseYoutubeId(this.currentUrl || '') ||
      ids[0];

    const idx = Math.max(0, ids.indexOf(currentId));
    const nextIdx = (idx + 1) % ids.length;

    try {
      this.ytPlayer?.loadPlaylist(ids, nextIdx, 0, 'small');
      this.ytPlayer?.playVideo();
    } catch {
      // Last-chance single-video advance
      const nextId = ids[nextIdx];
      if (nextId) {
        this.ytPlayer?.loadVideoById(nextId);
        this.ytPlayer?.playVideo();
        // Re-attach a playlist for subsequent Next/Prev
        setTimeout(() => {
          try { this.ytPlayer?.cuePlaylist(ids, nextIdx, 0, 'small'); } catch { }
        }, 200);
      }
    }
  }

  async loadRadioData() {
    this.startLoading();
    this.isLoadingRadio = true;
    try {
      await Promise.all([
        this.fetchRadioCountries(),
        this.fetchRadioLanguages(),
        this.fetchRadioTags()
      ]);
      await this.fetchRadioStations();
    } catch (error) {
      console.error('Error loading radio data:', error);
    } finally {
      this.isLoadingRadio = false;
      this.stopLoading();
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
    this.startLoading();
    this.isLoadingRadio = true;
    try {
      this.radioStations = await this.radioService.fetchStations(this.radioFilters);
    } finally {
      this.isLoadingRadio = false;
      this.stopLoading();
    }
  }

  onRadioFilterChange(filterType: 'country' | 'language' | 'tag', event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    this.radioFilters[filterType] = value;
    this.fetchRadioStations();
  }

private rebuildLocalYtQueue() {
  this.ytIds = this.getYoutubeIdsInOrder();
  // keep index aligned if something already playing
  const current = this.ytPlayer?.getVideoData()?.video_id || this.parseYoutubeId(this.currentUrl || '');
  const idx = current ? this.ytIds.indexOf(current) : -1;
  if (idx >= 0) this.ytIndex = idx;
}

  async playRadioStation(station: RadioStation) {
    if (!station || !station.url_resolved) {
      alert('Invalid radio station URL');
      return;
    }
    this.startLoading();
    const iframeDiv = document.getElementById('iframeDiv');
    if (iframeDiv) {
      // Remove any existing instance we created
      if (this.radioAudioEl) {
        try { this.radioAudioEl.pause(); } catch { }
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
      await this.radioService.registerStationClick(station.stationuuid);
    }

    this.isMusicControlsDisplayed(true);
    this.stopLoading();
    this.cdr.markForCheck();
  }

  mediaViewerFinishedLoading() {
    this.cdr.markForCheck();
  }

private startYtHealthWatch() {
  this.stopYtHealthWatch();

  this.ytHealthTimer = window.setInterval(() => {
    if (!this.ytPlayer) return;

    try {
      // A lightweight call that should work if the bridge is alive
      this.ytPlayer.getCurrentTime();
      this.ytDeadCount = 0;
    } catch {
      this.ytDeadCount++;
      console.warn('[YT] health ping failed', this.ytDeadCount);

      // after a couple failures, rebuild
      if (this.ytDeadCount >= 2) {
        this.ytDeadCount = 0;

        const id =
          this.ytPlayer?.getVideoData()?.video_id ||
          this.parseYoutubeId(this.currentUrl || '') ||
          this.ytIds[this.ytIndex];

        if (id) {
          console.warn('[YT] rebuilding after suspected crash', id);
          this.rebuildYTPlayer(id, [], 0); // see below, simplified rebuild
        }
      }
    }
  }, 4000);
}

private stopYtHealthWatch() {
  if (this.ytHealthTimer) {
    clearInterval(this.ytHealthTimer);
    this.ytHealthTimer = undefined;
  }
}


  private parseYoutubeId(url: string): string {
    if (!url) return '';
    try {
      const u = new URL(url);
      const host = u.hostname.replace('www.', '');

      // youtu.be/<id>
      if (host === 'youtu.be') {
        // path is "/<id>" possibly followed by segments; strip query/fragment
        const id = u.pathname.split('/').filter(Boolean)[0] || '';
        return id.split('?')[0].split('#')[0];
      }

      // youtube.com/watch?v=<id>
      const v = u.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;

      // youtube.com/embed/<id>
      const embed = u.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
      if (embed) return embed[1];

      // youtube.com/shorts/<id>
      const shorts = u.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
      if (shorts) return shorts[1];
    } catch {
      // Fallback regex if URL constructor fails
      const m =
        url.match(/[?&]v=([a-zA-Z0-9_-]{11})/) ||
        url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/) ||
        url.match(/\/embed\/([a-zA-Z0-9_-]{11})/) ||
        url.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
      if (m) return m[1];
    }
    return '';
  }
  
private playByIndex(index: number) {
  if (!this.ytIds.length) return;

  this.ytIndex = (index + this.ytIds.length) % this.ytIds.length;
  const id = this.ytIds[this.ytIndex];

  // update your URL state
  this.currentUrl = `https://www.youtube.com/watch?v=${id}`;
  this.currentFileId = null;
  this.isMusicPlaying = true;

  // If player not ready, queue it
  if (!this.ytReady || !this.ytPlayer || !this.playerReady) {
    this.pendingPlay = { url: this.currentUrl, fileId: null };
    return;
  }

  // 🔥 Always direct-load the video
  try {
    this.switching = true;
    this.ytPlayer.loadVideoById(id);
    this.ytPlayer.playVideo();
  } finally {
    setTimeout(() => (this.switching = false), 250);
  }
}

  async refreshDom() {
    setTimeout(() => {
      this.cdr.markForCheck();
    }, 50);
  }
  async refreshPlaylist() {
    await this.getSongList().then(() => {
      this.updatePaginatedSongs();
      this.cdr.markForCheck();
    }); 
    this.rebuildLocalYtQueue(); 
  }
}