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
import { MiningDevicesComponent } from './mining-devices/mining-devices.component';
import { FilesComponent } from './files/files.component';
import { MiningRigsComponent } from './mining-rigs/mining-rigs.component';

@NgModule({
  declarations: [
    AppComponent,
    CalendarComponent,
    NavigationComponent,
    FavouritesComponent,
    CoinWatchComponent,
    WeatherComponent,
    MiningDevicesComponent,
    FilesComponent,
    MiningRigsComponent
  ],
  imports: [
    BrowserModule, HttpClientModule,
    AppRoutingModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
