import { Component, ComponentRef, ElementRef, OnInit, ViewChild, ViewContainerRef } from '@angular/core';
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


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {

  @ViewChild("viewContainerRef", { read: ViewContainerRef }) VCR!: ViewContainerRef;
  child_unique_key: number = 0;
  componentsReferences = Array<ComponentRef<any>>()

  constructor() { }

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
      else if (componentType == "Coin-Wallet") {
        componentClass = CoinWalletComponent;
      }

      if (componentClass != null) {
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
      }
    }

    this.componentsReferences = this.componentsReferences.filter(
      x => x.instance.unique_key !== key
    );
  }
  
}