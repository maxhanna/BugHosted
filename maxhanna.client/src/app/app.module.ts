import { HttpClientModule } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { TaskComponent } from './task/task.component';
import { NavigationComponent } from './navigation/navigation.component';
import { FavouritesComponent } from './favourites/favourites.component';
import { CoinWatchComponent } from './coin-watch/coin-watch.component';
import { WeatherComponent } from './weather/weather.component';
import { MiningComponent } from './mining/mining.component';

@NgModule({
  declarations: [
    AppComponent,
    TaskComponent,
    NavigationComponent,
    FavouritesComponent,
    CoinWatchComponent,
    WeatherComponent,
    MiningComponent
  ],
  imports: [
    BrowserModule, HttpClientModule,
    AppRoutingModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
