import { AfterContentChecked, AfterViewInit, Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { Todo } from '../../services/datacontracts/todo';
import { TodoService } from '../../services/todo.service';
import { User } from '../../services/datacontracts/user';

@Component({
  selector: 'app-music',
  templateUrl: './music.component.html',
  styleUrl: './music.component.css'
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
    if (!this.user) {
      console.log("didnt get a user");
    }
    await this.getSongList(); 
    if (this.songs && this.songs[this.songs.length - 1] && this.songs[this.songs.length - 1].url) {
      this.play(this.songs[this.songs.length - 1].url!);
    }
    this.clearInputs();
    this.reorderTable(undefined, this.orderSelect.nativeElement.value);
    this.isMusicControlsDisplayed(false);
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
    const url = this.extractYouTubeVideoId(this.urlInput.nativeElement.value);
    const title = this.titleInput.nativeElement.value;
    if (!url || !title || url.trim() == "" || title.trim() == "") {
      return alert("Title or URL cannot be empty!");
    }
    let tmpTodo = new Todo();
    tmpTodo.type = "music";
    tmpTodo.url = url.trim();
    tmpTodo.todo = title.trim(); 

    await this.todoService.createTodo(this.parentRef?.user!, tmpTodo);
    this.ngOnInit();
  }
  async getSongList() {
    console.log("getting song list");
    if (this.songPlaylist && this.songPlaylist.length > 0) {
      console.log("songs were passed in");
      this.songs = this.songPlaylist;
    } else {
      console.log("manual song fetch");
      this.songs = await this.todoService.getTodo(this.user ?? this.parentRef?.user!, "Music");
    }
    this.gotPlaylistEvent.emit(this.songs);
  }
  async searchForSong() {
    const search = this.searchInput.nativeElement.value!;
    if (!search) {
      await this.getSongList();
      return this.reorderTable(undefined, this.orderSelect.nativeElement.value);
    }
    this.songs = await this.todoService.getTodo(this.parentRef?.user!, "Music", search);
    this.reorderTable(undefined, this.orderSelect.nativeElement.value);
  }
  async deleteSong(id: number) {
    await this.todoService.deleteTodo(this.parentRef?.user!, id);
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
    var playlist = [];
    const offset = this.songs.indexOf(this.songs.filter(x => x.url == url)[0]);
    for (var i = offset; i < this.songs.length; i++) {
      playlist.push(this.trimYoutubeUrl(this.songs[i].url!));
    }
    for (var i = 0; i < offset; i++) {
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
    var youtubeRegex = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    var match = url.match(youtubeRegex);

    if (match && match[1]) {
      return "https://www.youtube.com/watch?v=" + match[1];
    } else {
      return url;
    }
  }
  onSearchEnter(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      this.searchForSong();
    }
  }
}
