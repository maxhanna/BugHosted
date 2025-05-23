import { AfterContentChecked, AfterViewInit, Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { Todo } from '../../services/datacontracts/todo';
import { TodoService } from '../../services/todo.service'; 
import { User } from '../../services/datacontracts/user/user';

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
  songs: Array<Todo> = [];
  orders: Array<string> = ["Newest", "Oldest", "Alphanumeric ASC", "Alphanumeric DESC", "Random"];
  isMusicPlaying = false;
  @Input() user?: User;
  @Input() songPlaylist?: Todo[];
  @Input() smallPlayer = false;
  @Output() gotPlaylistEvent = new EventEmitter<Array<Todo>>();

  constructor(private todoService: TodoService) { super(); }
  async ngOnInit() {
    await this.getSongList(); 
    if (this.songs && this.songs[0] && this.songs[0].url) {
      this.play(this.songs[0].url!);
    }
    this.clearInputs();
    this.reorderTable(undefined, this.orderSelect.nativeElement.value);
    this.isMusicControlsDisplayed((this.songs && this.songs[this.songs.length - 1] && this.songs[this.songs.length - 1].url) ? true : false);
  }
  async ngAfterViewInit() {
    if (this.user) { 
      this.componentMain.nativeElement.style.padding = "unset";
    }
  }
  play(url: string) {
    if (url == '') { return alert("Url cant be empty"); }
    this.isMusicPlaying = true;
    const playlist = this.getPlaylistForYoutubeUrl(url).join(',')
    const trimmedUrl = this.trimYoutubeUrl(url);
    const target = `https://www.youtube.com/embed/${trimmedUrl}?playlist=${playlist}&autoplay=1&vq=tiny`;
    setTimeout(() => {
      this.musicVideo.nativeElement.src = target;
    }, 1)
    this.isMusicControlsDisplayed(true);
  }
  async addSong() {
    if (this.user) { alert("Cant add song on another persons list"); }
    if (!this.parentRef?.user?.id) { return alert("You must be logged in to add to the music list."); }
    const url = this.extractYouTubeVideoId(this.urlInput.nativeElement.value);
    const title = this.titleInput.nativeElement.value;
    if (!url || !title || url.trim() == "" || title.trim() == "") {
      return alert("Title & URL cannot be empty!");
    }
    let tmpTodo = new Todo();
    tmpTodo.type = "music";
    tmpTodo.url = url.trim();
    tmpTodo.todo = title.trim(); 

    const resTodo = await this.todoService.createTodo(this.parentRef.user.id, tmpTodo);
    if (resTodo) {
      tmpTodo.id = parseInt(resTodo); 
      this.songs.unshift(tmpTodo);
      this.titleInput.nativeElement.value = '';
      this.urlInput.nativeElement.value = '';
    }
  }
  async getSongList() {
    if (this.songPlaylist && this.songPlaylist.length > 0) {
      this.songs = this.songPlaylist;
    } else {
      const user = this.user ?? this.parentRef?.user;
      if (!user?.id) return;
      this.songs = await this.todoService.getTodo(user.id, "Music");
    }
    this.gotPlaylistEvent.emit(this.songs);
  }
  async searchForSong() {
    const search = this.searchInput.nativeElement.value!;
    if (!search) {
      await this.getSongList();
      return this.reorderTable(undefined, this.orderSelect.nativeElement.value);
    }
    if (this.parentRef?.user?.id) { 
      this.songs = await this.todoService.getTodo(this.parentRef.user.id, "Music", search);
    }
    this.reorderTable(undefined, this.orderSelect.nativeElement.value);
  }
  async deleteSong(id: number) {
    if (!confirm("Deleting song. Are you sure?") || !this.parentRef?.user?.id) { return; }
    await this.todoService.deleteTodo(this.parentRef.user.id, id);
    if (document.getElementById("songId" + id)) {
      document.getElementById("songId" + id)!.style.textDecoration = "line-through";
    }
    this.clearInputs();
  }
  randomSong() {
    this.play(this.songs[Math.floor(Math.random() * this.songs.length)].url!);
  }
  followLink() {
    const currUrl = this.musicVideo.nativeElement.src;
    const regex = /\/embed[^?]+\?playlist=/;
    const newUrl = currUrl.replace(regex, "/watch_videos?video_ids=");

    window.open(newUrl);
    this.stopMusic();
  }
  reorderTable(event?: Event, targetOrder?: string) {
    if (!event && !targetOrder || this.songs.length == 0 || !this.songs.sort) return;
    const order = event ? (event.target as HTMLSelectElement).value : targetOrder;

    switch (order) {
      case "Alphanumeric ASC":
        this.songs.sort((a, b) => a.todo!.localeCompare(b.todo!));
        break;
      case "Alphanumeric DESC":
        this.songs.sort((a, b) => b.todo!.localeCompare(a.todo!));
        break;
      case "Newest":
        this.songs.sort((a, b) => new Date(b.date!).getTime() - new Date(a.date!).getTime());
        break;
      case "Oldest":
        this.songs.sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime());
        break;
      case "Random":
        this.shuffleSongs(this.songs);
        break;
      default:
        this.songs.sort((a, b) => a.todo!.localeCompare(b.todo!));
    }
  }
  getPlaylistForYoutubeUrl(url: string): string[] {
    let playlist = [];
    let offset = this.songs.indexOf(this.songs.find(x => x.url == url)!);
    if (offset < 0) { offset = 0; }
    for (let i = offset; i < this.songs.length; i++) {
      playlist.push(this.trimYoutubeUrl(this.songs[i].url!));
    }
    for (let i = 0; i < offset; i++) {
      playlist.push(this.trimYoutubeUrl(this.songs[i].url!));
    }
    return playlist;
  }
  clearInputs() {
    if (this.searchInput)
      this.searchInput.nativeElement.value = "";
    if (this.titleInput)
      this.titleInput.nativeElement.value = "";
    if (this.urlInput)
      this.urlInput.nativeElement.value = "";
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
      console.error("URL doesn't contain v parameter : " + url);
      return '';
    }
  }
  isMusicControlsDisplayed(setter: boolean) {
    if (document.getElementById("stopMusicButton")) {
      document.getElementById("stopMusicButton")!.style.display = setter ? "inline-block" : "none";
    }
    if (document.getElementById("followLinkButton")) {
      document.getElementById("followLinkButton")!.style.display = setter ? "inline-block" : "none";
    }
    if (document.getElementById("followLinkButton")) {
      document.getElementById("followLinkButton")!.style.display = setter ? "inline-block" : "none";
    }
    if (document.getElementById("openPlaylistButton")) {
      document.getElementById("openPlaylistButton")!.style.display = setter ? "inline-block" : "none";
    }
  }
  extractYouTubeVideoId(url: string) {
    const youtubeRegex = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(youtubeRegex);

    if (match && match[1]) {
      return "https://www.youtube.com/watch?v=" + match[1];
    } else {
      return url;
    }
  }
  onSearchEnter() { 
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.searchForSong();
    }, 100); 
  }
}
