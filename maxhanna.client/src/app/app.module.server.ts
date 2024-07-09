import { NgModule } from '@angular/core';
import { ServerModule } from '@angular/platform-server';

import { AppModule } from './app.module';
import { AppComponent } from './app.component';
import { RouterModule } from '@angular/router';
import { CalendarComponent } from './calendar/calendar.component';
import { NavigationComponent } from './navigation/navigation.component';
import { BrowserModule } from '@angular/platform-browser';
import { AppRoutingModule } from './app-routing.module';
import { ChatComponent } from './chat/chat.component';
import { CoinWalletComponent } from './coin-wallet/coin-wallet.component';
import { CoinWatchComponent } from './coin-watch/coin-watch.component';
import { CommentsComponent } from './comments/comments.component';
import { ContactsComponent } from './contacts/contacts.component';
import { EmulationComponent } from './emulation/emulation.component';
import { FavouritesComponent } from './favourites/favourites.component';
import { FileSearchComponent } from './file-search/file-search.component';
import { FileUploadComponent } from './file-upload/file-upload.component';
import { FileComponent } from './file/file.component';
import { LineGraphComponent } from './line-graph/line-graph.component';
import { MediaSelectorComponent } from './media-selector/media-selector.component';
import { MediaViewerComponent } from './media-viewer/media-viewer.component';
import { MemeComponent } from './meme/meme.component';
import { MiningDevicesComponent } from './mining-devices/mining-devices.component';
import { MiningRigsComponent } from './mining-rigs/mining-rigs.component';
import { MusicComponent } from './music/music.component';
import { NewsComponent } from './news/news.component';
import { NotepadComponent } from './notepad/notepad.component';
import { ReactionComponent } from './reaction/reaction.component';
import { SocialComponent } from './social/social.component';
import { TodoComponent } from './todo/todo.component';
import { TopicsComponent } from './topics/topics.component';
import { UpdateUserSettingsComponent } from './update-user-settings/update-user-settings.component';
import { UserListComponent } from './user-list/user-list.component';
import { UserTagComponent } from './user-tag/user-tag.component';
import { UserComponent } from './user/user.component';
import { WeatherComponent } from './weather/weather.component';
import { WordlerComponent } from './wordler/wordler.component';

@NgModule({

  declarations: [
    AppComponent,
    CalendarComponent,
    NavigationComponent,
    FavouritesComponent,
    WeatherComponent,
    MiningDevicesComponent,
    FileComponent,
    MiningRigsComponent,
    TodoComponent,
    NotepadComponent,
    MusicComponent,
    ContactsComponent,
    CoinWalletComponent,
    UserComponent,
    CoinWatchComponent,
    ChatComponent,
    UserListComponent,
    MemeComponent,
    SocialComponent,
    FileUploadComponent,
    NewsComponent,
    TopicsComponent,
    WordlerComponent,
    FileSearchComponent,
    MediaViewerComponent,
    UpdateUserSettingsComponent,
    CommentsComponent,
    MediaSelectorComponent,
    EmulationComponent,
    UserTagComponent,
    ReactionComponent
  ],
  bootstrap: [AppComponent],
  imports: [BrowserModule,
    LineGraphComponent,
    RouterModule,
    AppRoutingModule],
})
export class AppServerModule {}
