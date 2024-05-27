import { Component, ComponentRef, OnInit, ViewChild, ViewContainerRef } from '@angular/core';
import { CalendarComponent } from './calendar/calendar.component';
import { CoinWatchComponent } from './coin-watch/coin-watch.component';
import { FavouritesComponent } from './favourites/favourites.component';
import { WeatherComponent } from './weather/weather.component';
import { MiningDevicesComponent } from './mining-devices/mining-devices.component';
import { FileComponent } from './file/file.component';
import { MiningRigsComponent } from './mining-rigs/mining-rigs.component';
import { TodoComponent } from './todo/todo.component';
import { ContactsComponent } from './contacts/contacts.component';
import { NotepadComponent } from './notepad/notepad.component';
import { MusicComponent } from './music/music.component';
import { GameComponent } from './game/game.component';
import { CoinWalletComponent } from './coin-wallet/coin-wallet.component';
import { GbcComponent } from './gbc/gbc.component';
import { UserComponent } from './user/user.component';
import { User } from '../services/datacontracts/user';
import { MenuItem } from '../services/datacontracts/menu-item';
import { ChatComponent } from './chat/chat.component';


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  user: User | undefined = undefined;
  @ViewChild("viewContainerRef", { read: ViewContainerRef }) VCR!: ViewContainerRef;
  child_unique_key: number = 0;
  componentsReferences = Array<ComponentRef<any>>()
  navigationItems = [
    { icon: "📕", title: "Close Menu", content: '' },
    { icon: "🔍", title: "Favourites", content: undefined },
    { icon: "📅", title: "Calendar", content: undefined },
    { icon: "⛏️", title: "MiningDevices", content: undefined },
    { icon: "🖥️", title: "MiningRigs", content: undefined },
    { icon: "☀️", title: "Weather", content: '' },
    { icon: "✔️", title: "Todo", content: undefined },
    { icon: "🎼", title: "Music", content: undefined },
    { icon: "📁", title: "Files", content: undefined },
    { icon: "🗒️", title: "Notepad", content: undefined },
    { icon: "📇", title: "Contacts", content: undefined },
    { icon: "G", title: "Game", content: undefined },
    { icon: "🎮", title: "Gameboy Color", content: undefined },
    { icon: "💵", title: "Coin-Wallet", content: undefined },
    { icon: "₿", title: "Coin-Watch", content: undefined },
    { icon: "🗨️", title: "Chat", content: undefined },
    { icon: "👤", title: "User", content: undefined },
  ]; 
  selectedMenuItems: Array<MenuItem> = []
  constructor() {
    if (this.getCookie("user")) {
      this.user = JSON.parse(this.getCookie("user"));
    } else {
      setTimeout(() => this.createComponent("User"), 0); //setTimeout required to avoid ChangeDetectorRef error
    }
  }
  ngOnInit() {
   
  } 
  createComponent(componentType: string) {
    if (componentType && componentType.trim() != "") {
      let componentClass = null;
      if (componentType == "Favourites") {
        componentClass = FavouritesComponent;
      }
      else if (componentType == "Coin-Watch") {
        componentClass = CoinWatchComponent;
      }
      else if (componentType == "Calendar") {
        componentClass = CalendarComponent;
      }
      else if (componentType == "Weather") {
        componentClass = WeatherComponent;
      }
      else if (componentType == "MiningDevices") {
        componentClass = MiningDevicesComponent;
      }
      else if (componentType == "MiningRigs") {
        componentClass = MiningRigsComponent;
      }
      else if (componentType == "Files") {
        componentClass = FileComponent;
      }
      else if (componentType == "Todo") {
        componentClass = TodoComponent;
      }
      else if (componentType == "Music") {
        componentClass = MusicComponent;
      }
      else if (componentType == "Notepad") {
        componentClass = NotepadComponent;
      }
      else if (componentType == "Contacts") {
        componentClass = ContactsComponent;
      }
      else if (componentType == "Game") {
        componentClass = GameComponent;
      }
      else if (componentType == "Gameboy Color") {
        componentClass = GbcComponent;
      }
      else if (componentType == "Coin-Wallet") {
        componentClass = CoinWalletComponent;
      }
      else if (componentType == "User") {
        componentClass = UserComponent;
      }
      else if (componentType == "Chat") {
        componentClass = ChatComponent;
      }

      if (componentClass) {
        const childComponentRef = this.VCR.createComponent(componentClass);

        let childComponent = childComponentRef.instance;
        childComponent.unique_key = ++this.child_unique_key;
        childComponent.parentRef = this; 
        // add reference for newly created component
        this.componentsReferences.push(childComponentRef);
      }
    }
  } 
  removeComponent(key: number) {
    if (this.VCR.length < 1) return;

    const componentRef = this.componentsReferences.filter(
      x => x.instance.unique_key == key
    )[0];

    for (let x = 0; x < this.VCR.length; x++) {
      if ((this.VCR.get(x)) == componentRef.hostView) {
        this.VCR.remove(x);
        componentRef.destroy();
      }
    }

    this.componentsReferences = this.componentsReferences.filter(
      x => x.instance.unique_key !== key
    );
  }
  getCookie(name: string) {
    let ca: Array<string> = document.cookie.split(';');
    let caLen: number = ca.length;
    let cookieName = `${name}=`;
    let c: string;

    for (let i: number = 0; i < caLen; i += 1) {
      c = ca[i].replace(/^\s+/g, '');
      if (c.indexOf(cookieName) == 0) {
        return c.substring(cookieName.length, c.length);
      }
    }
    return '';
  } 
  deleteCookie(name: string) {
    this.setCookie(name, '', -1);
  }
  setCookie(name: string, value: string, expireDays: number, path: string = '') {
    let d: Date = new Date();
    d.setTime(d.getTime() + expireDays * 24 * 60 * 60 * 1000);
    let expires: string = `expires=${d.toUTCString()}`;
    let cpath: string = path ? `; path=${path}` : '';
    document.cookie = `${name}=${value}; ${expires}${cpath}`;
  }
}
