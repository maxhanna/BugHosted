import { HttpClientModule } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { CalendarComponent } from './calendar/calendar.component';
import { NavigationComponent } from './navigation/navigation.component';
import { FavouritesComponent } from './favourites/favourites.component';
import { CoinWatchComponent } from './coin-watch/coin-watch.component';
import { WeatherComponent } from './weather/weather.component';
import { MiningComponent } from './mining/mining.component';
import { FilesComponent } from './files/files.component';

@NgModule({
  declarations: [
    AppComponent,
    CalendarComponent,
    NavigationComponent,
    FavouritesComponent,
    CoinWatchComponent,
    WeatherComponent,
    MiningComponent,
    FilesComponent
  ],
  imports: [
    BrowserModule, HttpClientModule,
    AppRoutingModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
