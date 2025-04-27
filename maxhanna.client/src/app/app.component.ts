import { AfterViewInit, Component, ComponentRef, ElementRef, OnDestroy, OnInit, ViewChild, ViewContainerRef } from '@angular/core';
import { ActivatedRoute, NavigationEnd, NavigationStart, Router, RouterOutlet } from '@angular/router';
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
import { EmulationComponent } from './emulation/emulation.component';
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
  @ViewChild(NavigationComponent) navigationComponent!: NavigationComponent;
  @ViewChild(ModalComponent) modalComponent!: ModalComponent;
  notifications: string[] = [];
  showMainContent = true;
  isModalOpen = false;
  isModal = false;
  isModalCloseVisible = true;
  isShowingYoutubePopup = false;
  isShowingOverlay = false;
  pictureSrcs: { key: string, value: string, type: string, extension: string }[] = []; 
  isNavigationInitialized: boolean = false;
  debounceTimer: any;
  originalWeatherIcon = "☀️";
  child_unique_key: number = 0;
  emojiMap: { [key: string]: string } = { ":blush:": "😊", ":smiley:": "😃", ":)": "🙂", ":-)": "🙂", ":smile:": "😄", ":grin:": "😁", ":D": "😁", ":-D": "😁", ":laughing:": "😆", ":sweat_smile:": "😅", ":joy:": "😂", ":rofl:": "🤣", ":relaxed:": "☺️", ":yum:": "😋", ":sunglasses:": "😎", ":heart_eyes:": "😍", ":kissing_heart:": "😘", ":kissing:": "😗", ":kissing_smiling_eyes:": "😙", ":kissing_closed_eyes:": "😚", ":stuck_out_tongue:": "😛", ":stuck_out_tongue_winking_eye:": "😜", ":stuck_out_tongue_closed_eyes:": "😝", ":money_mouth_face:": "🤑", ":hugging_face:": "🤗", ":nerd_face:": "🤓", ":thinking_face:": "🤔", ":zipper_mouth_face:": "🤐", ":raised_eyebrow:": "🤨", ":neutral_face:": "😐", ":expressionless:": "😑", ":no_mouth:": "😶", ":smirk:": "😏", ":unamused:": "😒", ":roll_eyes:": "🙄", ":grimacing:": "😬", ":lying_face:": "🤥", ":relieved:": "😌", ":pensive:": "😔", ":sleepy:": "😪", ":drooling_face:": "🤤", ":sleeping:": "😴", ":mask:": "😷", ":face_with_thermometer:": "🤒", ":face_with_head_bandage:": "🤕", ":nauseated_face:": "🤢", ":face_vomiting:": "🤮", ":sneezing_face:": "🤧", ":hot_face:": "🥵", ":cold_face:": "🥶", ":woozy_face:": "🥴", ":dizzy_face:": "😵", ":exploding_head:": "🤯", ":cowboy_hat_face:": "🤠", ":partying_face:": "🥳", ":disguised_face:": "🥸", ":smiling_face_with_tear:": "🥲", ":shushing_face:": "🤫", ":face_with_symbols_on_mouth:": "🤬", ":face_with_hand_over_mouth:": "🤭", ":face_with_monocle:": "🧐", ":star_struck:": "🤩", ":zany_face:": "🤪", ":face_with_raised_eyebrow:": "🤨", ":face_with_spiral_eyes:": "😵‍💫", ":face_with_peeking_eye:": "🫣", ":saluting_face:": "🫡", ":face_with_diagonal_mouth:": "🫤", ":dotted_line_face:": "🫥", ":face_with_open_eyes_and_hand_over_mouth:": "🫢", ":face_with_open_mouth:": "😮", ":face_with_rolling_eyes:": "🙄", ":face_with_steam_from_nose:": "😤", ":face_with_medical_mask:": "😷", ":face_with_crossed_out_eyes:": "😵‍💫", ":wave:": "👋", ":raised_hand:": "✋", ":raised_back_of_hand:": "🤚", ":hand_with_fingers_splayed:": "🖐️", ":vulcan_salute:": "🖖", ":ok_hand:": "👌", ":pinching_hand:": "🤏", ":victory_hand:": "✌️", ":crossed_fingers:": "🤞", ":love_you_gesture:": "🤟", ":sign_of_the_horns:": "🤘", ":call_me_hand:": "🤙", ":point_left:": "👈", ":point_right:": "👉", ":point_up:": "☝️", ":point_down:": "👇", ":middle_finger:": "🖕", ":thumbsup:": "👍", ":thumbsdown:": "👎", ":raised_fist:": "✊", ":fist:": "👊", ":fist_left:": "🤛", ":fist_right:": "🤜", ":clap:": "👏", ":open_hands:": "👐", ":palms_up_together:": "🤲", ":handshake:": "🤝", ":pray:": "🙏", ":writing_hand:": "✍️", ":nail_care:": "💅", ":selfie:": "🤳", ":muscle:": "💪", ":mechanical_arm:": "🦾", ":mechanical_leg:": "🦿", ":leg:": "🦵", ":foot:": "🦶", ":ear:": "👂", ":nose:": "👃", ":brain:": "🧠", ":tooth:": "🦷", ":bone:": "🦴", ":eyes:": "👀", ":eye:": "👁️", ":tongue:": "👅", ":lips:": "👄", ":baby:": "👶", ":child:": "🧒", ":boy:": "👦", ":girl:": "👧", ":adult:": "🧑", ":person:": "🧑", ":man:": "👨", ":woman:": "👩", ":older_adult:": "🧓", ":older_man:": "👴", ":older_woman:": "👵", ":blonde_person:": "👱", ":bearded_person:": "🧔", ":man_with_beard:": "🧔‍♂️", ":woman_with_beard:": "🧔‍♀️", ":red_haired_person:": "👨‍🦰", ":curly_haired_person:": "👨‍🦱", ":bald_person:": "👨‍🦲", ":white_haired_person:": "👨‍🦳", ":person_in_tuxedo:": "🤵", ":bride_with_veil:": "👰", ":pregnant_woman:": "🤰", ":breast_feeding:": "🤱", ":angel:": "👼", ":santa:": "🎅", ":mrs_claus:": "🤶", ":mage:": "🧙", ":fairy:": "🧚", ":vampire:": "🧛", ":merperson:": "🧜", ":elf:": "🧝", ":genie:": "🧞", ":zombie:": "🧟", ":person_frowning:": "🙍", ":person_pouting:": "🙎", ":person_gesturing_no:": "🙅", ":person_gesturing_ok:": "🙆", ":person_tipping_hand:": "💁", ":person_raising_hand:": "🙋", ":deaf_person:": "🧏", ":person_bowing:": "🙇", ":person_facepalming:": "🤦", ":person_shrugging:": "🤷", ":person_standing:": "🧍", ":person_kneeling:": "🧎", ":person_running:": "🏃", ":person_walking:": "🚶", ":person_lifting_weights:": "🏋️", ":person_cycling:": "🚴", ":person_swimming:": "🏊", ":person_playing_water_polo:": "🤽", ":person_playing_handball:": "🤾", ":person_juggling:": "🤹", ":person_in_lotus_position:": "🧘", ":person_in_steamy_room:": "🧖", ":person_climbing:": "🧗", ":person_in_motorized_wheelchair:": "🦽", ":person_in_manual_wheelchair:": "🦼", ":person_with_probing_cane:": "🦯", ":person_with_white_cane:": "🦯", ":person_with_crown:": "🫅", ":person_with_veil:": "👰", ":superhero:": "🦸", ":supervillain:": "🦹", ":ninja:": "🥷", ":construction_worker:": "👷", ":guard:": "💂", ":detective:": "🕵️", ":health_worker:": "🧑‍⚕️", ":farmer:": "🧑‍🌾", ":cook:": "🧑‍🍳", ":student:": "🧑‍🎓", ":singer:": "🧑‍🎤", ":artist:": "🧑‍🎨", ":teacher:": "🧑‍🏫", ":factory_worker:": "🧑‍🏭", ":technologist:": "🧑‍💻", ":office_worker:": "🧑‍💼", ":mechanic:": "🧑‍🔧", ":scientist:": "🧑‍🔬", ":astronaut:": "🧑‍🚀", ":firefighter:": "🧑‍🚒", ":pilot:": "🧑‍✈️", ":judge:": "🧑‍⚖️", ":person_with_heart:": "💑", ":couple_with_heart:": "💏", ":two_men_holding_hands:": "👬", ":two_women_holding_hands:": "👭", ":family:": "👪", ":people_hugging:": "🫂", ":footprints:": "👣", ":monkey_face:": "🐵", ":monkey:": "🐒", ":gorilla:": "🦍", ":orangutan:": "🦧", ":dog:": "🐶", ":cat:": "🐱", ":mouse:": "🐭", ":hamster:": "🐹", ":rabbit:": "🐰", ":fox:": "🦊", ":bear:": "🐻", ":panda:": "🐼", ":polar_bear:": "🐻‍❄️", ":koala:": "🐨", ":tiger:": "🐯", ":lion:": "🦁", ":cow:": "🐮", ":pig:": "🐷", ":frog:": "🐸", ":squid:": "🦑", ":octopus:": "🐙", ":shrimp:": "🦐", ":crab:": "🦀", ":lobster:": "🦞", ":blowfish:": "🐡", ":tropical_fish:": "🐠", ":fish:": "🐟", ":dolphin:": "🐬", ":whale:": "🐋", ":shark:": "🦈", ":crocodile:": "🐊", ":turtle:": "🐢", ":snake:": "🐍", ":dragon_face:": "🐲", ":dragon:": "🐉", ":sauropod:": "🦕", ":t-rex:": "🦖", ":whale2:": "🐋", ":seal:": "🦭", ":fly:": "🪰", ":worm:": "🪱", ":bug:": "🐛", ":ant:": "🐜", ":honeybee:": "🐝", ":beetle:": "🪲", ":ladybug:": "🐞", ":cricket:": "🦗", ":cockroach:": "🪳", ":spider:": "🕷️", ":scorpion:": "🦂", ":mosquito:": "🦟", ":microbe:": "🦠", ":bouquet:": "💐", ":cherry_blossom:": "🌸", ":white_flower:": "💮", ":rosette:": "🏵️", ":rose:": "🌹", ":wilted_flower:": "🥀", ":hibiscus:": "🌺", ":sunflower:": "🌻", ":blossom:": "🌼", ":tulip:": "🌷", ":seedling:": "🌱", ":potted_plant:": "🪴", ":evergreen_tree:": "🌲", ":deciduous_tree:": "🌳", ":palm_tree:": "🌴", ":cactus:": "🌵", ":ear_of_rice:": "🌾", ":herb:": "🌿", ":shamrock:": "☘️", ":four_leaf_clover:": "🍀", ":maple_leaf:": "🍁", ":fallen_leaf:": "🍂", ":leaves:": "🍃", ":mushroom:": "🍄", ":chestnut:": "🌰", ":coral:": "🪸", ":shell:": "🐚", ":rock:": "🪨", ":wood:": "🪵", ":feather:": "🪶", ":paw_prints:": "🐾", ":green_apple:": "🍏", ":red_apple:": "🍎", ":pear:": "🍐", ":tangerine:": "🍊", ":lemon:": "🍋", ":banana:": "🍌", ":watermelon:": "🍉", ":grapes:": "🍇", ":strawberry:": "🍓", ":melon:": "🍈", ":cherries:": "🍒", ":peach:": "🍑", ":mango:": "🥭", ":pineapple:": "🍍", ":coconut:": "🥥", ":kiwi_fruit:": "🥝", ":tomato:": "🍅", ":eggplant:": "🍆", ":avocado:": "🥑", ":broccoli:": "🥦", ":leafy_green:": "🥬", ":cucumber:": "🥒", ":hot_pepper:": "🌶️", ":corn:": "🌽", ":carrot:": "🥕", ":garlic:": "🧄", ":onion:": "🧅", ":potato:": "🥔", ":sweet_potato:": "🍠", ":croissant:": "🥐", ":baguette_bread:": "🥖", ":bread:": "🍞", ":pretzel:": "🥨", ":cheese:": "🧀", ":egg:": "🥚", ":cooking:": "🍳", ":pancakes:": "🥞", ":waffle:": "🧇", ":bacon:": "🥓", ":cut_of_meat:": "🥩", ":poultry_leg:": "🍗", ":meat_on_bone:": "🍖", ":hotdog:": "🌭", ":hamburger:": "🍔", ":fries:": "🍟", ":pizza:": "🍕", ":sandwich:": "🥪", ":taco:": "🌮", ":burrito:": "🌯", ":stuffed_flatbread:": "🥙", ":falafel:": "🧆", ":shallow_pan_of_food:": "🥘", ":stew:": "🍲", ":bowl_with_spoon:": "🥣", ":green_salad:": "🥗", ":popcorn:": "🍿", ":butter:": "🧈", ":salt:": "🧂", ":canned_food:": "🥫", ":bento:": "🍱", ":rice_cracker:": "🍘", ":rice_ball:": "🍙", ":rice:": "🍚", ":curry:": "🍛", ":ramen:": "🍜", ":spaghetti:": "🍝", ":oden:": "🍢", ":sushi:": "🍣", ":fried_shrimp:": "🍤", ":fish_cake:": "🍥", ":moon_cake:": "🥮", ":dango:": "🍡", ":dumpling:": "🥟", ":fortune_cookie:": "🥠", ":takeout_box:": "🥡", ":icecream:": "🍦", ":shaved_ice:": "🍧", ":ice_cream:": "🍨", ":doughnut:": "🍩", ":cookie:": "🍪", ":birthday:": "🎂", ":cake:": "🍰", ":cupcake:": "🧁", ":pie:": "🥧", ":chocolate_bar:": "🍫", ":candy:": "🍬", ":lollipop:": "🍭", ":custard:": "🍮", ":honey_pot:": "🍯", ":baby_bottle:": "🍼", ":glass_of_milk:": "🥛", ":coffee:": "☕", ":tea:": "🍵", ":sake:": "🍶", ":champagne:": "🍾", ":wine_glass:": "🍷", ":cocktail:": "🍸", ":tropical_drink:": "🍹", ":beer:": "🍺", ":beers:": "🍻", ":clinking_glasses:": "🥂", ":tumbler_glass:": "🥃", ":cup_with_straw:": "🥤", ":bubble_tea:": "🧋", ":beverage_box:": "🧃", ":mate:": "🧉", ":ice_cube:": "🧊", ":chopsticks:": "🥢", ":fork_and_knife_with_plate:": "🍽️", ":fork_and_knife:": "🍴", ":spoon:": "🥄", ":knife:": "🔪", ":amphora:": "🏺", ":grinning:": "😀", ":wink:": "😉", ";)": "😉", ";-)": "😉", ":confused:": "😕", ":upside_down_face:": "🙃", ":disappointed:": "😞", ":frowning:": "🙁", ":persevere:": "😣", ":confounded:": "😖", ":fearful:": "😨", ":cold_sweat:": "😰", ":scream:": "😱", ":angry:": "😡", ":rage:": "😡", ":cry:": "😢", ":sob:": "😭", ":joy_cat:": "😹", ":smiling_imp:": "😈", ":imp:": "👿", ":alien:": "👽", ":robot_face:": "🤖", ":wink2:": "😉", ":yawning_face:": "🥱", ":ghost:": "👻", ":clown_face:": "🤡", ":wolf:": "🐺", ":bee:": "🐝", ":butterfly:": "🦋", ":snail:": "🐌", ":flamingo:": "🦩", ":parrot:": "🦜", ":eagle:": "🦅", ":penguin:": "🐧", ":chicken:": "🐔", ":duck:": "🦆", ":swan:": "🦢", ":owl:": "🦉", ":bat:": "🦇", ":camel:": "🐪", ":llama:": "🦙", ":zebra:": "🦓", ":horse:": "🐎", ":unicorn:": "🦄", ":giraffe:": "🦒", ":elephant:": "🐘", ":rhinoceros:": "🦏", ":hippopotamus:": "🐋", ":dog2:": "🐕‍🦺", ":cow2:": "🐂", ":apple:": "🍎", ":cherry:": "🍒", ":papaya:": "🍑", ":chili_pepper:": "🌶️", ":peanuts:": "🥜", ":cashew:": "🌰", ":zucchini:": "🥒", ":bell_pepper:": "🫑", ":pine_nut:": "🌰", ":pomegranate:": "🍎", ":fig:": "🍇", ":whiskey:": "🥃", ":milk_glass:": "🥛", ":hot_chocolate:": "🍫", ":smoothie:": "🍹", ":milkshake:": "🍦", ":car:": "🚗", ":bus:": "🚌", ":truck:": "🚚", ":airplane:": "✈️", ":helicopter:": "🚁", ":rocket:": "🚀", ":boat:": "🚤", ":ship:": "🚢", ":train:": "🚆", ":subway:": "🚇", ":tram:": "🚊", ":train2:": "🚋", ":bicycle:": "🚲", ":skateboard:": "🛹", ":roller_coaster:": "🎢", ":carriage:": "🚃", ":police_car:": "🚓", ":fire_engine:": "🚒", ":ambulance:": "🚑", ":taxi:": "🚖", ":minibus:": "🚐", ":rickshaw:": "🛺", ":trolleybus:": "🚎", ":scooter:": "🛴", ":sailing_ship:": "⛵", ":house:": "🏠", ":house_with_garden:": "🏡", ":school:": "🏫", ":office:": "🏢", ":hospital:": "🏥", ":bank:": "🏦", ":atm:": "🏧", ":church:": "⛪", ":mosque:": "🕌", ":synagogue:": "🕍", ":wedding:": "💒", ":department_store:": "🏬", ":shopping_cart:": "🛒", ":factory:": "🏭", ":museum:": "🏛️", ":art_gallery:": "🖼️", ":stadium:": "🏟️", ":stadium_with_pitch:": "⚽", ":tent:": "⛺", ":cityscape:": "🏙️", ":desert:": "🏜️", ":mountain:": "🏔️", ":volcano:": "🌋", ":sunny:": "☀️", ":cloud:": "☁️", ":rainbow:": "🌈", ":snowflake:": "❄️", ":snowman:": "⛄", ":zap:": "⚡", ":cyclone:": "🌀", ":fog:": "🌫️", ":earth_africa:": "🌍", ":earth_americas:": "🌎", ":earth_asia:": "🌏", ":mountain_snow:": "🏔️", ":sunrise:": "🌅", ":sunset:": "🌇", ":stars:": "🌟", ":milky_way:": "🌌", ":comet:": "☄️", ":moon:": "🌙", ":new_moon:": "🌑", ":waxing_crescent_moon:": "🌒", ":first_quarter_moon:": "🌓", ":waxing_gibbous_moon:": "🌔", ":us:": "🇺🇸", ":canada:": "🇨🇦", ":uk:": "🇬🇧", ":germany:": "🇩🇪", ":france:": "🇫🇷", ":spain:": "🇪🇸", ":italy:": "🇮🇹", ":australia:": "🇦🇺", ":mexico:": "🇲🇽", ":brazil:": "🇧🇷", ":india:": "🇮🇳", ":china:": "🇨🇳", ":japan:": "🇯🇵", ":south_korea:": "🇰🇷", ":south_africa:": "🇿🇦", ":argentina:": "🇦🇷", ":russia:": "🇷🇺", ":sweden:": "🇸🇪", ":norway:": "🇳🇴", ":denmark:": "🇩🇰", ":finland:": "🇫🇮", ":netherlands:": "🇳🇱", ":belgium:": "🇧🇪", ":guitar:": "🎸", ":piano:": "🎹", ":violin:": "🎻", ":drum:": "🥁", ":microphone:": "🎤", ":musical_note:": "🎵", ":headphones:": "🎧", ":trophy:": "🏆", ":medal:": "🏅", ":chess_pawn:": "♟️", ":checkered_flag:": "🏁", ":sports_medal:": "🥇", ":film_projector:": "📽️", ":movie_camera:": "🎥", ":clapper:": "🎬", ":ticket:": "🎫", ":camera:": "📷", ":flashlight:": "🔦", ":hourglass:": "⏳", ":game_die:": "🎲", ":domino:": "🁸", ":magnet:": "🧲", ":scissors:": "✂️", ":globe_with_meridians:": "🌐", ":electric_plug:": "🔌", ":light_bulb:": "💡", ":gear:": "⚙️", ":wrench:": "🔧", ":hammer:": "🔨", ":lock:": "🔒", ":key:": "🔑", }
  componentsReferences = Array<ComponentRef<any>>();
  navigationItems: MenuItem[] = [ 
    { ownership: 0, icon: "🌍", title: "Social", content: undefined },
    { ownership: 0, icon: "🤣", title: "Meme", content: undefined },
    { ownership: 0, icon: "🎖️", title: "Bug-Wars", content: undefined },
    { ownership: 0, icon: "🤖", title: "Meta-Bots", content: undefined },
    { ownership: 0, icon: "🗨️", title: "Chat", content: undefined },
    { ownership: 0, icon: "🎮", title: "Emulation", content: undefined },
    { ownership: 0, icon: "⚔️", title: "Array", content: undefined },
    { ownership: 0, icon: "🧠", title: "Wordler", content: undefined },
    { ownership: 0, icon: "📁", title: "Files", content: undefined },
    { ownership: 0, icon: "📅", title: "Calendar", content: undefined },
    { ownership: 0, icon: "☀️", title: "Weather", content: '' },
    { ownership: 0, icon: "✔️", title: "Todo", content: undefined },
    { ownership: 0, icon: "🎼", title: "Music", content: undefined },
    { ownership: 0, icon: "🗒️", title: "Notepad", content: undefined },
    { ownership: 0, icon: "📇", title: "Contacts", content: undefined }, 
    { ownership: 0, icon: "📰", title: "News", content: undefined }, 
    { ownership: 0, icon: "₿", title: "Crypto-Hub", content: undefined },
    { ownership: 0, icon: "🔍", title: "Favourites", content: undefined },
    { ownership: 0, icon: "💯", title: "Top100", content: undefined },
    { ownership: 0, icon: "🎨", title: "Theme", content: undefined }, 
    { ownership: 0, icon: "🧐", title: "HostAi", content: undefined }, 
    { ownership: 0, icon: "🕸️", title: "Crawler", content: undefined },
    { ownership: 0, icon: "🔔", title: "Notifications", content: undefined },
    { ownership: 0, icon: "👤", title: "User", content: undefined },
    { ownership: 0, icon: "➕", title: "UpdateUserSettings", content: undefined },
  ];
  location?: { ip:string, city: string, country: string } = undefined;
  sessionToken?: string = undefined;

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
    "Emulation": EmulationComponent,
    "Array": ArrayComponent,
    "Bug-Wars": NexusComponent,
    "Meta-Bots": MetaComponent,
    "Wordler": WordlerComponent,
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
    "Notifications": NotificationsComponent,
    "UpdateUserSettings": UpdateUserSettingsComponent
  };
  userSelectedNavigationItems: Array<MenuItem> = [];
  constructor(private router: Router,
    private route: ActivatedRoute,
    private userService: UserService,
    private crawlerService: CrawlerService,
    private favouriteService: FavouriteService,
    private fileService: FileService,
    private meta: Meta,
    private title: Title, 
    private sanitizer: DomSanitizer) { }

  ngOnInit() {  
    if (this.getCookie("user")) {
      this.user = JSON.parse(this.getCookie("user")); 
    } 
    this.updateHeight();
    this.getSelectedMenuItems()
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/firebase-messaging-sw.js')
        .then((registration) => {
          console.log('Service Worker registered:', registration);
        })
        .catch((error) => {
          console.error('Service Worker registration failed:', error);
        });
    }
  }
  ngAfterViewInit() {
    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) { 
        if (this.router.url.includes('Memes')) {
          this.checkAndClearRouterOutlet();
          const memeId = this.router.url.toLowerCase().split('memes/')[1]?.split('?')[0];
          this.createComponent("Meme", { "memeId": memeId });
        }
        if (this.router.url.includes('Social')) {
          this.checkAndClearRouterOutlet();
          const storyId = this.router.url.toLowerCase().split('social/')[1]?.split('?')[0];
          this.createComponent("Social", { "storyId": storyId });
        }
        if (this.router.url.includes('User')) {
          console.log("router has user");
          this.checkAndClearRouterOutlet();
          const userId = this.router.url.toLowerCase().split('user/')[1]?.split('?')[0];
          const storyId = this.router.url.toLowerCase().split('user/')[1]?.split('/')[1];
          this.createComponent("User", { "userId": userId, storyId: storyId });
        }
        if (this.router.url.includes('File')) {
          this.checkAndClearRouterOutlet();
          const fileId = this.router.url.toLowerCase().split('file/')[1]?.split('?')[0];
          this.createComponent("Files", { "fileId": fileId });
        }
        if (this.router.url.includes('Media')) {
          this.checkAndClearRouterOutlet();
          const fileId = this.router.url.toLowerCase().split('media/')[1]?.split('?')[0];
          this.createComponent("MediaViewer", { "fileId": fileId, "isLoadedFromURL": true });
        }
        if (this.router.url.includes('Crawler')) {
          this.checkAndClearRouterOutlet();
          const url = this.router.url.toLowerCase().split('crawler/')[1]?.split('?')[0];
          if (url) {
            this.createComponent("Crawler", { "url": url });
          } else {
            this.createComponent("Crawler");
          }
        }
        if (this.router.url.includes('Array')) {
          this.checkAndClearRouterOutlet();
          this.createComponent('Array');
        }
        if (this.router.url.includes('War')) {
          this.checkAndClearRouterOutlet();
          this.createComponent('Bug-Wars');
        }
        if (this.router.url.includes('Meta')) {
          this.checkAndClearRouterOutlet();
          this.createComponent('Meta-Bots');
        }
        if (this.router.url.includes('Wordler')) {
          this.checkAndClearRouterOutlet();
          this.createComponent('Wordler');
        }
        if (this.router.url.includes('Crypto') || this.router.url.includes('Cryptocurrency') || this.router.url.includes('Defi')) {
          this.checkAndClearRouterOutlet();
          this.createComponent('Crypto-Hub');
        }
        if (this.router.url.includes('Host') || this.router.url.includes('HostAi') || this.router.url.includes('Ai')) {
          this.checkAndClearRouterOutlet();
          this.createComponent('HostAi');
        }
      }
    }); 
  } 
  async getSelectedMenuItems() {
    if (!this.user) {
      this.userSelectedNavigationItems = [ 
        { ownership: 0, icon: "🌍", title: "Social", content: undefined },
        { ownership: 0, icon: "🤣", title: "Meme", content: undefined },
        { ownership: 0, icon: "🗨️", title: "Chat", content: undefined },
        { ownership: 0, icon: "🧠", title: "Wordler", content: undefined },
        { ownership: 0, icon: "🎮", title: "Emulation", content: undefined },
        { ownership: 0, icon: "📁", title: "Files", content: undefined },
        { ownership: 0, icon: "₿", title: "Crypto-Hub", content: undefined },
        { ownership: 0, icon: "🔍", title: "Favourites", content: undefined },
        { ownership: 0, icon: "🕸️", title: "Crawler", content: undefined },
        { ownership: 0, icon: "🧐", title: "HostAi", content: undefined }, 
        { ownership: 0, icon: "👤", title: "User", content: undefined },
      ];
    } else {
      this.userSelectedNavigationItems = await this.userService.getUserMenu(this.user.id);
    }
    this.isNavigationInitialized = true;
  }
  checkAndClearRouterOutlet() {
    if (this.outlet) {
      //console.log("Router outlet is activated, navigating to root to clear it.");
      this.router.navigate(['/']);
      this.router.dispose();
    }
  }
  createComponent(componentType: string, inputs?: { [key: string]: any; }) {
    console.log("in create component : " + componentType);
    this.navigationComponent.minimizeNav();
    this.closeOverlay();
    this.replacePageTitleAndDescription(componentType, componentType);

    if (!componentType || componentType.trim() === "") {
      this.navigationComponent.maximizeNav();
      this.showNotification("Invalid component type received. Returned to menu.");
      return;
    }

    const componentClass = this.componentMap[componentType];
    if (!componentClass) { 
      this.navigationComponent.maximizeNav();
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
    this.componentsReferences.push(childComponentRef);
    return childComponentRef;
  }
  removeComponent(key: number) {
    if (!this.VCR || this.VCR.length < 1) return;
    this.replacePageTitleAndDescription("Bug Hosted", "Bug Hosted"); 
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
    this.navigationComponent.maximizeNav();
  }

  removeAllComponents() {
    if (!this.VCR || this.VCR.length < 1) return;

    this.componentsReferences.forEach(componentRef => {
      componentRef.destroy();
    });

    this.VCR.clear();
    this.componentsReferences = [];
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
    let d: Date = new Date();
    d.setTime(d.getTime() + expireDays * 24 * 60 * 60 * 1000);
    let expires: string = `expires=${d.toUTCString()}`;
    let cpath: string = path ? `; path=${path}` : '';
    document.cookie = `${name}=${value}; ${expires}${cpath}`;
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
  async getSessionToken() : Promise<string> {
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

  clearAllNotifications() {
    this.navigationComponent.clearNotifications();
    this.navigationComponent.ngOnInit();
  }
  async getNotifications() {
    this.navigationComponent.clearNotifications();
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => { 
      await this.navigationComponent.getNotifications(); 
    }, 500); 
  }
  openModal() {
    this.isModalOpen = true;
  }

  closeModal() {
    this.isModalOpen = false;
  }
  setModalBody(msg: any) { 
    if (!this.isModalOpen) {
      this.isModalOpen = true;
    }
    setTimeout(() => {
      this.modalComponent.setModalBody(msg);
    }, 100);
  } 
  updateHeight() { 
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
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
  closeOverlay() {
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

    this.isShowingOverlay = false;
    this.restoreBodyOverflow();
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
  getTextForDOM(text?: string, component_id?: number) {
    if (!text) return "";

    const youtubeRegex = /(https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)([\w-]{11})|youtu\.be\/([\w-]{11}))(?:\S+)?)/g;

    // Step 1: Temporarily replace YouTube links with placeholders
    text = text.replace(youtubeRegex, (match, url, videoId, shortVideoId) => {
      const id = videoId || shortVideoId;
      return `__YOUTUBE__${id}__YOUTUBE__`;
    });

    // Step 2: Convert regular URLs into clickable links
    text = text.replace(/(<a[^>]*>.*?<\/a>)|(https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+)/gi, (match, existingLink, url) => {
      if (existingLink) return existingLink;
      return `<a onClick="document.getElementById('hiddenUrlToVisit').value='${url}';document.getElementById('hiddenUrlToVisitButton').click()" class=cursorPointer>${url}</a>`;
    }).replace(/\n/g, '<br>');

    // Step 3: Replace YouTube placeholders with clickable links
    text = text.replace(/__YOUTUBE__([\w-]{11})__YOUTUBE__/g, (match, videoId) => {
      return `<a onClick="document.getElementById('youtubeVideoIdInput').value='${videoId}';document.getElementById('youtubeVideoButton').click()" class="cursorPointer youtube-link">https://www.youtube.com/watch?v=${videoId}</a>`;
    });

    // Step 4: Convert quotes and style the quote text
    const processQuotes = (inputText: string): string => {
      let processedText = inputText;

      // Use a regular expression to find all quotes
      while (/\[Quoting \{(.+?)\|(\d+)\|([\d-T:.]+)\}: (.*?)\](?!\])/gs.test(processedText)) {
        processedText = processedText.replace(/\[Quoting \{(.+?)\|(\d+)\|([\d-T:.]+)\}: (.*?)\](?!\])/gs, (match, username, userId, timestamp, quotedMessage) => {
          const formattedTimestamp = this.convertUtcToLocalTime(timestamp);

          // Define the maximum truncation length (we reserve space for the breadcrumb)
          const maxLength = 200;
          const truncatedMessage = quotedMessage.length > maxLength && !quotedMessage.includes("____QUOTE_START____") && !quotedMessage.includes("____QUOTE_END____") ? quotedMessage.slice(0, maxLength) + "..." : quotedMessage;

          const escapedQuotedMessage = encodeURIComponent(truncatedMessage); // Now encoding truncated message

          // Insert the breadcrumb character to mark the end of each quote
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

    // Step 5: Convert Bold, Bullet-point, and Italics
    text = text
      .replace(/\[b\](.*?)\[\/b\]/gi, "<b>$1</b>") // Bold
      .replace(/\[\*\](.*?)\[\/\*\]/gi, "<br>&bull; $1") // Bullet-point
      .replace(/\[i\](.*?)\[\/i\]/gi, "<i>$1</i>"); // Italics
    text = this.replaceEmojisInMessage(text);

    // Step 6: Replace ||component:<component-name>|| with a clickable span
    text = text.replace(/\|\|component:([\w-]+)\|\|/g, (match, componentName) => {
      return `<span onClick="document.getElementById('componentCreateName').value='${componentName}';document.getElementById('componentCreateClickButton').click()" class="linkedComponent">${componentName}${this.getIconByTitle(componentName)}</span>`;
    });
      
    return this.sanitizer.bypassSecurityTrustHtml(text);
  }
  getIconByTitle(title: string): string | undefined {
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
      console.log("No message or timestamp found for quote.");
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
          && (element.classList.contains('messageContainer') || element.classList.contains('commentContent'))
        )
        || elementTimestamp === timestamp) {
        if (elementTimestamp === timestamp) console.log("found by timestamp")
        else if (elementText.toLowerCase().includes(message.toLowerCase())) { console.log("found by message", element); } 
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
  playYoutubeVideo() {
    this.showOverlay();
    this.isShowingYoutubePopup = true;

    const videoId = (document.getElementById('youtubeVideoIdInput') as HTMLInputElement).value;
    setTimeout(() => {
      let target = document.getElementById(`youtubeIframe`) as HTMLIFrameElement;
      if (!target || !videoId) return; 
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
  createComponentButtonClicked() {
    console.log("Here");
    const title = (document.getElementById("componentCreateName") as HTMLInputElement).value;
    if (title) { this.createComponent(title); } 
  }
  visitExternalLinkButtonClicked() {
    const url = (document.getElementById("hiddenUrlToVisit") as HTMLInputElement).value;
    (document.getElementById("hiddenUrlToVisit") as HTMLInputElement).value = "";
    this.visitExternalLink(url);
  }
  visitExternalLink(url?: string) {
    if (!url) return;
    this.indexLink(url);
    window.open(url, '_blank');
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


  async updateLastSeen(user?: User) {
    const tmpUser = user ?? this.user;

    if (tmpUser?.id) {
      this.userService.updateLastSeen(tmpUser.id);
      tmpUser.lastSeen = new Date();
    }
  }
  async isServerUp() {
    try {
      const usersCount = await this.userService.getUserCount();
      if (!usersCount || parseInt(usersCount) == 0) {
        return false;
      } else return true;
    } catch {
      return false;
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
}
