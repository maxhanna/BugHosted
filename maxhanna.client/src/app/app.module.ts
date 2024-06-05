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
import { FileComponent } from './file/file.component';
import { MiningRigsComponent } from './mining-rigs/mining-rigs.component';
import { TodoComponent } from './todo/todo.component';
import { NotepadComponent } from './notepad/notepad.component';
import { MusicComponent } from './music/music.component';
import { ContactsComponent } from './contacts/contacts.component';
import { CoinWalletComponent } from './coin-wallet/coin-wallet.component';
import { GbcComponent } from './gbc/gbc.component';
import { UserComponent } from './user/user.component';
import { ChatComponent } from './chat/chat.component';
import { UserListComponent } from './user-list/user-list.component';
import { MemeComponent } from './meme/meme.component';
import { SocialComponent } from './social/social.component';
import { FileUploadComponent } from './file-upload/file-upload.component';
import { NewsComponent } from './news/news.component';
import { TopicsComponent } from './topics/topics.component';

@NgModule({
  declarations: [
    AppComponent,
    CalendarComponent,
    NavigationComponent,
    FavouritesComponent,
    CoinWatchComponent,
    WeatherComponent,
    MiningDevicesComponent,
    FileComponent,
    MiningRigsComponent,
    TodoComponent,
    NotepadComponent,
    MusicComponent,
    ContactsComponent, 
    CoinWalletComponent,
    GbcComponent,
    UserComponent,
    ChatComponent,
    UserListComponent,
    MemeComponent,
    SocialComponent,
    FileUploadComponent,
    NewsComponent,
    TopicsComponent
  ],
  imports: [
    BrowserModule, HttpClientModule,
    AppRoutingModule
  ], 
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
