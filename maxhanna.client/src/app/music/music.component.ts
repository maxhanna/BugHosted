import { AfterContentChecked, AfterViewInit, Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { Todo } from '../../services/datacontracts/todo';
import { TodoService } from '../../services/todo.service';
import { User } from '../../services/datacontracts/user/user';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { MediaSelectorComponent } from '../media-selector/media-selector.component';
import { MediaViewerComponent } from '../media-viewer/media-viewer.component';

@Component({
  selector: 'app-music',
  templateUrl: './music.component.html',
  styleUrl: './music.component.css',
  standalone: false
})
export class MusicComponent extends ChildComponent implements OnInit, AfterViewInit {
  @ViewChild('titleInput') titleInput!: ElementRef<HTMLInputElement>;
  @ViewChild('urlInput') urlInput!: ElementRef<HTMLInputElement>;
  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;
  @ViewChild('musicVideo') musicVideo!: ElementRef<HTMLIFrameElement>;
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
  selectedType: 'youtube' | 'file' = 'youtube';
  isEditing: number[] = [];
  showHelpPopup = false;

  @Input() user?: User;
  @Input() songPlaylist?: Todo[];
  @Input() smallPlayer = false;
  @Output() gotPlaylistEvent = new EventEmitter<Array<Todo>>();

  constructor(private todoService: TodoService) { super(); }

  async ngOnInit() {
    await this.getSongList();
    this.updatePaginatedSongs();
    if (this.songs && this.songs[0] && this.songs[0].url) {
      this.play(this.songs[0].url!);
    }
    this.clearInputs();
    this.reorderTable(undefined, this.orderSelect?.nativeElement.value || 'Newest');
    this.isMusicControlsDisplayed((this.songs && this.songs[0] && this.songs[0].url) ? true : false);
  }

  async ngAfterViewInit() {
    if (this.user) {
      this.componentMain.nativeElement.style.padding = "unset";
    }
  }

  async getSongList() {
    if (this.songPlaylist && this.songPlaylist.length > 0) {
      this.songs = [...this.songPlaylist]; // Create a copy to avoid modifying input
    } else {
      const user = this.user ?? this.parentRef?.user;
      if (!user?.id) return;
      const tmpSongs = await this.todoService.getTodo(user.id, "Music");
      this.youtubeSongs = tmpSongs.filter((song: Todo) => this.parentRef?.isYoutubeUrl(song.url));
      this.fileSongs = tmpSongs.filter((song: Todo) => !this.parentRef?.isYoutubeUrl(song.url));
      this.songs = this.selectedType === 'file' ? [...this.fileSongs] : [...this.youtubeSongs];
    }
    this.updatePaginatedSongs();
    this.gotPlaylistEvent.emit(this.songs);
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
    }
    this.currentPage = 1; // Reset to first page on search
    this.updatePaginatedSongs();
    this.reorderTable(undefined, this.orderSelect?.nativeElement.value || 'Newest');
  }

  updatePaginatedSongs() {
    this.totalPages = Math.ceil(this.songs.length / this.itemsPerPage) || 1;
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    this.paginatedSongs = this.songs.slice(startIndex, startIndex + this.itemsPerPage);
  }

  goToPreviousPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.updatePaginatedSongs();
    }
  }

  goToNextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.updatePaginatedSongs();
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
  }

  selectType(type: 'youtube' | 'file') {
    this.selectedType = type;
    this.songs = type === 'file' ? [...this.fileSongs] : [...this.youtubeSongs];
    this.fileIdPlaylist = type === 'file' ? this.fileSongs.map(song => song.fileId!).filter(id => id !== undefined) : undefined;
    this.currentPage = 1;
    this.updatePaginatedSongs();
    this.reorderTable(undefined, this.orderSelect?.nativeElement.value || 'Newest');
  }

  play(url?: string, fileId?: number) {
    if (!url && !fileId) {
      alert("Url/File can't be empty");
      return;
    }
    this.isMusicPlaying = true;
    if (url) {
      const playlist = this.getPlaylistForYoutubeUrl(url).join(',');
      const trimmedUrl = this.trimYoutubeUrl(url);
      const target = `https://www.youtube.com/embed/${trimmedUrl}?playlist=${playlist}&autoplay=1&vq=tiny`;
      setTimeout(() => {
        this.musicVideo.nativeElement.src = target;
      }, 1);
    } else if (fileId) {
      this.fileIdPlaying = fileId;
      setTimeout(() => {
        this.fileMediaViewer.resetSelectedFile();
        this.fileMediaViewer.setFileSrcById(fileId);
      }, 50);
    }
    this.isMusicControlsDisplayed(true);
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
    const currUrl = this.musicVideo.nativeElement.src;
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
    this.musicVideo.nativeElement.src = "";
    this.isMusicControlsDisplayed(false);
  }

  trimYoutubeUrl(url: string) {
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
      document.getElementById("openPlaylistButton")
    ];
    elements.forEach(el => {
      if (el) el.style.display = setter ? "inline-block" : "none";
    });
  }

  extractYouTubeVideoId(url: string) {
    const youtubeRegex = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(youtubeRegex);
    return match && match[1] ? `https://www.youtube.com/watch?v=${match[1]}` : url;
  }

  onSearchEnter() {
    clearTimeout(this.debounceTimer);
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
    if (!this.isEditing.includes(id)) {
      this.isEditing.push(id);
    } else {
      const todoDiv = document.getElementById('songId' + id) as HTMLTableCellElement;
      const textInput = document.getElementById("editSongNameInput") as HTMLInputElement;

      try {
        await this.todoService.editTodo(id, textInput.value);
        const todoIndex = this.songs.findIndex(todo => todo.id === id);
        if (todoIndex !== -1) {
          this.songs[todoIndex].todo = textInput.value;
        }
        this.isEditing = this.isEditing.filter(x => x !== id);
      } catch (error) {
        console.error("Error updating todo:", error);
        this.parentRef?.showNotification("Failed to update todo");
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
}