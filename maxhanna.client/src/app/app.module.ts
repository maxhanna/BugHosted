import { AppLoadingSpinnerComponent } from './app-loading-spinner/app-loading-spinner.component';
import { PromptComponent } from './prompt/prompt.component';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { CalendarComponent } from './calendar/calendar.component';
import { NavigationComponent } from './navigation/navigation.component';
import { NavigationMenuComponent } from './navigation-menu/navigation-menu.component';
import { FavouritesComponent } from './favourites/favourites.component';
import { WeatherComponent } from './weather/weather.component';
import { FileComponent } from './file/file.component';
import { TodoComponent } from './todo/todo.component';
import { NotepadComponent } from './notepad/notepad.component';
import { MusicComponent } from './music/music.component';
import { MovieComponent } from './movie/movie.component';
import { ContactsComponent } from './contacts/contacts.component';
import { UserComponent } from './user/user.component';
import { UserListComponent } from './user-list/user-list.component';
import { MemeComponent } from './meme/meme.component';
import { SocialComponent } from './social/social.component';
import { SocialPostComponent } from './social-post/social-post.component';
import { FileUploadComponent } from './file-upload/file-upload.component';
import { NewsComponent } from './news/news.component';
import { TopicsComponent } from './topics/topics.component';
import { WordlerComponent } from './wordler/wordler.component';
import { AppComponent } from './app.component';
import { MediaViewerComponent } from './media-viewer/media-viewer.component';
import { FileSearchComponent } from './file-search/file-search.component';
import { UpdateUserSettingsComponent } from './update-user-settings/update-user-settings.component';
import { CommentsComponent } from './comments/comments.component';
import { UserTagComponent } from './user-tag/user-tag.component';
import { ChatTagComponent } from './chat-tag/chat-tag.component';
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
import { UserTrophiesComponent } from './user-trophies/user-trophies.component';
import { YoutubeSearchComponent } from './youtube-search/youtube-search.component';
import { DecodeHtmlPipe } from './decode-html.pipe';
import { PascalCasePipe } from './pascal-case.pipe';
import { TextFormattingToolbarComponent } from './text-formatting-toolbar/text-formatting-toolbar.component';
import { TextInputComponent } from './text-input/text-input.component';
import { ClickableUrlsPipe } from './clickable-url.pipe';
import { MastermindComponent } from './mastermind/mastermind.component';
import { ArtComponent } from './art/art.component';
import { MastermindScoresComponent } from './mastermind-scores/mastermind-scores.component';
import { ShareButtonComponent } from './share-button/share-button.component';
import { EnderComponent } from './ender/ender.component';
import { EnderHighScoresComponent } from './ender-high-scores/ender-high-scores.component';
import { WordlerHighScoresComponent } from './wordler-high-scores/wordler-high-scores.component';
import { AppMenuItemComponent } from './app-menu-item/app-menu-item.component';
import { BonesComponent } from './bones/bones.component';
import { DailyMusicComponent } from './daily-music/daily-music.component';
import { ProfileWidgetsComponent } from './profile-widgets/profile-widgets.component';
import { BonesHighScoresComponent } from './bones-high-scores/bones-high-scores.component';
import { NewUsersComponent } from './new-users/new-users.component';
import { OnlineUsersComponent } from './online-users/online-users.component';
import { UserEventsComponent } from './user-events/user-events.component';
import { CurrentlyPlayingComponent } from './currently-playing/currently-playing.component';
import { TitleBarComponent } from './title-bar/title-bar.component';
import { RatingStarsComponent } from './rating-stars/rating-stars.component';
import { SigIntComponent } from './sig-int/sig-int.component';
import { GlobeComponent } from './globe/globe.component';
import { StarryBackgroundComponent } from './starry-background/starry-background.component';
import { PlanterComponent } from './planter/planter.component';
import { WeaverComponent } from './weaver/weaver.component';
import { WeaverGuideComponent } from './weaver-guide/weaver-guide.component';
import { MiniCalendarComponent } from './mini-calendar/mini-calendar.component';
import { RecipeComponent } from './recipe/recipe.component';
import { CrawlerSearchResultsComponent } from './crawler-search-results/crawler-search-results.component';
import { ModeratorComponent } from './moderator/moderator.component';
import { PaintComponent } from './paint/paint.component';
import { ConversionComponent } from './conversion/conversion.component';

@NgModule({
  declarations: [
    AppComponent,
    CalendarComponent,
    NavigationComponent,
    NavigationMenuComponent,
    FavouritesComponent,
    WeatherComponent,
    FileComponent,
    TodoComponent,
    NotepadComponent,
    MusicComponent,
    MovieComponent,
    ContactsComponent,
    UserComponent,
    UserListComponent,
    MemeComponent,
    SocialComponent,
    SocialPostComponent,
    FileUploadComponent,
    NewsComponent,
    TopicsComponent,
    WordlerComponent,
    MediaViewerComponent,
    FileSearchComponent,
    MediaSelectorComponent,
    UpdateUserSettingsComponent,
    CommentsComponent,
    UserTagComponent,
    ChatTagComponent,
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
    BonesHighScoresComponent,
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
    UserTrophiesComponent,
    YoutubeSearchComponent,
    TextFormattingToolbarComponent,
    TextInputComponent,
    MastermindComponent,
    ArtComponent,
    MastermindScoresComponent,
    ShareButtonComponent,
    EnderComponent,
    EnderHighScoresComponent,
    WordlerHighScoresComponent,
    DailyMusicComponent,
    ProfileWidgetsComponent,
    NewUsersComponent,
    OnlineUsersComponent,
    UserEventsComponent,
    CurrentlyPlayingComponent,
    TitleBarComponent,
    RatingStarsComponent,
    PromptComponent,
    SigIntComponent,
    GlobeComponent,
    StarryBackgroundComponent,
    PlanterComponent,
    WeaverComponent,
    WeaverGuideComponent,
    MiniCalendarComponent,
    RecipeComponent,
    CrawlerSearchResultsComponent,
    ModeratorComponent,
    PaintComponent,
    ConversionComponent,
  ],
  bootstrap: [AppComponent],
  imports: [
    BrowserModule,
    CommonModule,
    FormsModule,
    AppMenuItemComponent,
    TimeFormatPipe,
    TimeSincePipe,
    FileSizePipe,
    AppLoadingSpinnerComponent,
    AppRoutingModule,
    CurrencySymbolPipe,
    DecodeHtmlPipe,
    PascalCasePipe,
  ],
  exports: [
    // Everything declared/imported here is exported so lazily-loaded standalone
    // apps (racing, digcraft, grandtheft, emulator, chat, crypto-hub) can use the
    // shared components/pipes/directives in their templates by importing AppModule.
    AppComponent,
    CalendarComponent,
    NavigationComponent,
    NavigationMenuComponent,
    FavouritesComponent,
    WeatherComponent,
    FileComponent,
    TodoComponent,
    NotepadComponent,
    MusicComponent,
    MovieComponent,
    ContactsComponent,
    UserComponent,
    UserListComponent,
    MemeComponent,
    SocialComponent,
    SocialPostComponent,
    FileUploadComponent,
    NewsComponent,
    TopicsComponent,
    WordlerComponent,
    MediaViewerComponent,
    FileSearchComponent,
    MediaSelectorComponent,
    UpdateUserSettingsComponent,
    CommentsComponent,
    UserTagComponent,
    ChatTagComponent,
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
    BonesHighScoresComponent,
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
    UserTrophiesComponent,
    YoutubeSearchComponent,
    TextFormattingToolbarComponent,
    TextInputComponent,
    MastermindComponent,
    ArtComponent,
    MastermindScoresComponent,
    ShareButtonComponent,
    EnderComponent,
    EnderHighScoresComponent,
    WordlerHighScoresComponent,
    DailyMusicComponent,
    ProfileWidgetsComponent,
    NewUsersComponent,
    OnlineUsersComponent,
    UserEventsComponent,
    CurrentlyPlayingComponent,
    TitleBarComponent,
    RatingStarsComponent,
    PromptComponent,
    SigIntComponent,
    GlobeComponent,
    StarryBackgroundComponent,
    PlanterComponent,
    WeaverComponent,
    WeaverGuideComponent,
    MiniCalendarComponent,
    RecipeComponent,
    CrawlerSearchResultsComponent,
    ModeratorComponent,
    PaintComponent,
    ConversionComponent,
    AppMenuItemComponent,
    TimeFormatPipe,
    TimeSincePipe,
    FileSizePipe,
    AppLoadingSpinnerComponent,
    CurrencySymbolPipe,
    DecodeHtmlPipe,
    PascalCasePipe,
  ],
  providers: [
    provideHttpClient(withInterceptorsFromDi()),
  ]
})
export class AppModule { }
