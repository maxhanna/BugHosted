import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { Todo } from '../todo';
import { lastValueFrom } from 'rxjs';
import { HttpClient, HttpParams } from '@angular/common/http';

@Component({
  selector: 'app-music',
  templateUrl: './music.component.html',
  styleUrl: './music.component.css'
})
export class MusicComponent extends ChildComponent implements OnInit {
  @ViewChild('titleInput') titleInput!: ElementRef<HTMLInputElement>;
  @ViewChild('urlInput') urlInput!: ElementRef<HTMLInputElement>;
  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;
  @ViewChild('musicVideo') musicVideo!: ElementRef<HTMLIFrameElement>;
  songs: Array<Todo> = [];
  orders: Array<string> = ["Newest", "Oldest", "Alphanumeric ASC", "Alphanumeric DESC", "Random"];

  constructor(private http: HttpClient) { super(); }
  async ngOnInit() {
    await this.getSongList();
    this.clearInputs();
    this.reorderTable(undefined, this.orders[0]);
    this.isMusicControlsDisplayed(false);
  }
  play(url: string) {
    const playlist = this.getPlaylistForYoutubeUrl(url).join(',');
    const trimmedUrl = this.trimYoutubeUrl(url);
    const target = `https://www.youtube.com/embed/${trimmedUrl}?playlist=${playlist}&autoplay=1&vq=tiny`;
    this.musicVideo.nativeElement.src = target;
    this.isMusicControlsDisplayed(true);
  }
  async addSong() {
    const url = this.extractYouTubeVideoId(this.urlInput.nativeElement.value);
    const title = this.titleInput.nativeElement.value;
    if (!url || !title || url.trim() == "" || title.trim() == "") {
      return alert("Title or URL cannot be empty!");
    }
    let tmpTodo = new Todo();
    tmpTodo.type = "music";
    tmpTodo.url = url.trim();
    tmpTodo.todo = title.trim();

    const headers = { 'Content-Type': 'application/json' };
    const body = JSON.stringify(tmpTodo);
    await this.promiseWrapper(lastValueFrom(this.http.post(`/todo/`, body, { headers })));
    this.ngOnInit();
  }
  async getSongList() {
    const params = new HttpParams().set('type', "Music");
    await this.promiseWrapper(lastValueFrom(this.http.get<Array<Todo>>('/todo', { params })).then(res => this.songs = res));
  }
  async searchForSong() {
    const search = this.searchInput.nativeElement.value!;
    if (!search) {
      this.getSongList();
    }
    const params = new HttpParams().set('search', search);
    await this.promiseWrapper(lastValueFrom(this.http.get<Array<Todo>>('/todo', { params })).then(res => this.songs = res));
  }
  async deleteSong(id: number) {
    const response = await this.promiseWrapper(await lastValueFrom(this.http.delete(`/todo/${id}`)));
    if (document.getElementById("songId" + id)) {
      document.getElementById("songId" + id)!.style.textDecoration = "line-through";
    }
    this.clearInputs();
  }
  randomSong() {
    this.play(this.songs[Math.floor(Math.random() * this.songs.length)].url!);
  }
  followLink() {
    window.open(this.musicVideo.nativeElement.src);
    this.stopMusic();
  }
  reorderTable(event?: Event, targetOrder?: string) {
    if (!event && !targetOrder) return;
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
    var offset = this.songs.indexOf(this.songs.filter(x => x.url == url)[0]);
    for (var i = 0; i < this.songs.length; i++) {
      var pointer = (i + offset) % this.songs.length;
      playlist.push(this.trimYoutubeUrl(this.songs[pointer].url!));
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
    this.musicVideo.nativeElement.src = "";
    document.getElementById("musicControls")!.style.display = "none";
    this.isMusicControlsDisplayed(false);
  }
  trimYoutubeUrl(url: string) {
    if (url.includes("youtu.be")) {
      return url.substring(url.indexOf("youtu.be/") + 9, url.length);
    }
    return url.substring(url.indexOf("?v=") + 3, url.length);
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
}
