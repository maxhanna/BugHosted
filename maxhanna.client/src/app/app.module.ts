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
import { WeatherComponent } from './weather/weather.component'; 
import { FileComponent } from './file/file.component';
import { MiningRigsComponent } from './mining-rigs/mining-rigs.component';
import { TodoComponent } from './todo/todo.component';
import { NotepadComponent } from './notepad/notepad.component';
import { MusicComponent } from './music/music.component';
import { ContactsComponent } from './contacts/contacts.component';
import { CryptoHubComponent } from './crypto-hub/crypto-hub.component'; 
import { UserComponent } from './user/user.component';
import { ChatComponent } from './chat/chat.component';
import { UserListComponent } from './user-list/user-list.component';
import { MemeComponent } from './meme/meme.component';
import { ClickableUrlsPipe, SocialComponent } from './social/social.component';
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
import { NexusBaseUnitsComponent } from './nexus-base-units/nexus-base-units.component';
import { NexusAttackScreenComponent } from './nexus-attack-screen/nexus-attack-screen.component';
import { NexusReportsComponent } from './nexus-reports/nexus-reports.component';
import { NexusBasesComponent } from './nexus-bases/nexus-bases.component';
import { NexusMapComponent } from './nexus-map/nexus-map.component';
import { ModalComponent } from './modal/modal.component';
import { NexusSupportScreenComponent } from './nexus-support-screen/nexus-support-screen.component';
import { NotificationsComponent } from './notifications/notifications.component';
import { InViewDirective } from './in-view.directive';
import { CurrencyFlagPipe } from './currency-flag.pipe';
import { FileSizePipe } from './file-size.pipe';
import { MetaComponent } from './meta/meta.component';
import { HostAiComponent } from './host-ai/host-ai.component';
import { ThemesComponent } from './themes/themes.component';
import { CrawlerComponent } from './crawler/crawler.component';
import { SpeechRecognitionComponent } from './speech-recognition/speech-recognition.component';
import { TopComponent } from './top/top.component'; 
import { TimeFormatPipe } from './time-format.pipe';

@NgModule({
  declarations: [
    AppComponent,
    CalendarComponent,
    NavigationComponent,
    FavouritesComponent,
    WeatherComponent, 
    FileComponent,
    MiningRigsComponent,
    TodoComponent,
    NotepadComponent,
    MusicComponent,
    ContactsComponent,
    CryptoHubComponent,  
    UserComponent,   
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
    NexusMapComponent,
    NexusBaseUnitsComponent,
    NexusAttackScreenComponent,
    NexusReportsComponent,
    NexusBasesComponent,
    ModalComponent,
    NexusSupportScreenComponent,
    NotificationsComponent,
    InViewDirective,
    MetaComponent,
    ClickableUrlsPipe, 
    CurrencyFlagPipe, 
    HostAiComponent,
    ThemesComponent,
    CrawlerComponent,
    SpeechRecognitionComponent,
    TopComponent, 
  ],
  bootstrap: [AppComponent],
  imports: [BrowserModule,
    LineGraphComponent,
    TimeFormatPipe,
    FileSizePipe,
    AppRoutingModule],
  exports: [
    InViewDirective,
    ClickableUrlsPipe,
    TimeFormatPipe,
    CurrencyFlagPipe,
    FileSizePipe
  ],
  providers: [
    provideHttpClient(withInterceptorsFromDi()),
    provideCharts(withDefaultRegisterables()),
  ]
})
export class AppModule { }
