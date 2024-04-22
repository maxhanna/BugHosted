import { HttpClient } from '@angular/common/http';
import { Component, ComponentRef, OnInit, ViewChild, ViewContainerRef } from '@angular/core';
import { TaskComponent } from './task/task.component';
import { CoinWatchComponent } from './coin-watch/coin-watch.component';
import { FavouritesComponent } from './favourites/favourites.component';
import { WeatherComponent } from './weather/weather.component';
import { MiningComponent } from './mining/mining.component';


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'Task';

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
      else if (componentType == "Task") {
        componentClass = TaskComponent;
      }
      else if (componentType == "Weather") {
        componentClass = WeatherComponent;
      }
      else if (componentType == "Mining") {
        componentClass = MiningComponent;
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
