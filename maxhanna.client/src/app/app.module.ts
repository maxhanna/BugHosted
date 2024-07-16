import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import {
  provideCharts,
  withDefaultRegisterables,
} from 'ng2-charts';

import { AppRoutingModule } from './app-routing.module';
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
import { WordlerComponent } from './wordler/wordler.component';
import { AppComponent } from './app.component';
import { MediaViewerComponent } from './media-viewer/media-viewer.component';
import { FileSearchComponent } from './file-search/file-search.component';
import { UpdateUserSettingsComponent } from './update-user-settings/update-user-settings.component';
import { CommentsComponent } from './comments/comments.component'; 
import { EmulationComponent } from './emulation/emulation.component';
import { UserTagComponent } from './user-tag/user-tag.component';
import { LineGraphComponent } from './line-graph/line-graph.component';
import { ReactionComponent } from './reaction/reaction.component';
import { ArrayComponent } from './array/array.component';
import { NexusComponent } from './nexus/nexus.component';
import { MediaSelectorComponent } from './media-selector/media-selector.component';
import { NexusMapComponent } from './nexus-map/nexus-map.component';

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
    GbcComponent,
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
    ReactionComponent,
    ArrayComponent,
    NexusComponent,
    NexusMapComponent
  ],
  bootstrap: [AppComponent],
  imports: [BrowserModule,
    LineGraphComponent,
    AppRoutingModule],
  providers: [
    provideHttpClient(withInterceptorsFromDi()),
    provideCharts(withDefaultRegisterables()),
  ]
})
export class AppModule { }
