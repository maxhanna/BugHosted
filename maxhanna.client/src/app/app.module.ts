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
import { TimeSincePipe } from './time-since.pipe';
import { NexusMovementComponent } from './nexus-movement/nexus-movement.component';
import { CurrencyShortenPipe } from './currency-shorten';
import { CountShortenPipe } from './count-shorten.pipe';
import { CurrencySymbolPipe } from './currency-symbol';
import { CryptoCalendarComponent } from './crypto-calendar/crypto-calendar.component';
import { CryptoFearAndGreedComponent } from './crypto-fear-and-greed/crypto-fear-and-greed.component';
import { CryptoGlobalStatsComponent } from './crypto-global-stats/crypto-global-stats.component';
import { CryptoBotConfigurationComponent } from './crypto-bot-configuration/crypto-bot-configuration.component';
import { CryptoMarketCapsComponent } from './crypto-market-caps/crypto-market-caps.component';
import { UserTrophiesComponent } from './user-trophies/user-trophies.component';
import { YoutubeSearchComponent } from './youtube-search/youtube-search.component';
import { DecodeHtmlPipe } from './decode-html.pipe';
import { CryptoTradebotInformationComponent } from './crypto-tradebot-information/crypto-tradebot-information.component';
import { CryptoBitcoinPerformanceComponent } from './crypto-bitcoin-performance/crypto-bitcoin-performance.component';
import { CryptoWalletsComponent } from './crypto-wallets/crypto-wallets.component';
import { CryptoTradeHistoryComponent } from './crypto-trade-history/crypto-trade-history.component';
import { CryptoTradeLogsComponent } from './crypto-trade-logs/crypto-trade-logs.component';
import { CryptoCoinGraphViewerComponent } from './crypto-coin-graph-viewer/crypto-coin-graph-viewer.component';
import { CryptoCoinVolumeGraphViewerComponent } from './crypto-coin-volume-graph-viewer/crypto-coin-volume-graph-viewer.component';
import { CryptoLiveTradeViewComponent } from './crypto-live-trade-view/crypto-live-trade-view.component';
import { TextFormattingToolbarComponent } from './text-formatting-toolbar/text-formatting-toolbar.component';
import { TextInputComponent } from './text-input/text-input.component';
import { ClickableUrlsPipe } from './clickable-url.pipe';
import { MastermindComponent } from './mastermind/mastermind.component';
import { ArtComponent } from './art/art.component';
import { MastermindScoresComponent } from './mastermind-scores/mastermind-scores.component';
import { ShareButtonComponent } from './share-button/share-button.component';
import { RatingsComponent } from './ratings/ratings.component';
import { EnderComponent } from './ender/ender.component';
import { EnderHighScoresComponent } from './ender-high-scores/ender-high-scores.component';
import { CryptoTopTradersComponent } from './crypto-top-traders/crypto-top-traders.component';
import { WordlerHighScoresComponent } from './wordler-high-scores/wordler-high-scores.component';
import { CryptoNewsArticlesComponent } from './crypto-news-articles/crypto-news-articles.component';
import { AppMenuItemComponent } from './app-menu-item/app-menu-item.component';
import { BonesComponent } from './bones/bones.component';
import { BonesHighScoresComponent } from './bones/bones-high-scores.component';
import { DailyMusicComponent } from './daily-music/daily-music.component';

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
    BonesComponent,
    ClickableUrlsPipe,
    CurrencyFlagPipe,
    CurrencyShortenPipe,
    CountShortenPipe,
    HostAiComponent,
    ThemesComponent,
    CrawlerComponent,
    SpeechRecognitionComponent,
    TopComponent,
    NexusMovementComponent,
    CryptoCalendarComponent,
    CryptoBotConfigurationComponent,
    CryptoMarketCapsComponent,
    UserTrophiesComponent,
    YoutubeSearchComponent,
    CryptoTradebotInformationComponent,
    CryptoBitcoinPerformanceComponent,
    CryptoWalletsComponent,
    CryptoTradeHistoryComponent,
    CryptoTradeLogsComponent,
    CryptoCoinGraphViewerComponent,
    CryptoCoinVolumeGraphViewerComponent,
    CryptoLiveTradeViewComponent,
    TextFormattingToolbarComponent,
    TextInputComponent,
    MastermindComponent,
    ArtComponent,
    MastermindScoresComponent,
    ShareButtonComponent,
    RatingsComponent,
    EnderComponent,
    EnderHighScoresComponent,
    CryptoTopTradersComponent,
    CryptoNewsArticlesComponent,
    WordlerHighScoresComponent,
  DailyMusicComponent,
  ],
  bootstrap: [AppComponent],
  imports: [BrowserModule,
    AppMenuItemComponent,
    LineGraphComponent,
    TimeFormatPipe,
    TimeSincePipe,
  BonesHighScoresComponent,
    FileSizePipe,
    AppRoutingModule,
    CryptoFearAndGreedComponent,
    CurrencySymbolPipe,
    DecodeHtmlPipe,
    CryptoGlobalStatsComponent],
  exports: [
    InViewDirective,
    TimeFormatPipe,
    TimeSincePipe,
    CurrencyFlagPipe,
    CurrencyShortenPipe,
    CountShortenPipe,
    CurrencySymbolPipe,
    FileSizePipe
  ],
  providers: [
    provideHttpClient(withInterceptorsFromDi()),
    provideCharts(withDefaultRegisterables()),
  ]
})
export class AppModule { }
