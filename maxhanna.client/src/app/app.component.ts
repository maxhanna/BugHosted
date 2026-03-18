import { AfterViewInit, ChangeDetectorRef, Component, ComponentRef, OnInit, ViewChild, ViewContainerRef } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { Location } from '@angular/common';
import { CalendarComponent } from './calendar/calendar.component';
import { FavouritesComponent } from './favourites/favourites.component';
import { WeatherComponent } from './weather/weather.component';
import { FileComponent } from './file/file.component';
import { TodoComponent } from './todo/todo.component';
import { ContactsComponent } from './contacts/contacts.component';
import { NotepadComponent } from './notepad/notepad.component';
import { MusicComponent } from './music/music.component';
import { UserComponent } from './user/user.component';
import { MenuItem } from '../services/datacontracts/user/menu-item';
import { ChatComponent } from './chat/chat.component';
import { MemeComponent } from './meme/meme.component';
import { SocialComponent } from './social/social.component';
import { NewsComponent } from './news/news.component';
import { NavigationComponent } from './navigation/navigation.component';
import { WordlerComponent } from './wordler/wordler.component';
import { UpdateUserSettingsComponent } from './update-user-settings/update-user-settings.component';
import { ArrayComponent } from './array/array.component';
import { NexusComponent } from './nexus/nexus.component';
import { MetaComponent } from './meta/meta.component';
import { User } from '../services/datacontracts/user/user';
import { ModalComponent } from './modal/modal.component';
import { NotificationsComponent } from './notifications/notifications.component';
import { UserService } from '../services/user.service';
import { CryptoHubComponent } from './crypto-hub/crypto-hub.component';
import { HostAiComponent } from './host-ai/host-ai.component';
import { DomSanitizer, Meta, Title } from '@angular/platform-browser';
import { MediaViewerComponent } from './media-viewer/media-viewer.component';
import { ThemesComponent } from './themes/themes.component';
import { FileEntry } from '../services/datacontracts/file/file-entry';
import { CrawlerComponent } from './crawler/crawler.component';
import { CrawlerService } from '../services/crawler.service';
import { FavouriteService } from '../services/favourite.service';
import { FileService } from '../services/file.service';
import { TopComponent } from './top/top.component';
import { PollService } from '../services/poll.service';
import { MastermindComponent } from './mastermind/mastermind.component';
import { ArtComponent } from './art/art.component';
import { EnderComponent } from './ender/ender.component';
import { BonesComponent } from './bones/bones.component';
import { EmulatorComponent } from './emulator/emulator.component';
import { YoutubeVideo } from '../services/datacontracts/youtube';


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  standalone: false
})
export class AppComponent implements OnInit, AfterViewInit {
  user: User | undefined = undefined;
  @ViewChild("viewContainerRef", { read: ViewContainerRef }) VCR!: ViewContainerRef;
  @ViewChild("outlet") outlet!: RouterOutlet;
  @ViewChild(NavigationComponent) navigationComponent?: NavigationComponent;
  @ViewChild(ModalComponent) modalComponent!: ModalComponent;
  @ViewChild(MediaViewerComponent) userTagPopupMediaViewer!: MediaViewerComponent;
  notifications: string[] = [];
  // Whether the current device is considered desktop (used to show left panel)
  isDesktop: boolean = (typeof window !== 'undefined') ? window.innerWidth >= 1024 : false;
  // Components for which the extended left navigation panel should NOT be shown on desktop
  excludedExtendedNavigationComponents: string[] = [
    'EmulatorComponent',
    'NexusComponent',
    'BonesComponent',
    'MetaComponent',
    'UpdateUserSettingsComponent',
  ];
  unflexedNavigationComponents: string[] = [
    'EmulatorComponent',
    'ChatComponent',
    'NotepadComponent',
  ];
  centeredComponents : string[] = [
    "CalendarComponent",
    "WeatherComponent",
    "MastermindComponent",
    "WorlderComponent",
    "ArrayComponent",
    "NexusComponent",
  ];
  showMainContent = true;
  isModalOpen = false;
  isModal = true;
  isLeftPanelHidden = false;
  leftPanelWidth = 0;
  leftPanelCollapsedWidth = 36;
  minLeftPanelWidth = 180;
  maxLeftPanelWidth = 260;
  isModalCloseVisible = true;
  isShowingYoutubePopup = false;
  isShowingOverlay = false;
  pictureSrcs: { key: string, value: string, type: string, extension: string }[] = [];
  isNavigationInitialized: boolean = false;
  debounceTimer: any;
  originalWeatherIcon = "☀️";
  child_unique_key: number = 0; 
  selectedUsername: string | null = null;
  currentComponent: string = "";
  currentComponentParameters?: { [key: string]: any; };
  emojiMap: { [key: string]: string } = { "<3": "❤️", ":blush:": "😊", ":smiley:": "😃", ":)": "🙂", ":-)": "🙂", ":smile:": "😄", ":grin:": "😁", ":D": "😁", ":-D": "😁", ":laughing:": "😆", ":sweat_smile:": "😅", ":joy:": "😂", ":rofl:": "🤣", ":relaxed:": "☺️", ":yum:": "😋", ":sunglasses:": "😎", ":heart_eyes:": "😍", ":kissing_heart:": "😘", ":kissing:": "😗", ":kissing_smiling_eyes:": "😙", ":kissing_closed_eyes:": "😚", ":stuck_out_tongue:": "😛", ":stuck_out_tongue_winking_eye:": "😜", ":stuck_out_tongue_closed_eyes:": "😝", ":money_mouth_face:": "🤑", ":hugging_face:": "🤗", ":nerd_face:": "🤓", ":thinking_face:": "🤔", ":zipper_mouth_face:": "🤐", ":raised_eyebrow:": "🤨", ":neutral_face:": "😐", ":expressionless:": "😑", ":no_mouth:": "😶", ":smirk:": "😏", ":unamused:": "😒", ":roll_eyes:": "🙄", ":grimacing:": "😬", ":lying_face:": "🤥", ":relieved:": "😌", ":pensive:": "😔", ":sleepy:": "😪", ":drooling_face:": "🤤", ":sleeping:": "😴", ":mask:": "😷", ":face_with_thermometer:": "🤒", ":face_with_head_bandage:": "🤕", ":nauseated_face:": "🤢", ":face_vomiting:": "🤮", ":sneezing_face:": "🤧", ":hot_face:": "🥵", ":cold_face:": "🥶", ":woozy_face:": "🥴", ":dizzy_face:": "😵", ":exploding_head:": "🤯", ":cowboy_hat_face:": "🤠", ":partying_face:": "🥳", ":disguised_face:": "🥸", ":smiling_face_with_tear:": "🥲", ":shushing_face:": "🤫", ":face_with_symbols_on_mouth:": "🤬", ":face_with_hand_over_mouth:": "🤭", ":face_with_monocle:": "🧐", ":star_struck:": "🤩", ":zany_face:": "🤪", ":face_with_raised_eyebrow:": "🤨", ":face_with_spiral_eyes:": "😵‍💫", ":face_with_peeking_eye:": "🫣", ":saluting_face:": "🫡", ":face_with_diagonal_mouth:": "🫤", ":dotted_line_face:": "🫥", ":face_with_open_eyes_and_hand_over_mouth:": "🫢", ":face_with_open_mouth:": "😮", ":face_with_rolling_eyes:": "🙄", ":face_with_steam_from_nose:": "😤", ":face_with_medical_mask:": "😷", ":face_with_crossed_out_eyes:": "😵‍💫", ":wave:": "👋", ":raised_hand:": "✋", ":raised_back_of_hand:": "🤚", ":hand_with_fingers_splayed:": "🖐️", ":vulcan_salute:": "🖖", ":ok_hand:": "👌", ":pinching_hand:": "🤏", ":victory_hand:": "✌️", ":crossed_fingers:": "🤞", ":love_you_gesture:": "🤟", ":sign_of_the_horns:": "🤘", ":call_me_hand:": "🤙", ":point_left:": "👈", ":point_right:": "👉", ":point_up:": "☝️", ":point_down:": "👇", ":middle_finger:": "🖕", ":thumbsup:": "👍", ":thumbsdown:": "👎", ":raised_fist:": "✊", ":fist:": "👊", ":fist_left:": "🤛", ":fist_right:": "🤜", ":clap:": "👏", ":open_hands:": "👐", ":palms_up_together:": "🤲", ":handshake:": "🤝", ":pray:": "🙏", ":writing_hand:": "✍️", ":crayon:": "✏️", ":nail_care:": "💅", ":selfie:": "🤳", ":muscle:": "💪", ":mechanical_arm:": "🦾", ":mechanical_leg:": "🦿", ":leg:": "🦵", ":foot:": "🦶", ":ear:": "👂", ":nose:": "👃", ":brain:": "🧠", ":tooth:": "🦷", ":bone:": "🦴", ":eyes:": "👀", ":eye:": "👁️", ":tongue:": "👅", ":lips:": "👄", ":baby:": "👶", ":child:": "🧒", ":boy:": "👦", ":girl:": "👧", ":adult:": "🧑", ":person:": "🧑", ":man:": "👨", ":woman:": "👩", ":older_adult:": "🧓", ":older_man:": "👴", ":older_woman:": "👵", ":blonde_person:": "👱", ":bearded_person:": "🧔", ":man_with_beard:": "🧔‍♂️", ":woman_with_beard:": "🧔‍♀️", ":red_haired_person:": "👨‍🦰", ":curly_haired_person:": "👨‍🦱", ":bald_person:": "👨‍🦲", ":white_haired_person:": "👨‍🦳", ":person_in_tuxedo:": "🤵", ":bride_with_veil:": "👰", ":pregnant_woman:": "🤰", ":breast_feeding:": "🤱", ":angel:": "👼", ":santa:": "🎅", ":mrs_claus:": "🤶", ":mage:": "🧙", ":fairy:": "🧚", ":vampire:": "🧛", ":merperson:": "🧜", ":elf:": "🧝", ":genie:": "🧞", ":zombie:": "🧟", ":person_frowning:": "🙍", ":person_pouting:": "🙎", ":person_gesturing_no:": "🙅", ":person_gesturing_ok:": "🙆", ":person_tipping_hand:": "💁", ":person_raising_hand:": "🙋", ":deaf_person:": "🧏", ":person_bowing:": "🙇", ":person_facepalming:": "🤦", ":person_shrugging:": "🤷", ":person_standing:": "🧍", ":person_kneeling:": "🧎", ":person_running:": "🏃", ":person_walking:": "🚶", ":person_lifting_weights:": "🏋️", ":person_cycling:": "🚴", ":person_swimming:": "🏊", ":person_playing_water_polo:": "🤽", ":person_playing_handball:": "🤾", ":person_juggling:": "🤹", ":person_in_lotus_position:": "🧘", ":person_in_steamy_room:": "🧖", ":person_climbing:": "🧗", ":person_in_motorized_wheelchair:": "🦽", ":person_in_manual_wheelchair:": "🦼", ":person_with_probing_cane:": "🦯", ":person_with_white_cane:": "🦯", ":person_with_crown:": "🫅", ":person_with_veil:": "👰", ":superhero:": "🦸", ":supervillain:": "🦹", ":ninja:": "🥷", ":construction_worker:": "👷", ":guard:": "💂", ":detective:": "🕵️", ":health_worker:": "🧑‍⚕️", ":farmer:": "🧑‍🌾", ":cook:": "🧑‍🍳", ":student:": "🧑‍🎓", ":singer:": "🧑‍🎤", ":artist:": "🧑‍🎨", ":teacher:": "🧑‍🏫", ":factory_worker:": "🧑‍🏭", ":technologist:": "🧑‍💻", ":office_worker:": "🧑‍💼", ":mechanic:": "🧑‍🔧", ":scientist:": "🧑‍🔬", ":astronaut:": "🧑‍🚀", ":firefighter:": "🧑‍🚒", ":pilot:": "🧑‍✈️", ":judge:": "🧑‍⚖️", ":person_with_heart:": "💑", ":couple_with_heart:": "💏", ":two_men_holding_hands:": "👬", ":two_women_holding_hands:": "👭", ":family:": "👪", ":people_hugging:": "🫂", ":footprints:": "👣", ":monkey_face:": "🐵", ":monkey:": "🐒", ":gorilla:": "🦍", ":orangutan:": "🦧", ":dog:": "🐶", ":cat:": "🐱", ":mouse:": "🐭", ":hamster:": "🐹", ":rabbit:": "🐰", ":fox:": "🦊", ":bear:": "🐻", ":panda:": "🐼", ":polar_bear:": "🐻‍❄️", ":koala:": "🐨", ":tiger:": "🐯", ":lion:": "🦁", ":cow:": "🐮", ":pig:": "🐷", ":frog:": "🐸", ":squid:": "🦑", ":octopus:": "🐙", ":shrimp:": "🦐", ":crab:": "🦀", ":lobster:": "🦞", ":blowfish:": "🐡", ":tropical_fish:": "🐠", ":fish:": "🐟", ":dolphin:": "🐬", ":whale:": "🐋", ":shark:": "🦈", ":crocodile:": "🐊", ":turtle:": "🐢", ":snake:": "🐍", ":dragon_face:": "🐲", ":dragon:": "🐉", ":sauropod:": "🦕", ":t-rex:": "🦖", ":whale2:": "🐋", ":seal:": "🦭", ":fly:": "🪰", ":worm:": "🪱", ":bug:": "🐛", ":ant:": "🐜", ":honeybee:": "🐝", ":beetle:": "🪲", ":ladybug:": "🐞", ":cricket:": "🦗", ":cockroach:": "🪳", ":spider:": "🕷️", ":scorpion:": "🦂", ":mosquito:": "🦟", ":microbe:": "🦠", ":bouquet:": "💐", ":cherry_blossom:": "🌸", ":white_flower:": "💮", ":rosette:": "🏵️", ":rose:": "🌹", ":wilted_flower:": "🥀", ":hibiscus:": "🌺", ":sunflower:": "🌻", ":blossom:": "🌼", ":tulip:": "🌷", ":seedling:": "🌱", ":potted_plant:": "🪴", ":evergreen_tree:": "🌲", ":deciduous_tree:": "🌳", ":palm_tree:": "🌴", ":cactus:": "🌵", ":ear_of_rice:": "🌾", ":herb:": "🌿", ":shamrock:": "☘️", ":four_leaf_clover:": "🍀", ":maple_leaf:": "🍁", ":fallen_leaf:": "🍂", ":leaves:": "🍃", ":mushroom:": "🍄", ":chestnut:": "🌰", ":coral:": "🪸", ":shell:": "🐚", ":rock:": "🪨", ":wood:": "🪵", ":feather:": "🪶", ":paw_prints:": "🐾", ":green_apple:": "🍏", ":red_apple:": "🍎", ":pear:": "🍐", ":tangerine:": "🍊", ":lemon:": "🍋", ":banana:": "🍌", ":watermelon:": "🍉", ":grapes:": "🍇", ":strawberry:": "🍓", ":melon:": "🍈", ":cherries:": "🍒", ":peach:": "🍑", ":mango:": "🥭", ":pineapple:": "🍍", ":coconut:": "🥥", ":kiwi_fruit:": "🥝", ":tomato:": "🍅", ":eggplant:": "🍆", ":avocado:": "🥑", ":broccoli:": "🥦", ":leafy_green:": "🥬", ":cucumber:": "🥒", ":hot_pepper:": "🌶️", ":corn:": "🌽", ":carrot:": "🥕", ":garlic:": "🧄", ":onion:": "🧅", ":potato:": "🥔", ":sweet_potato:": "🍠", ":croissant:": "🥐", ":baguette_bread:": "🥖", ":bread:": "🍞", ":pretzel:": "🥨", ":cheese:": "🧀", ":egg:": "🥚", ":cooking:": "🍳", ":pancakes:": "🥞", ":waffle:": "🧇", ":bacon:": "🥓", ":cut_of_meat:": "🥩", ":poultry_leg:": "🍗", ":meat_on_bone:": "🍖", ":hotdog:": "🌭", ":hamburger:": "🍔", ":fries:": "🍟", ":pizza:": "🍕", ":sandwich:": "🥪", ":taco:": "🌮", ":burrito:": "🌯", ":stuffed_flatbread:": "🥙", ":falafel:": "🧆", ":shallow_pan_of_food:": "🥘", ":stew:": "🍲", ":bowl_with_spoon:": "🥣", ":green_salad:": "🥗", ":popcorn:": "🍿", ":butter:": "🧈", ":salt:": "🧂", ":canned_food:": "🥫", ":bento:": "🍱", ":rice_cracker:": "🍘", ":rice_ball:": "🍙", ":rice:": "🍚", ":curry:": "🍛", ":ramen:": "🍜", ":spaghetti:": "🍝", ":oden:": "🍢", ":sushi:": "🍣", ":fried_shrimp:": "🍤", ":fish_cake:": "🍥", ":moon_cake:": "🥮", ":dango:": "🍡", ":dumpling:": "🥟", ":fortune_cookie:": "🥠", ":takeout_box:": "🥡", ":icecream:": "🍦", ":shaved_ice:": "🍧", ":ice_cream:": "🍨", ":doughnut:": "🍩", ":cookie:": "🍪", ":birthday:": "🎂", ":cake:": "🍰", ":cupcake:": "🧁", ":pie:": "🥧", ":chocolate_bar:": "🍫", ":candy:": "🍬", ":lollipop:": "🍭", ":custard:": "🍮", ":honey_pot:": "🍯", ":baby_bottle:": "🍼", ":glass_of_milk:": "🥛", ":coffee:": "☕", ":tea:": "🍵", ":sake:": "🍶", ":champagne:": "🍾", ":wine_glass:": "🍷", ":cocktail:": "🍸", ":tropical_drink:": "🍹", ":beer:": "🍺", ":beers:": "🍻", ":clinking_glasses:": "🥂", ":tumbler_glass:": "🥃", ":cup_with_straw:": "🥤", ":bubble_tea:": "🧋", ":beverage_box:": "🧃", ":mate:": "🧉", ":ice_cube:": "🧊", ":chopsticks:": "🥢", ":fork_and_knife_with_plate:": "🍽️", ":fork_and_knife:": "🍴", ":spoon:": "🥄", ":knife:": "🔪", ":amphora:": "🏺", ":grinning:": "😀", ":wink:": "😉", ";)": "😉", ";-)": "😉", ":confused:": "😕", ":upside_down_face:": "🙃", ":disappointed:": "😞", ":frowning:": "🙁", ":persevere:": "😣", ":confounded:": "😖", ":fearful:": "😨", ":cold_sweat:": "😰", ":scream:": "😱", ":angry:": "😡", ":rage:": "😡", ":cry:": "😢", ":sob:": "😭", ":joy_cat:": "😹", ":smiling_imp:": "😈", ":imp:": "👿", ":alien:": "👽", ":robot_face:": "🤖", ":wink2:": "😉", ":yawning_face:": "🥱", ":ghost:": "👻", ":clown_face:": "🤡", ":wolf:": "🐺", ":bee:": "🐝", ":butterfly:": "🦋", ":snail:": "🐌", ":flamingo:": "🦩", ":parrot:": "🦜", ":eagle:": "🦅", ":penguin:": "🐧", ":chicken:": "🐔", ":duck:": "🦆", ":swan:": "🦢", ":owl:": "🦉", ":bat:": "🦇", ":camel:": "🐪", ":llama:": "🦙", ":zebra:": "🦓", ":horse:": "🐎", ":unicorn:": "🦄", ":giraffe:": "🦒", ":elephant:": "🐘", ":rhinoceros:": "🦏", ":hippopotamus:": "🐋", ":dog2:": "🐕‍🦺", ":cow2:": "🐂", ":apple:": "🍎", ":cherry:": "🍒", ":papaya:": "🍑", ":chili_pepper:": "🌶️", ":peanuts:": "🥜", ":cashew:": "🌰", ":zucchini:": "🥒", ":bell_pepper:": "🫑", ":pine_nut:": "🌰", ":pomegranate:": "🍎", ":fig:": "🍇", ":whiskey:": "🥃", ":milk_glass:": "🥛", ":hot_chocolate:": "🍫", ":smoothie:": "🍹", ":milkshake:": "🍦", ":car:": "🚗", ":bus:": "🚌", ":truck:": "🚚", ":airplane:": "✈️", ":helicopter:": "🚁", ":rocket:": "🚀", ":boat:": "🚤", ":ship:": "🚢", ":train:": "🚆", ":subway:": "🚇", ":tram:": "🚊", ":train2:": "🚋", ":bicycle:": "🚲", ":skateboard:": "🛹", ":roller_coaster:": "🎢", ":carriage:": "🚃", ":police_car:": "🚓", ":fire_engine:": "🚒", ":ambulance:": "🚑", ":taxi:": "🚖", ":minibus:": "🚐", ":rickshaw:": "🛺", ":trolleybus:": "🚎", ":scooter:": "🛴", ":sailing_ship:": "⛵", ":house:": "🏠", ":house_with_garden:": "🏡", ":school:": "🏫", ":office:": "🏢", ":hospital:": "🏥", ":bank:": "🏦", ":atm:": "🏧", ":church:": "⛪", ":mosque:": "🕌", ":synagogue:": "🕍", ":wedding:": "💒", ":department_store:": "🏬", ":shopping_cart:": "🛒", ":factory:": "🏭", ":museum:": "🏛️", ":art_gallery:": "🖼️", ":stadium:": "🏟️", ":stadium_with_pitch:": "⚽", ":tent:": "⛺", ":cityscape:": "🏙️", ":desert:": "🏜️", ":mountain:": "🏔️", ":volcano:": "🌋", ":sunny:": "☀️", ":cloud:": "☁️", ":rainbow:": "🌈", ":snowflake:": "❄️", ":snowman:": "⛄", ":zap:": "⚡", ":cyclone:": "🌀", ":fog:": "🌫️", ":earth_africa:": "🌍", ":earth_americas:": "🌎", ":earth_asia:": "🌏", ":mountain_snow:": "🏔️", ":sunrise:": "🌅", ":sunset:": "🌇", ":stars:": "🌟", ":milky_way:": "🌌", ":comet:": "☄️", ":moon:": "🌙", ":new_moon:": "🌑", ":waxing_crescent_moon:": "🌒", ":first_quarter_moon:": "🌓", ":waxing_gibbous_moon:": "🌔", ":us:": "🇺🇸", ":canada:": "🇨🇦", ":uk:": "🇬🇧", ":germany:": "🇩🇪", ":france:": "🇫🇷", ":spain:": "🇪🇸", ":italy:": "🇮🇹", ":australia:": "🇦🇺", ":mexico:": "🇲🇽", ":brazil:": "🇧🇷", ":india:": "🇮🇳", ":china:": "🇨🇳", ":japan:": "🇯🇵", ":south_korea:": "🇰🇷", ":south_africa:": "🇿🇦", ":argentina:": "🇦🇷", ":russia:": "🇷🇺", ":sweden:": "🇸🇪", ":norway:": "🇳🇴", ":denmark:": "🇩🇰", ":finland:": "🇫🇮", ":netherlands:": "🇳🇱", ":belgium:": "🇧🇪", ":guitar:": "🎸", ":piano:": "🎹", ":violin:": "🎻", ":drum:": "🥁", ":microphone:": "🎤", ":musical_note:": "🎵", ":headphones:": "🎧", ":trophy:": "🏆", ":medal:": "🏅", ":chess_pawn:": "♟️", ":checkered_flag:": "🏁", ":sports_medal:": "🥇", ":film_projector:": "📽️", ":movie_camera:": "🎥", ":clapper:": "🎬", ":ticket:": "🎫", ":camera:": "📷", ":flashlight:": "🔦", ":hourglass:": "⏳", ":game_die:": "🎲", ":domino:": "🁸", ":magnet:": "🧲", ":scissors:": "✂️", ":globe_with_meridians:": "🌐", ":electric_plug:": "🔌", ":light_bulb:": "💡", ":gear:": "⚙️", ":wrench:": "🔧", ":hammer:": "🔨", ":lock:": "🔒", ":key:": "🔑", }
  youtubeSearchResults: YoutubeVideo[] = [];
  youtubeSearchKeyword: string = '';
  componentsReferences = Array<ComponentRef<any>>();
  private youtubeSearchClearTimer?: any;
  private lastLastSeenUpdate: number | null = null;
  private _isResizingLeftPanel = false;
  private _resizeStartX = 0;
  private _resizeStartWidth = 0;
  navigationItems: MenuItem[] = [
    { ownership: 0, icon: "🌍", title: "Social", content: undefined },
    { ownership: 0, icon: "🤣", title: "Meme", content: undefined },
    { ownership: 0, icon: "🎖️", title: "Bug-Wars", content: undefined },
    { ownership: 0, icon: "🤖", title: "Meta-Bots", content: undefined },
    { ownership: 0, icon: "🗨️", title: "Chat", content: undefined },
    { ownership: 0, icon: "🎮", title: "Emulator", content: undefined },
    { ownership: 0, icon: "⚔️", title: "Array", content: undefined },
    { ownership: 0, icon: "🧠", title: "Wordler", content: undefined },
    { ownership: 0, icon: "🎯", title: "Mastermind", content: undefined },
    { ownership: 0, icon: "🖼️", title: "Art", content: undefined },
    { ownership: 0, icon: "📁", title: "Files", content: undefined },
    { ownership: 0, icon: "📅", title: "Calendar", content: undefined },
    { ownership: 0, icon: "☀️", title: "Weather", content: '' },
    { ownership: 0, icon: "✔️", title: "Todo", content: undefined },
    { ownership: 0, icon: "🎵", title: "Music", content: undefined },
    { ownership: 0, icon: "🗒️", title: "Notepad", content: undefined },
    { ownership: 0, icon: "📇", title: "Contacts", content: undefined },
    { ownership: 0, icon: "📰", title: "News", content: undefined },
    { ownership: 0, icon: "₿", title: "Crypto-Hub", content: undefined },
    { ownership: 0, icon: "🔍", title: "Favourites", content: undefined },
    { ownership: 0, icon: "👽", title: "Ender", content: undefined },
    { ownership: 0, icon: "💀", title: "Bones", content: undefined },
    { ownership: 0, icon: "💯", title: "Top100", content: undefined },
    { ownership: 0, icon: "🎨", title: "Theme", content: undefined },
    { ownership: 0, icon: "🧐", title: "HostAi", content: undefined },
    { ownership: 0, icon: "🕸️", title: "Crawler", content: undefined },
    { ownership: 0, icon: "🔔", title: "Notifications", content: undefined },
    { ownership: 0, icon: "👤", title: "User", content: undefined },
    { ownership: 0, icon: "➕", title: "UpdateUserSettings", content: undefined },
    { ownership: 0, icon: "ℹ️", title: "Help", content: undefined },
  ];
  navigationItemDescriptions: MenuItem[] = [
    {
      ownership: 0,
      title: 'Bug-Wars',
      content: `"Bug Wars" is a real-time strategy, massively multiplayer online game set in the near future. Create
  your base and compete against others for control over the map!`
    },
    {
      ownership: 0,
      title: 'Files',
      content: `A file system which is the backbone of the site.
  Anything publicly available in the filesystem can be used as an attachment anywhere on the site or
  shared publicly off-site for free!`
    },
    {
      ownership: 0,
      title: 'News',
      content: `Get the latest news on any subject from multiple different sources (from both main and non-mainstream
  news).`
    },
    {
      ownership: 0,
      title: 'Notifications',
      content: `Notifications display for all components of this website. Get up to date information about your content.`
    },
    {
      ownership: 0,
      title: 'Weather',
      content: `Get up to date weather information based on a location you supply or the automatically found location
  based on your IP-Address!`
    },
    {
      ownership: 0,
      title: 'Todo',
      content: `A todo list to keep yourself reminded of everything todo. Create your own lists and save reminders to
  it!`
    },
    {
      ownership: 0,
      title: 'Music',
      content: `A music list to keep track of your favourite youtube songs! Once added, the songs are displayed and a
  playlist can be selected from your profile page!`
    },
    {
      ownership: 0,
      title: 'Crypto-Hub',
      content: `Crypto Hub does many Crypto-related things.
  <ul>
    <li>Keeps track of crypto prices for the most popular coins.</li>
    <li>Show your cryptocurrency wallet balance.</li>
    <li>Manage your cryptocurrency mining rigs.</li>
    <li>Manage your trade bot.</li>
    <li>View trading logs.</li>
  </ul>
  <div class="smallFont">
    Currently only supports the NiceHash API for mining rigs.
    If you do not have any mining rigs set up, you can quickly get started using Nicehash.
    Follow this <a href='http://nicehash.com' target="_blank">Link</a> for more info!
  </div>`
    },
    {
      ownership: 0,
      title: 'HostAi',
      content: `BugHosted's AI. Get information about anything instantly.`
    },
    {
      ownership: 0,
      title: 'Notepad',
      content: `Jot down notes and share them with others. Saved news articles show up here.`
    },
    {
      ownership: 0,
      title: 'Contacts',
      content: `Add your friends as contacts! Simply go to a person's profile page and click Add as Contact to keep
  track of friends' contact information and profiles.`
    },
    {
      ownership: 0,
      title: 'Crawler',
      content: `Our search engine with a full database of uncensored results. Index your website or search our
  database of websites for any information that can be found on the web.`
    },
    {
      ownership: 0,
      title: 'Calendar',
      content: `The Calendar helps you remember important things. Dont forget.`
    },
    {
      ownership: 0,
      title: 'Help',
      content: `Information on what every app can do displayed on screen.`
    },
    {
      ownership: 0,
      title: 'Meta-Bots',
      content: `Meta-Bots, our up and coming MMORPG.`
    },
    {
      ownership: 0,
      title: 'Social',
      content: `Social platform.`
    },
    {
      ownership: 0,
      title: 'Meme',
      content: `Share memes, use them in chat, on the socials or even as a display picture!`
    },
    {
      ownership: 0,
      title: 'Wordler',
      content: `Can you defeat the Wordler? A word guessing game inspired from the NY Times website!`
    },
    {
      ownership: 0,
      title: 'Art',
      content: `Submit your art to the site and have others appraise your work!`
    },
    {
      ownership: 0,
      title: 'Mastermind',
      content: `The classic Mastermind game! A color sequence guessing game inspired from the original board game.`
    },
    {
      ownership: 0,
      title: 'Chat',
      content: `Chat system to connect you with your friends or groups of friends.`
    },
    {
      ownership: 0,
      title: 'Favourites',
      content: `Share and keep track of your favourite links.
  Make a list of your favourites, other users can see and search for the links you added too! Track how
  many people also added the favourite you created and see how popular your favourites are!`
    },
    {
      ownership: 0,
      title: 'Top100',
      content: `Create lists in topics and rank them according to a user voting system! 
  Use this to promote your favorite site, products, or just create a ranking list on any topic!`
    },
    {
      ownership: 0,
      title: 'Ender',
      content: `Ender is a fast multiplayer arena where neon lightcycles race and duel.
Players outmaneuver each other, lay down bike-walls to trap foes, and compete for survival and high scores.
Retro pixel visuals, short rounds, and emergent tactics make every match intense and replayable.`
    },
    {
      ownership: 0,
      title: 'Bones',
      content: `Action MMORPG, Under construction.`
    },
    {
      ownership: 0,
      title: 'Array',
      content: `The Array transports users down a seemingly infinite array.
  The further you go down the array, the more experience you gain.
  Find items to make you stronger!
  Fight other players for glory!`
    },
    {
      ownership: 0,
      title: 'Theme',
      content: `Change the site's theme! Share your theme with others or use a theme someone else has shared!`
    },
    {
      ownership: 0,
      title: 'Emulator',
      content: `Our emulator emulates multiple game consoles directly in your browser! Featuring:
      <ul>
        <li>Keeps track of your saved progress right on the server! Pick up and play from anywhere or any device as long as you are logged in.</li>
        <li>Supports mobile and desktop devices (any OS).</li>
        <li>Supports multiple gamepads and controllers, keyboard or direct-touch mode (for mobile devices).</li>
      </ul>
      <small>
        Currently supported systems: 3DO, Arcade, Atari 2600, Atari 5200, Atari 7800, Atari Jaguar, Atari Lynx,
        ColecoVision, Commodore 64, Commodore 128, Commodore Amiga, Commodore PET, Commodore Plus4, Commodore VIC-20, MAME 2003,
        NES-Famicom, Nintendo 64, Nintendo DS, Nintendo Game Boy Advance, Nintendo Game Boy, PlayStation, PSP, Sega 32X, Sega CD,
        Sega Game Gear, Sega Master System, Sega Mega Drive, Sega Saturn, SNES-Super Famicom, Virtual Boy
      </small>`
    }
  ];

  lastRunTimestamps: { [key: string]: number } = {};
  notificationTimers: { [key: string]: { timeout?: any; interval?: any } } = {};
  notificationsPausedAt: any;
  notificationsActive = false; // master flag to gate polling
  location?: { ip: string, city: string, country: string } = undefined;
  sessionToken?: string = undefined;
  userIdCache = new Map<string, number>()
  pollChecked = false;
  pollQuestion = "";
  pollResults: any = null;
  private isPollLoading = false;
  isShowingUserTagPopup = false;
  isShowingSecurityPopup = false;
  preventShowSecurityPopup = false;
  popupUserTagUser?: User;
  isSpeaking = false; 
  isShowingPasswordResetResult = false;
  passwordResetResultMessage = '';
  passwordResetResultSuccess = false;
  private securityTimeout: any = null;
  private componentMap: { [key: string]: any; } = {
    "Navigation": NavigationComponent,
    "Favourites": FavouritesComponent,
    "Calendar": CalendarComponent,
    "Weather": WeatherComponent,
    "Files": FileComponent,
    "Todo": TodoComponent,
    "Music": MusicComponent,
    "Notepad": NotepadComponent,
    "Contacts": ContactsComponent,
    "Emulator": EmulatorComponent,
    "Array": ArrayComponent,
    "Bug-Wars": NexusComponent,
    "Meta-Bots": MetaComponent,
    "Wordler": WordlerComponent,
    "Mastermind": MastermindComponent,
    "Art": ArtComponent,
    "News": NewsComponent,
    "Crypto-Hub": CryptoHubComponent,
    "User": UserComponent,
    "Chat": ChatComponent,
    "Social": SocialComponent,
    "HostAi": HostAiComponent,
    "Theme": ThemesComponent,
    "MediaViewer": MediaViewerComponent,
    "Crawler": CrawlerComponent,
    "Meme": MemeComponent,
    "Top100": TopComponent,
    "Ender": EnderComponent,
    "Bones": BonesComponent,
    "Notifications": NotificationsComponent,
    "UpdateUserSettings": UpdateUserSettingsComponent
  };
  userSelectedNavigationItems: Array<MenuItem> = [];
  constructor(private router: Router,
    private userService: UserService,
    private crawlerService: CrawlerService,
    private favouriteService: FavouriteService,
    private fileService: FileService,
    private pollService: PollService,
    private meta: Meta,
    private title: Title,
    private changeDetectorRef: ChangeDetectorRef,
    private sanitizer: DomSanitizer,
    private angLocation: Location,
  ) { }

  ngOnInit() {
    if (this.getCookie("user")) {
      this.user = JSON.parse(this.getCookie("user"));
    }
    this.updateHeight();
    this.getSelectedMenuItems()
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/firebase-messaging-sw.js')
        .then((registration) => {
          //console.log('Service Worker registered:', registration);
        })
        .catch((error) => {
          console.error('Service Worker registration failed:', error);
        });
    }
    this.updateLastSeenPeriodically();
    try {
      const saved = window.localStorage.getItem('leftPanelWidth');
      if (saved) {
        this.leftPanelWidth = parseInt(saved, 10);
      } else {
        this.leftPanelWidth = Math.max(this.minLeftPanelWidth, 260);
      }
      this.maxLeftPanelWidth = Math.max(this.leftPanelWidth, Math.floor((window.innerWidth || 1200) * 0.8));
    } catch { this.leftPanelWidth = Math.max(this.minLeftPanelWidth, 350); }
  }

  ngAfterViewInit() {
    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        console.log("NavigationEnd:", this.router.url);
        if (this.router.url.includes('Memes')) {
          this.checkAndClearRouterOutlet();
          const memeId = this.router.url.toLowerCase().split('memes/')[1]?.split('?')[0];
          this.angLocation.replaceState(this.router.url.split('?')[0]);
          this.createComponent("Meme", { "memeId": memeId });
        }
        else if (this.router.url.includes('Social')) {
          this.checkAndClearRouterOutlet();
          const storyId = this.router.url.toLowerCase().split('social/')[1]?.split('?')[0];
          this.angLocation.replaceState(this.router.url.split('?')[0]);
          this.createComponent("Social", { "storyId": storyId });
        }
        else if (this.router.url.includes('ResetPassword')) {
          this.checkAndClearRouterOutlet();
          const token = this.router.url.split('ResetPassword/')[1]?.split('?')[0];
          this.angLocation.replaceState(this.router.url.split('/')[0]);
          this.handlePasswordResetFromEmail(token);
        }
        else if (this.router.url.includes('User')) {
          this.checkAndClearRouterOutlet();
          const userId = this.router.url.toLowerCase().split('user/')[1]?.split('?')[0].split('/')[0];
          const storyId = this.router.url.toLowerCase().split('user/')[1]?.split('/')[1];
          this.angLocation.replaceState(this.router.url.split('?')[0]);
          this.createComponent("User", { "userId": userId, storyId: storyId });
        }
        else if (this.router.url.toLowerCase().includes('emulator')) {
          try {
            const url = new URL(window.location.href);
            const sp = url.searchParams;
            const rom = sp.get('romname') || sp.get('romName') || undefined;
            const id = sp.get('romId') || sp.get('romID') || undefined;
            const skip = sp.get('skipSaveFile') || sp.get('skipsavefile') || undefined;
            const core = sp.get('forcedCore') || sp.get('forcedcore') || undefined;
            const inputs: any = {};
            if (rom) inputs.presetRomName = rom;
            if (id && !isNaN(Number(id))) inputs.presetRomId = Number(id);
            if (typeof skip !== 'undefined' && skip !== null) inputs.skipSaveFileRequested = (String(skip).toLowerCase() === 'true' || String(skip) === '1');
            if (core) inputs.presetForcedCore = core;
            inputs.inputtedParentRef = this;
            this.checkAndClearRouterOutlet();
            this.angLocation.replaceState(this.router.url.split('?')[0]);
            this.createComponent('Emulator', inputs);
          } catch (e) {
            console.log("Error parsing emulator URL parameters:", e);
            this.checkAndClearRouterOutlet();
            this.createComponent('Emulator');
          }
        }
        else if (this.router.url.includes('File') && !this.router.url.includes('Emulator')) {
          this.checkAndClearRouterOutlet();
          const fileId = this.router.url.toLowerCase().split('file/')[1]?.split('?')[0];
          this.angLocation.replaceState(this.router.url.split('?')[0]);
          this.createComponent("Files", { "fileId": fileId });
        }
        else if (this.router.url.includes('Media')) {
          this.checkAndClearRouterOutlet();
          const fileId = this.router.url.toLowerCase().split('media/')[1]?.split('?')[0];
          this.angLocation.replaceState(this.router.url.split('?')[0]);
          this.createComponent("MediaViewer", { "fileId": fileId, "isLoadedFromURL": true });
        }
        else if (this.router.url.includes('Crawler')) {
          this.checkAndClearRouterOutlet();
          const url = this.router.url.toLowerCase().split('crawler/')[1]?.split('?')[0];
          if (url) {
            this.createComponent("Crawler", { "url": url });
            this.angLocation.replaceState(this.router.url.split('?')[0]);
          } else {
            this.createComponent("Crawler");
          }
        }
        else if (this.router.url.includes('Array')) {
          this.checkAndClearRouterOutlet();
          this.createComponent('Array');
        }
        else if (this.router.url.toLowerCase().includes('emu')) {
          this.checkAndClearRouterOutlet();
          this.createComponent('Emulator');
        }
        else if (this.router.url.includes('War')) {
          this.checkAndClearRouterOutlet();
          this.createComponent('Bug-Wars');
        }
        else if (this.router.url.includes('Meta')) {
          this.checkAndClearRouterOutlet();
          this.createComponent('Meta-Bots');
        }
        else if (this.router.url.includes('Wordler')) {
          this.checkAndClearRouterOutlet();
          this.createComponent('Wordler');
        }
        else if (this.router.url.includes('Top')) {
          this.checkAndClearRouterOutlet();
          this.createComponent('Top100');
        }
        else if (this.router.url.toLowerCase().includes('ender')) {
          this.checkAndClearRouterOutlet();
          this.createComponent('Ender');
        }
        else if (this.router.url.toLowerCase().includes('bones')) {
          this.checkAndClearRouterOutlet();
          this.createComponent('Bones');
        }
        else if (this.router.url.toLowerCase().includes('mastermind')) {
          this.checkAndClearRouterOutlet();
          this.createComponent('Mastermind');
        }
        else if (this.router.url.toLowerCase().includes('crypto') || this.router.url.toLowerCase().includes('cryptocurrency') || this.router.url.toLowerCase().includes('defi')) {
          this.checkAndClearRouterOutlet();
          this.createComponent('Crypto-Hub');
        }
        else if (this.router.url.includes('Host') || this.router.url.includes('HostAi') || this.router.url.includes('Ai')) {
          this.checkAndClearRouterOutlet();
          this.createComponent('HostAi');
        }
        else if (!this.user) {
          this.createComponent('User');
        }
      }
    });
  }

  async getSelectedMenuItems() {
    if (!this.user) {
      const guestTitles = [
        "Social",
        "Meme",
        "Chat",
        "Wordler",
        "Emulator",
        "Files",
        "Crypto-Hub",
        "Favourites",
        "Crawler",
        "HostAi",
        "User",
        "Help",
      ];
      this.userSelectedNavigationItems = this.navigationItems.filter(item =>
        guestTitles.includes(item.title)
      );
    } else {
      this.userSelectedNavigationItems = await this.userService.getUserMenu(this.user.id);
    }
    this.isNavigationInitialized = true;
  }
  checkAndClearRouterOutlet() {
    if (this.outlet) {
      this.router.navigate(['/']);
      this.router.dispose();
    }
  }

  createComponent(componentType: string, inputs?: { [key: string]: any; }, previousComponentParameters?: { [key: string]: any; }) {
    //console.log("in create component : " + componentType);
    this.navigationComponent?.minimizeNav();
    this.closeOverlay();
    this.replacePageTitleAndDescription(componentType, componentType);

    if (!componentType || componentType.trim() === "") {
      this.navigationComponent?.maximizeNav();
      this.showNotification("Invalid component type received. Returned to menu.");
      return;
    }

    const componentClass = this.componentMap[componentType];
    if (!componentClass) {
      this.navigationComponent?.maximizeNav();
      this.showNotification("Invalid component type received. Returned to menu.");
      return;
    }
    const existingComponent = this.componentsReferences.find(compRef => compRef.instance instanceof componentClass);

    if (componentType !== "User" && existingComponent) {
      return;
    }

    this.removeAllComponents();

    const childComponentRef = this.VCR.createComponent(componentClass);
    let childComponent: any = childComponentRef.instance;
    childComponent.unique_key = ++this.child_unique_key;
    childComponent.parentRef = this;

    if (inputs) {
      Object.keys(inputs).forEach(key => {
        childComponent[key] = inputs[key];
      });
    }

    this.updateLastSeen();
    this.currentComponent = componentType;
    this.currentComponentParameters = previousComponentParameters ?? inputs;
    this.componentsReferences.push(childComponentRef);
    return childComponentRef;
  }
  removeComponent(key: number) {
    if (!this.VCR || this.VCR.length < 1) return;
    this.replacePageTitleAndDescription("Bug Hosted", "Bug Hosted");
    this.removeResizeListener();
    history.pushState({ page: "" }, "", "/");

    const componentRef = this.componentsReferences.find(
      x => x.instance.unique_key == key
    );

    for (let x = 0; x < this.VCR.length; x++) {
      if ((this.VCR.get(x)) == componentRef?.hostView) {
        this.VCR.remove(x);
        componentRef?.destroy();
      }
    }

    this.componentsReferences = this.componentsReferences.filter(
      x => x.instance.unique_key !== key
    );
    this.currentComponentParameters = undefined;
    this.navigationComponent?.maximizeNav();
  }

  removeAllComponents() {
    if (!this.VCR || this.VCR.length < 1) return;

    this.componentsReferences.forEach(componentRef => {
      componentRef.destroy();
    });

    this.VCR.clear();
    this.componentsReferences = [];
    this.isShowingUserTagPopup = false;
  }

  async resetUserCookie() {
    this.deleteCookie("user");
    this.deleteCookie("BHUserToken");
    this.setCookie("user", JSON.stringify(this.user), 10);
    this.setCookie("BHUserToken", await this.encryptNumber(this.user?.id ?? 0), 10);
  }
  deleteCookie(name: string) {
    this.setCookie(name, '', 1);
  }
  setCookie(name: string, value: string, expireDays: number, path: string = '') {
    const d: Date = new Date();
    d.setTime(d.getTime() + expireDays * 24 * 60 * 60 * 1000);
    const expires: string = `expires=${d.toUTCString()}`;
    const cpath: string = `; path=${path || '/'}`;
    const domain = '; domain=.bughosted.com';
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    const sameSite = '; SameSite=Lax';
    document.cookie = `${name}=${value}; ${expires}${cpath}${domain}${sameSite}${secure}`;
  }
  getCookie(name: string) {
    let ca: Array<string> = document.cookie.split(';');
    let caLen: number = ca.length;
    let cookieName = `${name}=`;
    let c: string;

    for (let i: number = 0; i < caLen; i += 1) {
      c = ca[i].replace(/^\s+/g, '');
      if (c.indexOf(cookieName) == 0) {
        return c.substring(cookieName.length, c.length);
      }
    }
    return '';
  }
  async getSessionToken(): Promise<string> {
    if (this.sessionToken) return this.sessionToken;
    const ctoken = this.getCookie("BHUserToken");
    if (ctoken) return ctoken;
    this.sessionToken = await this.encryptNumber(this.user?.id ?? 0);
    this.setCookie("BHUserToken", this.sessionToken, 10);
    return this.sessionToken;
  }
  async encryptNumber(userId: number): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12)); // 12-byte IV for AES-GCM
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode("BHSN123!@#33@!".padEnd(32, "_")), // pad to 32 bytes
      "AES-GCM",
      false,
      ["encrypt"]
    );

    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      keyMaterial,
      new TextEncoder().encode(userId.toString())
    );

    // Combine IV + encrypted data as base64
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    return btoa(String.fromCharCode(...combined));
  }

  openModal(isModal?: boolean, hasGamingFont?: boolean) {
    this.isModalOpen = true;
    setTimeout(() => {
      if (isModal) {
        this.isModal = true;
        this.modalComponent.isModal = true;
      } else if (!isModal || isModal === undefined) {
        this.isModal = false;
        this.modalComponent.isModal = false;
      }
      this.modalComponent.hasGamingFont = hasGamingFont ?? true;
    }, 100);
  }

  closeModal() {
    this.isModalOpen = false;
    this.modalComponent.isCloseButtonVisible = true;
  }
  setModalBody(msg: any) {
    if (!this.isModalOpen) {
      this.isModalOpen = true;
    }
    setTimeout(() => {
      this.modalComponent.setModalBody(msg);
    }, 100);
  }
  setModalHeader(msg: any) {
    if (!this.isModalOpen) {
      this.isModalOpen = true;
    }
    setTimeout(() => {
      this.modalComponent.setModalHeader(msg);
    }, 100);
  }
  updateHeight() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
    // update desktop detection based on viewport width
    try {
      const prev = this.isDesktop;
      this.isDesktop = window.innerWidth >= 1024;
      if (prev !== this.isDesktop) {
        // trigger change detection when layout mode changes
        try { this.changeDetectorRef.detectChanges(); } catch { }
      }
    } catch { }
  }
  hideBodyOverflow() {
    document.body.style.overflow = "hidden";
    const elems = document.getElementsByClassName("popupPanel");
    for (let x = 0; x < elems.length; x++) {
      (elems[x] as HTMLDivElement).style.overflow = "hidden";
    }
    const elems2 = document.getElementsByClassName("componentContainer");
    for (let x = 0; x < elems2.length; x++) {
      (elems2[x] as HTMLDivElement).style.overflow = "hidden";
    }
    const elems3 = document.getElementsByClassName("componentMain");
    for (let x = 0; x < elems3.length; x++) {
      (elems3[x] as HTMLDivElement).style.overflow = "hidden";
    }
    const elems4 = document.getElementsByTagName("html");
    for (let x = 0; x < elems4.length; x++) {
      (elems4[x] as HTMLElement).style.overflow = "hidden";
    }
  }
  restoreBodyOverflow() {
    document.body.style.overflow = "";
    const elems = document.getElementsByClassName("popupPanel");
    for (let x = 0; x < elems.length; x++) {
      (elems[x] as HTMLDivElement).style.overflow = "";
    }
    const elems2 = document.getElementsByClassName("componentMain");
    for (let x = 0; x < elems2.length; x++) {
      (elems2[x] as HTMLDivElement).style.overflow = "";
    }
    const elems3 = document.getElementsByClassName("componentContainer");
    for (let x = 0; x < elems3.length; x++) {
      (elems3[x] as HTMLDivElement).style.overflow = "";
    }
    const elems4 = document.getElementsByTagName("html");
    for (let x = 0; x < elems4.length; x++) {
      (elems4[x] as HTMLElement).style.overflow = "";
    }
  }
  showOverlay() {
    this.isShowingOverlay = true;
    this.hideBodyOverflow();
  }
  closeOverlay(clickButton = true) {
    if (clickButton) {
      const closeButtons = document.querySelectorAll<HTMLButtonElement>("#closeOverlay");

      closeButtons.forEach((button) => {
        const style = window.getComputedStyle(button);
        const isVisible =
          button.offsetParent !== null && // Not display: none or detached
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          style.opacity !== '0';

        if (isVisible) {
          button.click();
        }
      });
    }
    this.isShowingOverlay = false;
    this.restoreBodyOverflow();
  }
  showUserTagPopup() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => {
      this.isShowingUserTagPopup = true;
    }, 500);
  }
  openUserSettings(previousComponent?: string) {
    this.createComponent('UpdateUserSettings', {
      showOnlySelectableMenuItems: false,
      areSelectableMenuItemsExplained: false,
      inputtedParentRef: this,
      previousComponent: previousComponent
    });
  }
  setViewportScalability(scalable?: boolean) {
    if (scalable === undefined) {
      scalable = true;
    }

    if (scalable) {
      window.location.reload();
    } else {
      this.meta.updateTag({ name: 'viewport', content: `width=device-width, initial-scale=1.0, user-scalable=no` });
    }
  }

  async handlePasswordResetFromEmail(token: string) {
    if (!token) {
      this.passwordResetResultMessage = 'Invalid reset link.';
      this.passwordResetResultSuccess = false;
      this.isShowingPasswordResetResult = true;
      this.showOverlay();
      this.createComponent('User');
      return;
    }
    try {
      const response = await this.userService.resetPasswordWithToken(token);
      const result = await response.json();
      this.passwordResetResultMessage = result?.message ?? (response.ok ? 'Password reset successfully.' : 'Failed to reset password.');
      this.passwordResetResultSuccess = response.ok;
    } catch {
      this.passwordResetResultMessage = 'An error occurred while resetting your password.';
      this.passwordResetResultSuccess = false;
    }
    this.isShowingPasswordResetResult = true;
    this.showOverlay();
    this.createComponent('User');
  }

  closePasswordResetResultPopup() {
    this.isShowingPasswordResetResult = false;
    this.passwordResetResultMessage = '';
    this.passwordResetResultSuccess = false;
    this.closeOverlay();
  }

  showNotification(text?: string) {
    if (!text) { return; }
    else {
      this.notifications.push(text);
      setTimeout(() => { this.notifications.shift(); }, 8000);
    }
  }
  cleanStoryText(text: string) {
    return text?.replace(/\[\/?[^]\]/g, '')?.replace(/https?:\/\/[^\s]+/g, '');
  }
  replacePageTitleAndDescription(title: string, description: string, image?: string) {
    let tmpTitle = title;
    let tmpDescription = description;
    const tmpImage = image ?? "https://bughosted.com/assets/logo.jpg";
    const tmpImageExtension = this.fileService.getFileExtension(tmpImage);
    const fileIsVideo = this.fileService.videoFileExtensions.includes(tmpImageExtension);

    // Clean the title and description text
    tmpTitle = this.cleanStoryText(tmpTitle);
    tmpDescription = this.cleanStoryText(tmpDescription);

    // Set the page title
    this.title.setTitle(tmpTitle);

    // Update the description meta tag
    this.meta.updateTag({ name: 'description', content: tmpDescription ?? tmpTitle });

    // Open Graph (Facebook) Meta Tags
    this.meta.updateTag({ property: 'og:title', content: tmpTitle });
    this.meta.updateTag({ property: 'og:description', content: tmpDescription ?? tmpTitle });

    if (fileIsVideo) {
      // Video meta tags for Open Graph
      this.meta.updateTag({ property: 'og:type', content: 'video.other' });
      this.meta.updateTag({ property: 'og:video', content: tmpImage });
      this.meta.updateTag({ property: 'og:video:type', content: `video/${tmpImageExtension}` });
    } else {
      // Image meta tags for Open Graph
      this.meta.updateTag({ property: 'og:image', content: tmpImage });
      this.meta.updateTag({ property: 'og:image:secure_url', content: tmpImage });
      this.meta.updateTag({ property: 'og:image:type', content: `image/${tmpImageExtension}` });
    }

    // Twitter Meta Tags
    this.meta.updateTag({ name: 'twitter:title', content: tmpTitle });
    this.meta.updateTag({ name: 'twitter:description', content: tmpDescription ?? tmpTitle });
    this.meta.updateTag({ name: 'twitter:image', content: tmpImage });
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });

    // Google+ Meta Tags (deprecated, but some systems may still check)
    this.meta.updateTag({ itemprop: 'name', content: tmpTitle });
    this.meta.updateTag({ itemprop: 'description', content: tmpDescription ?? tmpTitle });
    this.meta.updateTag({ itemprop: 'image', content: tmpImage });

    // LinkedIn Meta Tags
    this.meta.updateTag({ property: 'og:title', content: tmpTitle });
    this.meta.updateTag({ property: 'og:description', content: tmpDescription ?? tmpTitle });
    this.meta.updateTag({ property: 'og:image', content: tmpImage });

    // Schema.org (for SEO purposes)
    this.meta.updateTag({ itemprop: 'name', content: tmpTitle });
    this.meta.updateTag({ itemprop: 'description', content: tmpDescription ?? tmpTitle });
    this.meta.updateTag({ itemprop: 'image', content: tmpImage });

    return {
      title: tmpTitle,
      description: tmpDescription,
      image: tmpImage
    };
  }

  getTextForDOM(text?: string, component_id?: any) {
    if (!text) return "";
    text = this.processPolls(text, component_id);
    // Decode custom [label][url] link syntax into HTML anchors before other processing
    text = this.decodeInlineLinks(text);

    const youtubeRegex = /(https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)([\w-]{11})|youtu\.be\/([\w-]{11}))(?:\S+)?)/g;

    // Step 1: Temporarily replace YouTube links with placeholders
    text = text.replace(youtubeRegex, (match, url, videoId, shortVideoId) => {
      const id = videoId || shortVideoId;
      return `__YOUTUBE__${id}__YOUTUBE__`;
    });

    // Step 2: Convert regular URLs into clickable links
    text = text.replace(/(<a[^>]*>.*?<\/a>)|(https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+)/gi, (match, existingLink, url) => {
      if (existingLink) return existingLink;
      return `<a href='${url}' target="_blank" onClick="document.getElementById('hiddenUrlToVisit').value='${url}';document.getElementById('hiddenUrlToVisitButton').click()" class=cursorPointer>${url}</a>`;
    }).replace(/\n/g, '<br>');

    // Step 3: Replace YouTube placeholders with clickable links
    text = text.replace(/__YOUTUBE__([\w-]{11})__YOUTUBE__/g, (match, videoId) => {
      return `<a onClick="document.getElementById('youtubeVideoIdInput').value='${videoId}';document.getElementById('youtubeVideoButton').click()" class="cursorPointer youtube-link">https://www.youtube.com/watch?v=${videoId}</a>`;
    });

    // Step 4: Convert quotes and style the quote text
    const processQuotes = (inputText: string): string => {
      let processedText = inputText;
      while (/\[Quoting \{(.+?)\|(\d+)\|([\d-T:.]+)\}: (.*?)\](?!\])/gs.test(processedText)) {
        processedText = processedText.replace(/\[Quoting \{(.+?)\|(\d+)\|([\d-T:.]+)\}: (.*?)\](?!\])/gs, (match, username, userId, timestamp, quotedMessage) => {
          const formattedTimestamp = this.convertUtcToLocalTime(timestamp);
          const maxLength = 200;
          const truncatedMessage = quotedMessage.length > maxLength && !quotedMessage.includes("____QUOTE_START____") && !quotedMessage.includes("____QUOTE_END____") ? quotedMessage.slice(0, maxLength) + "..." : quotedMessage;
          const escapedQuotedMessage = encodeURIComponent(truncatedMessage);
          return `
            ____QUOTE_START____<div class="quote-text quote-link" onClick="document.getElementById('scrollToQuoteDateInput').value='${timestamp}';document.getElementById('scrollToQuoteMessageInput').value='${escapedQuotedMessage}';document.getElementById('quoteClickButton').click()">
                <span class="quote-user">${username}</span>
                <span class="quote-time">(${formattedTimestamp})</span>:  
                "<span class="quote-message">${truncatedMessage}</span>"
            </div>____QUOTE_END____`;
        });
      }
      processedText = processedText.replace(/____QUOTE_END____/g, '').replace(/____QUOTE_START____/g, '');
      return processedText;
    };

    text = processQuotes(text);
    text = text
      .replace(/(<br[^>]*>[\s\r\n]*)*(#{2,4})\s+([^<\r\n]+)([\s\r\n]*<br[^>]*>)*/gi,
        (match, leadingBr, hashes, title, trailingBr) => {
          // Calculate header level (minimum h2, maximum h3)
          const hashCount = Math.min(hashes.length, 4); // Count # symbols
          const headerLevel = Math.min(hashCount, 3);   // Limit to h3 maximum

          // Keep original <br> tags but replace header
          return (leadingBr || '') +
            `<h${headerLevel}>${title.trim()}</h${headerLevel}>` +
            (trailingBr || '');
        }
      ).replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
      .replace(/\[b\](.*?)\[\/b\]/gi, "<b>$1</b>")
      .replace(/\[\*\](.*?)\[\/\*\]/gi, "<br>• $1")
      .replace(/\[i\](.*?)\[\/i\]/gi, "<i>$1</i>")
      .replace(/\[u\](.*?)\[\/u\]/gi, "<u>$1</u>");

    text = this.replaceEmojisInMessage(text);

    // Step 6: Replace ||component:<component-name>|| with a clickable span
    text = text.replace(/\|\|component:([\w-]+)\|\|/g, (match, componentName) => {
      return `<span onClick="document.getElementById('componentCreateName').value='${componentName}';document.getElementById('componentCreateClickButton').click()" class="linkedComponent">${componentName}${this.getIconByTitle(componentName)}</span>`;
    });

    // Step 7: Replace @username with a placeholder for UserTagComponent
    text = text.replace(/@(\w+)/g, (match, username) => {
      return `<span class="userMentionSpan" onClick="document.getElementById('userMentionInput').value='${username}';document.getElementById('userMentionButton').click()" class="user-mention">@${username}</span>`;
    });

    // Step 8: Replace [spoiler]...[/spoiler] with an inline clickable span that triggers
    // a hidden button (so the event is routed through Angular like user mentions)
    text = text.replace(/\[spoiler\](.*?)\[\/spoiler\]/gis, (match, inner) => {
      const safeInner = (inner ?? '').replace(/'/g, "&#39;").replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<span class="spoiler" role="button" title="${safeInner}"><span class="spoiler__content">${safeInner}</span></span>`;
    });

    return this.sanitizer.bypassSecurityTrustHtml(text);
  }

  private processPolls(text: string, component_id: any): string {
    const pollRegex = /\[Poll\](.*?)\[\/Poll\]/gs;
    const normalizeComponentId = (comp: any) => {
      if (!comp && comp !== 0) return '';
      const s = String(comp);
      const prefixes = ['commentText', 'storyText', 'messageText'];
      foreachPrefix:
      for (const p of prefixes) {
        const idx = s.lastIndexOf(p);
        if (idx >= 0) {
          return s.substring(idx);
        }
      }
      return s;
    };

    return text.replace(pollRegex, (match: string, content: string): string => {
      const normalizedComponentId = normalizeComponentId(component_id);
      // Generate a unique ID for this poll
      const pollId = `poll_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Parse poll content
      const lines: string[] = content
        .split('\n')
        .map((l: string) => l.trim())
        .filter((l: string) => l);

      if (lines.length < 2) {
        return '<div class="poll-error">Invalid poll format</div>';
      }

      const question: string = lines[0].replace('Question:', '').trim();
      const options: string[] = lines
        .slice(1)
        .filter((line: string) => line.startsWith('Option'))
        .map((line: string) => line.replace(/Option \d+:/, '').trim());

      if (options.length < 2) {
        return '<div class="poll-error">Poll needs at least 2 options</div>';
      }

      // Generate poll HTML
      let pollHtml: string = `<div class="poll-container"><div class="poll-question">${question}</div><div class="poll-options">`;
      let hasVoted = false;
      options.forEach((option: string, index: number) => {
        if (!option.includes("votes, ")) {
          const escOption = ('' + option).replace(/'/g, "");
          // mark interactive options with an extra class so we can layout checkbox next to text
          pollHtml += `
            <div class="poll-option">
              <div class="poll-option-interactive">
                <input type="checkbox" value="${option}" id="poll-option-${pollId}-${index}" name="poll-options-${pollId}" onClick="document.getElementById('pollCheckId').value='poll-option-${pollId}-${index}';document.getElementById('pollValue').value='${escOption}';document.getElementById('pollQuestion').value='${this.htmlEncodeForInput(question)}';document.getElementById('pollComponentId').value='${normalizedComponentId}';document.getElementById('pollCheckClickedButton').click()">
                <label for="poll-option-${pollId}-${index}" onClick="document.getElementById('pollCheckId').value='poll-option-${pollId}-${index}';document.getElementById('pollValue').value='${escOption}';document.getElementById('pollQuestion').value='${this.htmlEncodeForInput(question)}';document.getElementById('pollComponentId').value='${normalizedComponentId}';document.getElementById('pollCheckClickedButton').click()">${option}</label>
              </div>
            </div>
          `;
        } else {
          hasVoted = true;
          const optionText = option.trim();
          // Robustly extract percentage (handles commas inside option text)
          let percentage = 0;
          const pctMatch = optionText.match(/(\d+)\s*%/);
          if (pctMatch && pctMatch[1]) {
            percentage = parseInt(pctMatch[1], 10) || 0;
          }
          pollHtml += `
          <div class="poll-option">
            <div class="poll-option-text">
              ${optionText} ${percentage > 0 ? `<span class="poll-bar" style="width: ${percentage}%">(${percentage}%)</span>` : ''}
              </div>
                     </div>`;
        }
      });

      pollHtml += `</div></div>`;

      return pollHtml.replace(/\n/g, '');
    });
  }
  private htmlEncodeForInput(str: string): string {
    return str.replaceAll("'", "");
  }
  getIconByTitle(title: string): string | undefined {
    if (title.toLowerCase() == "reactions") return "🙂";
    const item = this.navigationItems.find(x => x.title === title);
    return item?.icon;
  }
  replaceEmojisInMessage(msg: string) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const escapedKeys = Object.keys(this.emojiMap).map(key => key.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'));
    const emojiRegex = new RegExp(escapedKeys.join("|"), "g");

    // Split the message into parts that are URLs and parts that are not
    const parts = msg.split(urlRegex);

    // Process each part
    const processedParts = parts.map(part => {
      if (urlRegex.test(part)) {
        // If the part is a URL, return it unmodified
        return part;
      } else {
        // If the part is not a URL, perform emoji replacement
        return part.replace(emojiRegex, match => this.emojiMap[match]);
      }
    });

    // Reassemble the message from the processed parts
    return processedParts.join('');
  }


  scrollToQuote() {
    let timestamp = (document.getElementById("scrollToQuoteDateInput") as HTMLInputElement).value;
    let message = (document.getElementById("scrollToQuoteMessageInput") as HTMLInputElement).value;
    if (!timestamp || !message) {
      //console.log("No message or timestamp found for quote.");
      return;
    }
    message = decodeURIComponent(message);
    const messageElements = [
      ...Array.from(document.getElementsByTagName("div")),
      ...Array.from(document.getElementsByTagName("span")),
    ];
    let foundMatch = false;
    for (const element of messageElements) {
      const elementText = element.textContent?.trim() || "";
      const elementTimestamp = element.getAttribute('data-timestamp');

      if (
        (elementText.toLowerCase().includes(message.toLowerCase())
          && (element.classList.contains('messageContainer') || element.classList.contains('commentContent')))
        || elementTimestamp === timestamp) {
        foundMatch = true;
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        break;
      }
    }
    if (!foundMatch) {
      console.log("No matching message found.");
    }
  }
  formatTimestamp(timestamp: any) {
    const date = new Date(timestamp);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${month}/${day} ${hours}:${minutes}`;
  }
  convertUtcToLocalTime(date?: Date): string {
    if (!date) return "";

    // Get the user's local time zone dynamically
    const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Check if the date is already in UTC format, if not, treat it as UTC
    const utcDate = date.toString().includes("Z") ? new Date(date) : new Date(date + "Z");

    const options = {
      timeZone: userTimeZone,  // Use the user's local time zone
      hour12: false,           // 24-hour format
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric'
    } as Intl.DateTimeFormatOptions;

    return utcDate.toLocaleString('en-US', options);  // Format the date with the user's time zone
  }
  getDirectoryName(file: FileEntry): string {
    let base = file.directory?.replace('E:/Dev/maxhanna/maxhanna.client/src/assets/Uploads/', '').trim();
    if (base === "") {
      return ".";
    }
    return base ?? "";
  }
  addResizeListener() {
    window.removeEventListener('resize', this.updateHeight);
    setTimeout(() => {
      this.updateHeight();
      window.addEventListener('resize', this.updateHeight);
    }, 10);
  }
  removeResizeListener() {
    window.removeEventListener('resize', this.updateHeight);
  }
  playYoutubeVideo(videoId?: string) {
    this.showOverlay();
    this.isShowingYoutubePopup = true;
    console.log("Playing YouTube video with ID:", videoId);
    videoId = videoId ?? (document.getElementById('youtubeVideoIdInput') as HTMLInputElement).value;
    setTimeout(() => {
      let target = document.getElementById(`youtubeIframe`) as HTMLIFrameElement;
      if (!target || !videoId) {
        console.error("YouTube iframe or video ID not found.");
        return;
      }
      target.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1`;
    }, 50);
  }
  closeYoutubePopup() {
    this.closeOverlay();
    let target = document.getElementById(`youtubeIframe`) as HTMLIFrameElement;
    if (target) {
      target.src = '';
    }
    this.isShowingYoutubePopup = false;
  }
  isYoutubeUrl(url?: string) {
    if (!url) return false;
    try {
      const parsedUrl = new URL(url);
      const isYoutubeDomain = ['www.youtube.com', 'm.youtube.com', 'youtube.com', 'youtu.be'].includes(parsedUrl.hostname);

      return isYoutubeDomain;
    } catch (e) {
      return false;
    }
  }
  getYouTubeVideoId(url?: string): string | null {
    if (!url) return null;
    return this.fileService.parseYoutubeId(url);
  }
  createComponentButtonClicked() {
    const title = (document.getElementById("componentCreateName") as HTMLInputElement).value;
    if (title) { this.createComponent(title); }
  }
  visitExternalLinkButtonClicked() {
    const url = (document.getElementById("hiddenUrlToVisit") as HTMLInputElement).value;
    (document.getElementById("hiddenUrlToVisit") as HTMLInputElement).value = "";
    this.indexLink(url);
  }
  visitExternalLink(url?: string, index = true, forceNewTab = false) {
    if (!url) return;
    if (index) {
      this.indexLink(url);
    }

    if (!forceNewTab && this.isYoutubeUrl(url)) {
      const videoId = this.getYouTubeVideoId(url);
      if (videoId) {
        this.playYoutubeVideo(videoId);
      }
    } else {
      window.open(url, '_blank');
    }

    event?.stopPropagation();
  }
  async indexLink(url: string) {
    this.crawlerService.indexLink(url);
  }

  async addFavourite(url?: string, imgUrl?: string, name?: string) {
    if (!this.user) return alert("You must be logged in to add a favourite!");
    if (!url) return alert("Url must be supplied to add a favourite!");

    let finalName = "";

    try {
      // Extract domain from URL (remove http(s):// and anything after TLD)
      const domainMatch = url.match(/^(?:https?:\/\/)?([^\/]+)/);
      const domain = domainMatch ? domainMatch[1] : "";

      if (domain.length <= 45) {
        finalName = domain; // Use domain if it fits
      } else if (name) {
        // If domain is too long, fallback to the provided name
        const splitName = name.split(" ");
        if (splitName.length > 1 && splitName[0].length <= 45) {
          finalName = splitName[0]; // Use first word if it fits
        } else {
          finalName = name.substring(0, 45); // Hard truncate to 45 chars
        }
      } else {
        finalName = domain.substring(0, 45); // If name is null and domain is long, truncate it
      }
    } catch (error) {
      console.error("Error processing name:", error);
      finalName = name ? name.substring(0, 45) : url.substring(0, 45); // Fallback: hard truncate
    }

    this.favouriteService.updateFavourites(this.user, url, 0, imgUrl, finalName).then(res => {
      if (res) {
        this.showNotification(res.message || res);
      }
    });

    event?.stopPropagation();
  }
  async updateLastSeenPeriodically() {
    if (this.securityTimeout) {
      clearTimeout(this.securityTimeout);
    }
    this.securityTimeout = setTimeout(() => {
      if (!this.preventShowSecurityPopup) {
        this.isShowingSecurityPopup = true;
        this.showOverlay();
      }
    }, 60 * 60 * 1000); // 1 hour
  }
  closeSecurityPopup() {
    this.isShowingSecurityPopup = false;
    this.closeOverlay();
  }
  async updateLastSeen(user?: User) {
    const tmpUser = user ?? this.user;
    if (tmpUser?.id) {
      const now = Date.now();
      // If we've updated less than 10s ago, skip the server call
      if (this.lastLastSeenUpdate && (now - this.lastLastSeenUpdate) < 10000) {
        tmpUser.lastSeen = new Date();
      } else {
        // perform server update and record timestamp
        this.userService.updateLastSeen(tmpUser.id);
        this.lastLastSeenUpdate = now;
        tmpUser.lastSeen = new Date();
      }
    }
    this.updateLastSeenPeriodically();
  }
  async isServerUp(): Promise<number> {
    try {
      // Create a timeout promise that rejects after 10 seconds
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Timeout after 10 seconds')), 10000);
      });

      // Race the getUserCount call against the timeout
      const usersCount = await Promise.race([
        this.userService.getUserCount(),
        timeoutPromise
      ]);

      const count = parseInt(usersCount ?? "0");
      return (isNaN(count) || count == 0) ? -1 : count;

    } catch (error) {
      console.error('Server check failed:', error);
      return -1;
    }
  }
  async getLocation(user?: User) {
    if (user?.id && this.user?.id != user.id) {
      const res = await this.userService.getUserIpFromBackend(user.id);
      if (res) {
        return { ip: res.ip, city: res.city, country: res.country };
      }
    }
    if (this.location) {
      return this.location;
    }
    else {
      if (this.getCookie("location")) {
        this.location = JSON.parse(this.getCookie("location"));
      } else {
        await this.userService.getUserIp().then(res => {
          if (res) {
            this.location = { ip: res.ip, city: res.city, country: res.country };
            this.setCookie("location", JSON.stringify(this.location), 1);
            if (this.user && this.user.id) {
              this.userService.updateIPAddress(this.user.id, res.ip, res.city, res.country);
            }
          }
        });
      }
      return this.location;
    }
  }
  async getUsersByUsernames(text: string): Promise<User[]> {
    const usernameRegex = /@(\w+)/g;
    const matches = text.match(usernameRegex) || [];
    const usernames = matches.map(match => match.slice(1));

    // Example: Validate usernames with UserService
    const validUsers: User[] = [];
    for (const username of usernames) {
      const user = await this.userService.getUserByUsername(username);
      if (user) validUsers.push(user);
    }
    return validUsers;
  }

  async handlePollCheckClicked() {
    if (this.isPollLoading) return;
    clearTimeout(this.debounceTimer);
    // mark loading immediately and disable UI for the relevant poll
    this.isPollLoading = true;
    // attempt to read componentId from hidden input right away to disable only that poll
    const initialComponentId = (document.getElementById("pollComponentId") as HTMLInputElement)?.value ?? '';
    if (initialComponentId) {
      const container = document.getElementById(initialComponentId);
      if (container) {
        container.querySelectorAll('input, button, label').forEach((el: Element) => {
          try {
            if (el instanceof HTMLInputElement || el instanceof HTMLButtonElement) {
              (el as HTMLInputElement | HTMLButtonElement).disabled = true;
            } else if (el instanceof HTMLLabelElement) {
              (el as HTMLElement).style.pointerEvents = 'none';
            } else {
              (el as HTMLElement).style.pointerEvents = 'none';
            }
            (el as HTMLElement).classList.add('poll-disabled-by-loading');
          } catch (e) { }
        });
      }
    }

    this.debounceTimer = setTimeout(async () => {
      // Read basic hidden inputs
      const pollCheckIdElement = document.getElementById("pollCheckId") as HTMLInputElement | null;
      const checkInputId = pollCheckIdElement ? pollCheckIdElement.value : undefined;
      const pollQuestion = (document.getElementById("pollQuestion") as HTMLInputElement)?.value ?? '';
      const componentId = (document.getElementById("pollComponentId") as HTMLInputElement)?.value ?? '';

      // First, prefer explicit pollValue hidden input if present (set by the onclick handlers)
      const pollValueElement = document.getElementById('pollValue') as HTMLInputElement | null;
      const pollValueFromHidden = pollValueElement?.value;

      // Attempt to reliably find the chosen option's value.
      // Prefer a checked input inside the poll container, then the element referenced by pollCheckId,
      // then fall back to the label text for that input id.
      let checkValue: string | undefined = undefined;
      if (pollValueFromHidden && pollValueFromHidden.trim() !== '') {
        // Use provided pollValue as highest priority
        checkValue = pollValueFromHidden;
      }

      if (componentId) {
        const container = document.getElementById(componentId);
        if (container) {
          // 1) find any checked input inside the container
          const checked = container.querySelector<HTMLInputElement>('input[type="checkbox"]:checked, input[type="radio"]:checked');
          if (checked && checked.value) {
            checkValue = checked.value;
          }

          // 2) if not found, but we were given an input id, try to find that input inside the container
          if (!checkValue && checkInputId) {
            const inputEl = container.querySelector<HTMLInputElement>(`#${checkInputId}`);
            if (inputEl && inputEl.value) checkValue = inputEl.value;
          }
        }
      }

      // 3) global fallback: try to find element by id anywhere in document
      if (!checkValue && checkInputId) {
        const inputElGlobal = document.getElementById(checkInputId) as HTMLInputElement | null;
        if (inputElGlobal && inputElGlobal.value) {
          checkValue = inputElGlobal.value;
        } else {
          // 4) as a last resort, try the label text (sometimes inputs are missing value attributes)
          try {
            const label = document.querySelector<HTMLLabelElement>(`label[for="${checkInputId}"]`);
            if (label) checkValue = label.textContent?.trim() ?? '';
          } catch (e) { /* ignore */ }
        }
      }

      try {
        const res = await this.pollService.vote(this.user?.id ?? 0, checkValue ?? '', componentId);
        this.pollResults = res;
        this.pollChecked = true;
        this.pollQuestion = pollQuestion;
        // Render results immediately in-place so users see results instead of clickable options
        this.renderPollResultsInDom(componentId ?? initialComponentId ?? '', res, pollQuestion);
        this.changeDetectorRef.detectChanges();
        this.showOverlay();
      } catch (error) {
        console.error("Error updating poll:", error);
        alert("Failed to update poll. Please try again.");
      } finally {
        // re-enable the poll UI that we disabled earlier
        const finishedComponentId = (document.getElementById("pollComponentId") as HTMLInputElement)?.value ?? initialComponentId ?? '';
        if (finishedComponentId) {
          const container = document.getElementById(finishedComponentId);
          if (container) {
            container.querySelectorAll('input, button, label').forEach((el: Element) => {
              try {
                if (el instanceof HTMLInputElement || el instanceof HTMLButtonElement) {
                  (el as HTMLInputElement | HTMLButtonElement).disabled = false;
                } else if (el instanceof HTMLLabelElement) {
                  (el as HTMLElement).style.pointerEvents = '';
                } else {
                  (el as HTMLElement).style.pointerEvents = '';
                }
                (el as HTMLElement).classList.remove('poll-disabled-by-loading');
              } catch (e) { }
            });
          }
        }
        this.isPollLoading = false;
      }
    }, 100);
  }

  // Close the poll popup and replace the original poll in the DOM with a completed-render version
  closePollPopup() {
    try {
      const componentId = (document.getElementById("pollComponentId") as HTMLInputElement)?.value;
      if (componentId && this.pollResults) {
        const container = document.getElementById(componentId);
        if (container) {
          let pollHtml = `<div class="poll-container" data-component-id="${componentId}">` +
            `<div class="poll-question">${this.pollQuestion || ''}</div><div class="poll-options">`;

          const total = this.pollResults.totalVoters ?? 0;
          (this.pollResults.options || []).forEach((option: any, index: number) => {
            const voteCount = option.voteCount ?? 0;
            const percentage = total > 0 ? Math.round((voteCount / total) * 100) : 0;
            pollHtml += `
              <div class="poll-option">
                <div class="option-text">${this.escapeHtml(option.value ?? '')}</div>
                <div class="poll-result">
                  <div class="poll-bar" style="width: ${percentage}%"></div>
                  <span class="poll-stats">${voteCount} votes (${percentage}%)</span>
                </div>
              </div>`;
          });

          pollHtml += `</div><div class="poll-total">Total Votes: ${total}</div></div>`;
          container.innerHTML = pollHtml;
        }
      }
    } catch (err) {
      console.error('Error replacing poll in DOM', err);
    }

    // Close popup and cleanup
    this.pollChecked = false;
    this.pollResults = null;
    this.pollQuestion = '';
    this.closeOverlay();
  }

  // Render poll results inline inside the poll container (replaces interactive options)
  private renderPollResultsInDom(componentId: string, results: any, question: string) {
    try {
      if (!componentId || !results) return;
      const container = document.getElementById(componentId);
      if (!container) return;

      let pollHtml = `<div class="poll-container" data-component-id="${componentId}">` +
        `<div class="poll-question">${this.escapeHtml(question || '')}</div><div class="poll-options">`;

      const total = results.totalVoters ?? 0;
      (results.options || []).forEach((option: any, index: number) => {
        const voteCount = option.voteCount ?? 0;
        const percentage = total > 0 ? Math.round((voteCount / total) * 100) : 0;
        pollHtml += `
          <div class="poll-option">
            <div class="option-text">${this.escapeHtml(option.value ?? '')}</div>
            <div class="poll-result">
              <div class="poll-bar" style="width: ${percentage}%"></div>
              <span class="poll-stats">${voteCount} votes (${percentage}%)</span>
            </div>
          </div>`;
      });

      pollHtml += `</div><div class="poll-total">Total Votes: ${total}</div></div>`;
      container.innerHTML = pollHtml;
    } catch (err) {
      console.error('Error rendering poll results in DOM', err);
    }
  }

  // Shared poll HTML builder: accepts a structured poll object and returns HTML
  public buildPollHtmlFromPollObject(poll: any, componentId: string): string {
    if (!poll) return '';
    const question = this.escapeHtml(poll.question ?? '');
    const total = poll.totalVotes ?? poll.total ?? ((poll.options || []).reduce((s: number, o: any) => s + (o.voteCount ?? 0), 0));
    const userHasVoted = !!(poll.userHasVoted || (poll.userVotes && poll.userVotes.length > 0) || poll.hasVoted);

    let html = `<div class="poll-container" data-component-id="${componentId}"><div class="poll-question">${question}</div><div class="poll-options">`;

    (poll.options || []).forEach((opt: any, idx: number) => {
      const voteCount = opt.voteCount ?? opt.VoteCount ?? 0;
      const percentage = total > 0 ? Math.round((voteCount / total) * 100) : (opt.percentage ?? 0);
      const text = this.escapeHtml(opt.text ?? opt.value ?? opt.Value ?? '');

      if (userHasVoted) {
        html += `<div class="poll-option"><div class="poll-option-text">${text}</div><div class="poll-result"><div class="poll-bar" style="width: ${percentage}%"></div><span class="poll-stats">${voteCount} votes (${percentage}%)</span></div></div>`;
      } else {
        const esc = ('' + text).replace(/'/g, "");
        const inputId = `poll-option-${componentId}_${idx}`;
        html += `<div class="poll-option"><div class="poll-option-interactive"><input type="checkbox" value="${text}" id="${inputId}" name="${inputId}" onClick="document.getElementById('pollCheckId').value='${inputId}';document.getElementById('pollValue').value='${esc}';document.getElementById('pollQuestion').value='${this.htmlEncodeForInput(question)}';document.getElementById('pollComponentId').value='${componentId}';document.getElementById('pollCheckClickedButton').click()"><label for="${inputId}" onClick="document.getElementById('pollCheckId').value='${inputId}';document.getElementById('pollValue').value='${esc}';document.getElementById('pollQuestion').value='${this.htmlEncodeForInput(question)}';document.getElementById('pollComponentId').value='${componentId}';document.getElementById('pollCheckClickedButton').click()">${text}</label></div></div>`;
      }
    });

    html += `</div><div class="poll-total">Total Votes: ${total}</div></div>`;
    return html;
  }

  // Render a poll object into the DOM element with id == componentId.
  // options: { includeVoters?: boolean, includeDelete?: boolean, safeQuestion?: string }
  public renderPollIntoElement(componentId: string, poll: any, options?: any): void {
    try {
      if (!componentId || !poll) return;
      const container = document.getElementById(componentId);
      if (!container) return;

      const html = this.buildPollHtmlFromPollObject(poll, componentId);
      container.innerHTML = html;

      // Append voter list if requested
      if (options?.includeVoters && poll.userVotes && poll.userVotes.length) {
        let votersHtml = `<div class="poll-voters">Voted: `;
        const voters: string[] = [];
        for (const v of poll.userVotes) {
          try {
            const uname = v.username || v.Username || (v.user && v.user.username) || '';
            if (!uname) continue;
            const safeName = ('' + uname).replace(/'/g, "");
            voters.push(`<span class=\"userMentionSpan\" onClick=\"document.getElementById('userMentionInput').value='${safeName}';document.getElementById('userMentionButton').click()\">@${safeName}</span>`);
          } catch { continue; }
        }
        votersHtml += voters.join(' ') + `</div>`;
        container.insertAdjacentHTML('beforeend', votersHtml);
      }

      // Append delete control if requested
      if (options?.includeDelete) {
        const safeQuestion = options?.safeQuestion ?? '';
        container.insertAdjacentHTML('beforeend', `<div class="pollControls"><button onclick="document.getElementById('pollQuestion').value='${safeQuestion}';document.getElementById('pollComponentId').value='${componentId}';document.getElementById('pollDeleteButton').click();">Delete vote</button></div>`);
      }
    } catch (err) {
      console.error('Error in renderPollIntoElement', err);
    }
  }

  private escapeHtml(input: string): string {
    return input?.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')?.replace(/"/g, '&quot;') || '';
  }
  async handlePollDeleteClicked() {
    const componentId = (document.getElementById("pollComponentId") as HTMLInputElement).value;

    try {
      const res = await this.pollService.deleteVote(this.user?.id ?? 0, componentId);
      if (res) {
        this.showNotification(res);
      } else {
        this.showNotification("Error deleting vote.");
      }

      // Re-render the poll client-side to remove the user's vote without fetching updated data.
      // Strategy: find the poll container by componentId, extract the question and option texts
      // (strip any "(X votes, Y%)" suffixes), then rebuild the interactive poll HTML (checkboxes)
      // and decrement the displayed total votes by 1 if present.
      try {
        const container = document.getElementById(componentId);
        if (container) {
          const qEl = container.querySelector('.poll-question') as HTMLElement | null;
          const question = qEl ? (qEl.textContent ?? '').trim() : '';

          const optionEls = Array.from(container.querySelectorAll('.poll-option')) as HTMLElement[];
          const options: string[] = optionEls.map(optEl => {
            // Prefer label text if available
            const lbl = optEl.querySelector('label') as HTMLElement | null;
            let txt = lbl ? (lbl.textContent ?? '') : (optEl.textContent ?? '');
            // Remove common vote-summary suffix like " (123 votes, 45%)" or " (123 votes)"
            txt = txt.replace(/\s*\(\d+\s*votes?,\s*\d+%?\)/i, '').replace(/\s*\(\d+\s*votes?\)/i, '').trim();
            return txt;
          }).filter(t => t && t.length > 0);

          // Build interactive poll HTML similar to how polls are generated elsewhere
          let pollHtml = `<div class="poll-container" data-component-id="${componentId}">` +
            `<div class="poll-question">${this.escapeHtml(question)}</div><div class="poll-options">`;

          options.forEach((opt, idx) => {
            const pollId = `poll_${componentId}_${idx}`;
            const escOpt = ('' + opt).replace(/'/g, "");
            pollHtml += `\n  <div class="poll-option">\n    <div class=\"poll-option-interactive\">\n      <input type=\"checkbox\" value=\"${this.escapeHtml(opt)}\" id=\"poll-option-${pollId}\" name=\"poll-options-${pollId}\" onClick=\"document.getElementById('pollValue').value='${escOpt}';document.getElementById('pollCheckId').value='poll-option-${pollId}';document.getElementById('pollQuestion').value='${this.htmlEncodeForInput(question)}';document.getElementById('pollComponentId').value='${componentId}';document.getElementById('pollCheckClickedButton').click()\">\n      <label for=\"poll-option-${pollId}\" onClick=\"document.getElementById('pollValue').value='${escOpt}';document.getElementById('pollCheckId').value='poll-option-${pollId}';document.getElementById('pollQuestion').value='${this.htmlEncodeForInput(question)}';document.getElementById('pollComponentId').value='${componentId}';document.getElementById('pollCheckClickedButton').click()\">${this.escapeHtml(opt)}</label>\n    </div>\n  </div>`;
          });

          pollHtml += `</div>`;

          // Attempt to decrement the total votes display if present; hide it if total becomes 0
          const totalEl = container.querySelector('.poll-total') as HTMLElement | null;
          if (totalEl) {
            const m = (totalEl.textContent ?? '').match(/Total Votes:\s*(\d+)/i);
            let total = m ? parseInt(m[1]) : 0;
            total = Math.max(0, total - 1);
            if (total > 0) {
              pollHtml += `<div class="poll-total">Total Votes: ${total}</div>`;
            }
            // if total === 0, omit the poll-total element entirely to hide vote summaries
          }

          pollHtml += `</div>`;
          container.innerHTML = pollHtml;
        }
      } catch (domErr) {
        console.error('Error updating poll DOM after delete:', domErr);
      }
    } catch (error) {
      console.error("Error updating poll:", error);
      alert("Failed to update poll. Please try again.");
    }
  }

  async handleUserMention() {
    const username = (document.getElementById('userMentionInput') as HTMLInputElement).value.trim();
    this.selectedUsername = username;

    if (this.userIdCache.has(username)) {
      const cachedUserId = this.userIdCache.get(username);
      this.createComponent("User", {
        "userId": cachedUserId,
        "previousComponent": this.currentComponent,
        previousComponentParameters: this.currentComponentParameters
      });
      return;
    }

    try {
      const user = await this.userService.getUserByUsername(username);
      if (user) {
        // Store in cache
        this.userIdCache.set(username, user.id);

        this.createComponent("User", {
          "userId": user.id,
          "previousComponent": this.currentComponent,
          previousComponentParameters: this.currentComponentParameters
        });
      }
    } catch (error) {
      console.error('Error fetching user:', error);
      this.showNotification("User not found!");
    }
  }

  parseInteger(value: any): number {
    const parsedValue = parseInt(value, 10);
    return isNaN(parsedValue) ? 0 : parsedValue;
  }
  userTagUserLoaded(user?: User) {
    //console.log("User tag user loaded", user);
    this.popupUserTagUser = user;
    setTimeout(() => {
      this.userTagPopupMediaViewer?.reloadMedia(true);
    }, 50);
  }
  isUserOnline(lastSeen: string | Date | undefined): boolean {
    if (lastSeen === null || lastSeen === undefined) return false;

    // If we receive a Date object, compare directly
    if (lastSeen instanceof Date) {
      if (isNaN(lastSeen.getTime())) return false;
      const minutesAgo = (Date.now() - lastSeen.getTime()) / 60000;
      return minutesAgo < 10;
    }

    // At this point lastSeen is a string
    const ls = lastSeen as string;
    if (!ls) return false;

    // If an ISO timestamp (e.g. "2026-02-04T16:26:59"), parse as UTC and compare to now
    const isoLike = /^\d{4}-\d{2}-\d{2}T/.test(ls);
    if (isoLike) {
      // If the timestamp has no timezone (e.g. "2026-02-04T17:26:51"),
      // treat it as UTC by appending 'Z' so Date parses it as UTC.
      const hasTZ = /Z$|[+-]\d{2}:?\d{2}$/.test(ls);
      const parseStr = hasTZ ? ls : ls + 'Z';
      const d = new Date(parseStr);
      if (isNaN(d.getTime())) return false;
      const minutesAgo = (Date.now() - d.getTime()) / 60000;
      return minutesAgo < 10;
    }

    // Fallback: parse duration string like "2d 8h 51m" into minutes
    let days = 0, hours = 0, minutes = 0;
    const dayMatch = ls.match(/(\d+)d/);
    if (dayMatch) days = parseInt(dayMatch[1], 10) || 0;
    const hourMatch = ls.match(/(\d+)h/);
    if (hourMatch) hours = parseInt(hourMatch[1], 10) || 0;
    const minuteMatch = ls.match(/(\d+)m/);
    if (minuteMatch) minutes = parseInt(minuteMatch[1], 10) || 0;
    minutes = (days * 24 * 60) + (hours * 60) + minutes;
    return minutes < 10;
  }
  getMenuItemDescription(title: string): string {
    const found = this.navigationItemDescriptions?.find(item => item.title === title);
    return found?.content ?? 'No description available.';
  }

  decodeInlineLinks(text: string): string {
    if (!text) return text;
    const forbidden = new Set(['b', '/b', 'i', '/i', '*', '/*']);
    const linkRegex = /\[([^\]]+)\]\[([^\]]+)\]/g;
    return text.replace(linkRegex, (match, label, url) => {
      if (!url) return match;
      const key = (url + '').trim().toLowerCase();
      if (forbidden.has(key)) return match; // skip formatting tokens
      const safeUrl = this.ensureUrlHasProtocol(url);
      return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" onClick="document.getElementById('hiddenUrlToVisit').value='${safeUrl}';document.getElementById('hiddenUrlToVisitButton').click()">${label}</a>`;
    });
  }

  ensureUrlHasProtocol(url: string): string {
    if (!url) return url;
    if (/^https?:\/\//i.test(url)) return url;
    return 'https://' + url;
  }

  setYoutubeSearchResults(keyword: string, results: YoutubeVideo[]) {
    this.youtubeSearchKeyword = (keyword || '').trim();
    this.youtubeSearchResults = Array.isArray(results) ? results : [];
    this.resetYoutubeSearchClearTimer();
  }

  private resetYoutubeSearchClearTimer() {
    if (this.youtubeSearchClearTimer) {
      clearTimeout(this.youtubeSearchClearTimer);
    }
    this.youtubeSearchClearTimer =
      setTimeout(() => this.clearYoutubeSearchResults(), 5 * 60 * 1000);
  }

  clearYoutubeSearchResults() {
    this.youtubeSearchResults = [];
    this.youtubeSearchKeyword = '';
    if (this.youtubeSearchClearTimer) {
      clearTimeout(this.youtubeSearchClearTimer);
    }
    this.youtubeSearchClearTimer = undefined;
  }

  getYoutubeSearchResults(): YoutubeVideo[] {
    return this.youtubeSearchResults;
  }
  getYoutubeSearchKeyword(): string | undefined {
    return this.youtubeSearchKeyword != '' ? this.youtubeSearchKeyword : undefined;
  }
  get isLeftPanelIncluded(): boolean {
    return this.isDesktop
      && (this.navigationComponent?.navbarCollapsed ?? false)
      && !(this.excludedExtendedNavigationComponents.includes(this.currentComponent + 'Component')
        || this.excludedExtendedNavigationComponents.includes(this.currentComponent));
  }

  get isFlexPanel(): boolean {
    return this.isDesktop
      && (this.navigationComponent?.navbarCollapsed ?? false)
      && !(
        this.unflexedNavigationComponents.includes(this.currentComponent + 'Component')
        || this.unflexedNavigationComponents.includes(this.currentComponent)
      );
  }
  
  get isCenteredComponent(): boolean {
    return this.centeredComponents.includes(this.currentComponent + 'Component') 
      || this.centeredComponents.includes(this.currentComponent);
  }
 
  onLeftResizerDown(event: MouseEvent | TouchEvent) {
    event.preventDefault();
    const clientX = (event as TouchEvent).touches ? (event as TouchEvent).touches[0].clientX : (event as MouseEvent).clientX;
    this._isResizingLeftPanel = true;
    this._resizeStartX = clientX;
    this._resizeStartWidth = this.leftPanelWidth;
    window.addEventListener('mousemove', this._onLeftResizerMove);
    window.addEventListener('mouseup', this._onLeftResizerUp);
    window.addEventListener('touchmove', this._onLeftResizerMove, { passive: false });
    window.addEventListener('touchend', this._onLeftResizerUp);
  }

  private _onLeftResizerMove = (e: MouseEvent | TouchEvent) => {
    if (!this._isResizingLeftPanel) return;
    const clientX = (e as TouchEvent).touches ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
    const delta = clientX - this._resizeStartX;
    let newWidth = this._resizeStartWidth + delta;
    newWidth = Math.max(this.minLeftPanelWidth, Math.min(this.maxLeftPanelWidth, newWidth));
    this.leftPanelWidth = Math.round(newWidth);
    try { window.localStorage.setItem('leftPanelWidth', String(this.leftPanelWidth)); } catch { }
    this.changeDetectorRef.markForCheck();
  }

  private _onLeftResizerUp = (_: MouseEvent | TouchEvent) => {
    this._isResizingLeftPanel = false;
    window.removeEventListener('mousemove', this._onLeftResizerMove);
    window.removeEventListener('mouseup', this._onLeftResizerUp);
    window.removeEventListener('touchmove', this._onLeftResizerMove);
    window.removeEventListener('touchend', this._onLeftResizerUp);
  }
  notifyYoutubeSearchOpened() {
    if (this.youtubeSearchResults && this.youtubeSearchResults.length) {
      this.resetYoutubeSearchClearTimer();
    }
  }

  fullscreenYoutubePopup() {
    const youtubePopup = document.getElementById('youtubeIframe');
    if (youtubePopup) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        youtubePopup.requestFullscreen().catch(err => {
          console.error("Error attempting to enable full-screen mode:", err);
        });
      }
    } else {
      console.error("YouTube popup element not found.");
    }
  }
}