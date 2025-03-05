import { Component, OnDestroy } from '@angular/core';
import { AppComponent } from './app.component';
import { User } from '../services/datacontracts/user/user';
import { FileEntry } from '../services/datacontracts/file/file-entry';

@Component({
  selector: 'app-child-component',
  template: '',
})
export class ChildComponent {
  public unique_key?: number;
  public parentRef?: AppComponent;
  asc: [string, number][] = [];
  isLoading = false;
  debounceTimer: any;
  emojiMap: { [key: string]: string } = { ":blush:": "😊", ":smiley:": "😃", ":smile:": "😄", ":grin:": "😁", ":laughing:": "😆", ":sweat_smile:": "😅", ":joy:": "😂", ":rofl:": "🤣", ":relaxed:": "☺️", ":yum:": "😋", ":sunglasses:": "😎", ":heart_eyes:": "😍", ":kissing_heart:": "😘", ":kissing:": "😗", ":kissing_smiling_eyes:": "😙", ":kissing_closed_eyes:": "😚", ":stuck_out_tongue:": "😛", ":stuck_out_tongue_winking_eye:": "😜", ":stuck_out_tongue_closed_eyes:": "😝", ":money_mouth_face:": "🤑", ":hugging_face:": "🤗", ":nerd_face:": "🤓", ":thinking_face:": "🤔", ":zipper_mouth_face:": "🤐", ":raised_eyebrow:": "🤨", ":neutral_face:": "😐", ":expressionless:": "😑", ":no_mouth:": "😶", ":smirk:": "😏", ":unamused:": "😒", ":roll_eyes:": "🙄", ":grimacing:": "😬", ":lying_face:": "🤥", ":relieved:": "😌", ":pensive:": "😔", ":sleepy:": "😪", ":drooling_face:": "🤤", ":sleeping:": "😴", ":mask:": "😷", ":face_with_thermometer:": "🤒", ":face_with_head_bandage:": "🤕", ":nauseated_face:": "🤢", ":face_vomiting:": "🤮", ":sneezing_face:": "🤧", ":hot_face:": "🥵", ":cold_face:": "🥶", ":woozy_face:": "🥴", ":dizzy_face:": "😵", ":exploding_head:": "🤯", ":cowboy_hat_face:": "🤠", ":partying_face:": "🥳", ":disguised_face:": "🥸", ":smiling_face_with_tear:": "🥲", ":shushing_face:": "🤫", ":face_with_symbols_on_mouth:": "🤬", ":face_with_hand_over_mouth:": "🤭", ":face_with_monocle:": "🧐", ":star_struck:": "🤩", ":zany_face:": "🤪", ":face_with_raised_eyebrow:": "🤨", ":face_with_spiral_eyes:": "😵‍💫", ":face_with_peeking_eye:": "🫣", ":saluting_face:": "🫡", ":face_with_diagonal_mouth:": "🫤", ":dotted_line_face:": "🫥", ":face_with_open_eyes_and_hand_over_mouth:": "🫢", ":face_with_open_mouth:": "😮", ":face_with_rolling_eyes:": "🙄", ":face_with_steam_from_nose:": "😤", ":face_with_medical_mask:": "😷", ":face_with_crossed_out_eyes:": "😵‍💫", ":wave:": "👋", ":raised_hand:": "✋", ":raised_back_of_hand:": "🤚", ":hand_with_fingers_splayed:": "🖐️", ":vulcan_salute:": "🖖", ":ok_hand:": "👌", ":pinching_hand:": "🤏", ":victory_hand:": "✌️", ":crossed_fingers:": "🤞", ":love_you_gesture:": "🤟", ":sign_of_the_horns:": "🤘", ":call_me_hand:": "🤙", ":point_left:": "👈", ":point_right:": "👉", ":point_up:": "☝️", ":point_down:": "👇", ":middle_finger:": "🖕", ":thumbsup:": "👍", ":thumbsdown:": "👎", ":raised_fist:": "✊", ":fist:": "👊", ":fist_left:": "🤛", ":fist_right:": "🤜", ":clap:": "👏", ":open_hands:": "👐", ":palms_up_together:": "🤲", ":handshake:": "🤝", ":pray:": "🙏", ":writing_hand:": "✍️", ":nail_care:": "💅", ":selfie:": "🤳", ":muscle:": "💪", ":mechanical_arm:": "🦾", ":mechanical_leg:": "🦿", ":leg:": "🦵", ":foot:": "🦶", ":ear:": "👂", ":nose:": "👃", ":brain:": "🧠", ":tooth:": "🦷", ":bone:": "🦴", ":eyes:": "👀", ":eye:": "👁️", ":tongue:": "👅", ":lips:": "👄", ":baby:": "👶", ":child:": "🧒", ":boy:": "👦", ":girl:": "👧", ":adult:": "🧑", ":person:": "🧑", ":man:": "👨", ":woman:": "👩", ":older_adult:": "🧓", ":older_man:": "👴", ":older_woman:": "👵", ":blonde_person:": "👱", ":bearded_person:": "🧔", ":man_with_beard:": "🧔‍♂️", ":woman_with_beard:": "🧔‍♀️", ":red_haired_person:": "👨‍🦰", ":curly_haired_person:": "👨‍🦱", ":bald_person:": "👨‍🦲", ":white_haired_person:": "👨‍🦳", ":person_in_tuxedo:": "🤵", ":bride_with_veil:": "👰", ":pregnant_woman:": "🤰", ":breast_feeding:": "🤱", ":angel:": "👼", ":santa:": "🎅", ":mrs_claus:": "🤶", ":mage:": "🧙", ":fairy:": "🧚", ":vampire:": "🧛", ":merperson:": "🧜", ":elf:": "🧝", ":genie:": "🧞", ":zombie:": "🧟", ":person_frowning:": "🙍", ":person_pouting:": "🙎", ":person_gesturing_no:": "🙅", ":person_gesturing_ok:": "🙆", ":person_tipping_hand:": "💁", ":person_raising_hand:": "🙋", ":deaf_person:": "🧏", ":person_bowing:": "🙇", ":person_facepalming:": "🤦", ":person_shrugging:": "🤷", ":person_standing:": "🧍", ":person_kneeling:": "🧎", ":person_running:": "🏃", ":person_walking:": "🚶", ":person_lifting_weights:": "🏋️", ":person_cycling:": "🚴", ":person_swimming:": "🏊", ":person_playing_water_polo:": "🤽", ":person_playing_handball:": "🤾", ":person_juggling:": "🤹", ":person_in_lotus_position:": "🧘", ":person_in_steamy_room:": "🧖", ":person_climbing:": "🧗", ":person_in_motorized_wheelchair:": "🦽", ":person_in_manual_wheelchair:": "🦼", ":person_with_probing_cane:": "🦯", ":person_with_white_cane:": "🦯", ":person_with_crown:": "🫅", ":person_with_veil:": "👰", ":superhero:": "🦸", ":supervillain:": "🦹", ":ninja:": "🥷", ":construction_worker:": "👷", ":guard:": "💂", ":detective:": "🕵️", ":health_worker:": "🧑‍⚕️", ":farmer:": "🧑‍🌾", ":cook:": "🧑‍🍳", ":student:": "🧑‍🎓", ":singer:": "🧑‍🎤", ":artist:": "🧑‍🎨", ":teacher:": "🧑‍🏫", ":factory_worker:": "🧑‍🏭", ":technologist:": "🧑‍💻", ":office_worker:": "🧑‍💼", ":mechanic:": "🧑‍🔧", ":scientist:": "🧑‍🔬", ":astronaut:": "🧑‍🚀", ":firefighter:": "🧑‍🚒", ":pilot:": "🧑‍✈️", ":judge:": "🧑‍⚖️", ":person_with_heart:": "💑", ":couple_with_heart:": "💏", ":two_men_holding_hands:": "👬", ":two_women_holding_hands:": "👭", ":family:": "👪", ":people_hugging:": "🫂", ":footprints:": "👣", ":monkey_face:": "🐵", ":monkey:": "🐒", ":gorilla:": "🦍", ":orangutan:": "🦧", ":dog:": "🐶", ":cat:": "🐱", ":mouse:": "🐭", ":hamster:": "🐹", ":rabbit:": "🐰", ":fox:": "🦊", ":bear:": "🐻", ":panda:": "🐼", ":polar_bear:": "🐻‍❄️", ":koala:": "🐨", ":tiger:": "🐯", ":lion:": "🦁", ":cow:": "🐮", ":pig:": "🐷", ":frog:": "🐸", ":squid:": "🦑", ":octopus:": "🐙", ":shrimp:": "🦐", ":crab:": "🦀", ":lobster:": "🦞", ":blowfish:": "🐡", ":tropical_fish:": "🐠", ":fish:": "🐟", ":dolphin:": "🐬", ":whale:": "🐋", ":shark:": "🦈", ":crocodile:": "🐊", ":turtle:": "🐢", ":snake:": "🐍", ":dragon_face:": "🐲", ":dragon:": "🐉", ":sauropod:": "🦕", ":t-rex:": "🦖", ":whale2:": "🐋", ":seal:": "🦭", ":fly:": "🪰", ":worm:": "🪱", ":bug:": "🐛", ":ant:": "🐜", ":honeybee:": "🐝", ":beetle:": "🪲", ":ladybug:": "🐞", ":cricket:": "🦗", ":cockroach:": "🪳", ":spider:": "🕷️", ":scorpion:": "🦂", ":mosquito:": "🦟", ":microbe:": "🦠", ":bouquet:": "💐", ":cherry_blossom:": "🌸", ":white_flower:": "💮", ":rosette:": "🏵️", ":rose:": "🌹", ":wilted_flower:": "🥀", ":hibiscus:": "🌺", ":sunflower:": "🌻", ":blossom:": "🌼", ":tulip:": "🌷", ":seedling:": "🌱", ":potted_plant:": "🪴", ":evergreen_tree:": "🌲", ":deciduous_tree:": "🌳", ":palm_tree:": "🌴", ":cactus:": "🌵", ":ear_of_rice:": "🌾", ":herb:": "🌿", ":shamrock:": "☘️", ":four_leaf_clover:": "🍀", ":maple_leaf:": "🍁", ":fallen_leaf:": "🍂", ":leaves:": "🍃", ":mushroom:": "🍄", ":chestnut:": "🌰", ":coral:": "🪸", ":shell:": "🐚", ":rock:": "🪨", ":wood:": "🪵", ":feather:": "🪶", ":paw_prints:": "🐾", ":green_apple:": "🍏", ":red_apple:": "🍎", ":pear:": "🍐", ":tangerine:": "🍊", ":lemon:": "🍋", ":banana:": "🍌", ":watermelon:": "🍉", ":grapes:": "🍇", ":strawberry:": "🍓", ":melon:": "🍈", ":cherries:": "🍒", ":peach:": "🍑", ":mango:": "🥭", ":pineapple:": "🍍", ":coconut:": "🥥", ":kiwi_fruit:": "🥝", ":tomato:": "🍅", ":eggplant:": "🍆", ":avocado:": "🥑", ":broccoli:": "🥦", ":leafy_green:": "🥬", ":cucumber:": "🥒", ":hot_pepper:": "🌶️", ":corn:": "🌽", ":carrot:": "🥕", ":garlic:": "🧄", ":onion:": "🧅", ":potato:": "🥔", ":sweet_potato:": "🍠", ":croissant:": "🥐", ":baguette_bread:": "🥖", ":bread:": "🍞", ":pretzel:": "🥨", ":cheese:": "🧀", ":egg:": "🥚", ":cooking:": "🍳", ":pancakes:": "🥞", ":waffle:": "🧇", ":bacon:": "🥓", ":cut_of_meat:": "🥩", ":poultry_leg:": "🍗", ":meat_on_bone:": "🍖", ":hotdog:": "🌭", ":hamburger:": "🍔", ":fries:": "🍟", ":pizza:": "🍕", ":sandwich:": "🥪", ":taco:": "🌮", ":burrito:": "🌯", ":stuffed_flatbread:": "🥙", ":falafel:": "🧆", ":shallow_pan_of_food:": "🥘", ":stew:": "🍲", ":bowl_with_spoon:": "🥣", ":green_salad:": "🥗", ":popcorn:": "🍿", ":butter:": "🧈", ":salt:": "🧂", ":canned_food:": "🥫", ":bento:": "🍱", ":rice_cracker:": "🍘", ":rice_ball:": "🍙", ":rice:": "🍚", ":curry:": "🍛", ":ramen:": "🍜", ":spaghetti:": "🍝", ":oden:": "🍢", ":sushi:": "🍣", ":fried_shrimp:": "🍤", ":fish_cake:": "🍥", ":moon_cake:": "🥮", ":dango:": "🍡", ":dumpling:": "🥟", ":fortune_cookie:": "🥠", ":takeout_box:": "🥡", ":icecream:": "🍦", ":shaved_ice:": "🍧", ":ice_cream:": "🍨", ":doughnut:": "🍩", ":cookie:": "🍪", ":birthday:": "🎂", ":cake:": "🍰", ":cupcake:": "🧁", ":pie:": "🥧", ":chocolate_bar:": "🍫", ":candy:": "🍬", ":lollipop:": "🍭", ":custard:": "🍮", ":honey_pot:": "🍯", ":baby_bottle:": "🍼", ":glass_of_milk:": "🥛", ":coffee:": "☕", ":tea:": "🍵", ":sake:": "🍶", ":champagne:": "🍾", ":wine_glass:": "🍷", ":cocktail:": "🍸", ":tropical_drink:": "🍹", ":beer:": "🍺", ":beers:": "🍻", ":clinking_glasses:": "🥂", ":tumbler_glass:": "🥃", ":cup_with_straw:": "🥤", ":bubble_tea:": "🧋", ":beverage_box:": "🧃", ":mate:": "🧉", ":ice_cube:": "🧊", ":chopsticks:": "🥢", ":fork_and_knife_with_plate:": "🍽️", ":fork_and_knife:": "🍴", ":spoon:": "🥄", ":knife:": "🔪", ":amphora:": "🏺",  ":grinning:": "😀",  ":wink:": "😉", ":confused:": "😕", ":upside_down_face:": "🙃", ":disappointed:": "😞", ":frowning:": "🙁", ":persevere:": "😣", ":confounded:": "😖", ":fearful:": "😨", ":cold_sweat:": "😰", ":scream:": "😱", ":angry:": "😡", ":rage:": "😡", ":cry:": "😢", ":sob:": "😭", ":joy_cat:": "😹", ":smiling_imp:": "😈", ":imp:": "👿", ":alien:": "👽", ":robot_face:": "🤖", ":wink2:": "😉", ":yawning_face:": "🥱", ":ghost:": "👻", ":clown_face:": "🤡", ":wolf:": "🐺", ":bee:": "🐝", ":butterfly:": "🦋", ":snail:": "🐌", ":flamingo:": "🦩", ":parrot:": "🦜", ":eagle:": "🦅", ":penguin:": "🐧", ":chicken:": "🐔", ":duck:": "🦆", ":swan:": "🦢", ":owl:": "🦉", ":bat:": "🦇", ":camel:": "🐪", ":llama:": "🦙", ":zebra:": "🦓", ":horse:": "🐎", ":unicorn:": "🦄", ":giraffe:": "🦒", ":elephant:": "🐘", ":rhinoceros:": "🦏", ":hippopotamus:": "🐋", ":dog2:": "🐕‍🦺", ":cow2:": "🐂", ":apple:": "🍎", ":cherry:": "🍒", ":papaya:": "🍑", ":chili_pepper:": "🌶️", ":peanuts:": "🥜", ":cashew:": "🌰", ":zucchini:": "🥒", ":bell_pepper:": "🫑", ":pine_nut:": "🌰", ":pomegranate:": "🍎", ":fig:": "🍇", ":whiskey:": "🥃", ":milk_glass:": "🥛", ":hot_chocolate:": "🍫", ":smoothie:": "🍹", ":milkshake:": "🍦", ":car:": "🚗", ":bus:": "🚌", ":truck:": "🚚", ":airplane:": "✈️", ":helicopter:": "🚁", ":rocket:": "🚀", ":boat:": "🚤", ":ship:": "🚢", ":train:": "🚆", ":subway:": "🚇", ":tram:": "🚊", ":train2:": "🚋", ":bicycle:": "🚲", ":skateboard:": "🛹", ":roller_coaster:": "🎢", ":carriage:": "🚃", ":police_car:": "🚓", ":fire_engine:": "🚒", ":ambulance:": "🚑", ":taxi:": "🚖", ":minibus:": "🚐", ":rickshaw:": "🛺", ":trolleybus:": "🚎", ":scooter:": "🛴", ":sailing_ship:": "⛵", ":house:": "🏠", ":house_with_garden:": "🏡", ":school:": "🏫", ":office:": "🏢", ":hospital:": "🏥", ":bank:": "🏦", ":atm:": "🏧", ":church:": "⛪", ":mosque:": "🕌", ":synagogue:": "🕍", ":wedding:": "💒", ":department_store:": "🏬", ":shopping_cart:": "🛒", ":factory:": "🏭", ":museum:": "🏛️", ":art_gallery:": "🖼️", ":stadium:": "🏟️", ":stadium_with_pitch:": "⚽", ":tent:": "⛺", ":cityscape:": "🏙️", ":desert:": "🏜️", ":mountain:": "🏔️", ":volcano:": "🌋", ":sunny:": "☀️", ":cloud:": "☁️", ":rainbow:": "🌈", ":snowflake:": "❄️", ":snowman:": "⛄", ":zap:": "⚡", ":cyclone:": "🌀", ":fog:": "🌫️", ":earth_africa:": "🌍", ":earth_americas:": "🌎", ":earth_asia:": "🌏", ":mountain_snow:": "🏔️", ":sunrise:": "🌅", ":sunset:": "🌇", ":stars:": "🌟", ":milky_way:": "🌌", ":comet:": "☄️", ":moon:": "🌙", ":new_moon:": "🌑", ":waxing_crescent_moon:": "🌒", ":first_quarter_moon:": "🌓", ":waxing_gibbous_moon:": "🌔", ":us:": "🇺🇸", ":canada:": "🇨🇦", ":uk:": "🇬🇧", ":germany:": "🇩🇪", ":france:": "🇫🇷", ":spain:": "🇪🇸", ":italy:": "🇮🇹", ":australia:": "🇦🇺", ":mexico:": "🇲🇽", ":brazil:": "🇧🇷", ":india:": "🇮🇳", ":china:": "🇨🇳", ":japan:": "🇯🇵", ":south_korea:": "🇰🇷", ":south_africa:": "🇿🇦", ":argentina:": "🇦🇷", ":russia:": "🇷🇺", ":sweden:": "🇸🇪", ":norway:": "🇳🇴", ":denmark:": "🇩🇰", ":finland:": "🇫🇮", ":netherlands:": "🇳🇱", ":belgium:": "🇧🇪", ":guitar:": "🎸", ":piano:": "🎹", ":violin:": "🎻", ":drum:": "🥁", ":microphone:": "🎤", ":musical_note:": "🎵", ":headphones:": "🎧", ":trophy:": "🏆", ":medal:": "🏅", ":chess_pawn:": "♟️", ":checkered_flag:": "🏁", ":sports_medal:": "🥇", ":film_projector:": "📽️", ":movie_camera:": "🎥", ":clapper:": "🎬", ":ticket:": "🎫", ":camera:": "📷", ":flashlight:": "🔦", ":hourglass:": "⏳", ":game_die:": "🎲", ":domino:": "🁸", ":magnet:": "🧲", ":scissors:": "✂️", ":globe_with_meridians:": "🌐", ":electric_plug:": "🔌", ":light_bulb:": "💡", ":gear:": "⚙️", ":wrench:": "🔧", ":hammer:": "🔨", ":lock:": "🔒", ":key:": "🔑", }
  filteredEmojis: { [key: string]: string } = { ...this.emojiMap };

  remove_me(componentTitle: string) {
    this.isLoading = false;
    if (this.parentRef && this.unique_key) {
      this.parentRef.removeComponent(this.unique_key);
    } else {
      console.log("key not found: " + componentTitle);
    }
  }

  onMobile() {
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  }

  daysSinceDate(dateString?: Date, granularity?: 'year' | 'month' | 'day' | 'hour' | 'minute'): string {
    if (!dateString) return '';

    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    const now = new Date();

    // Calculate differences
    let years = now.getFullYear() - date.getFullYear();
    let months = now.getMonth() - date.getMonth();
    let days = now.getDate() - date.getDate();
    let hours = now.getHours() - date.getHours();
    let minutes = now.getMinutes() - date.getMinutes();
    let seconds = now.getSeconds() - date.getSeconds();

    // Adjust for negative values
    if (seconds < 0) {
      minutes--;
      seconds += 60;
    }
    if (minutes < 0) {
      hours--;
      minutes += 60;
    }
    if (hours < 0) {
      days--;
      hours += 24;
    }
    if (days < 0) {
      months--;
      const daysInLastMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
      days += daysInLastMonth;
    }
    if (months < 0) {
      years--;
      months += 12;
    }

    // Build the result string dynamically based on granularity
    const parts: string[] = [];

    if (years > 0) parts.push(`${years}y`);
    if (granularity === 'year') return parts.join(' ') || '0y';

    if (months > 0) parts.push(`${months}m`);
    if (granularity === 'month') return parts.join(' ') || '0m';

    if (days > 0) parts.push(`${days}d`);
    if (granularity === 'day') return parts.join(' ') || '0d';

    if (hours > 0) parts.push(`${hours}h`);
    if (granularity === 'hour') return parts.join(' ') || '0h';

    if (minutes > 0) parts.push(`${minutes}m`);
    if (granularity === 'minute') return parts.join(' ') || '0m';

    if (seconds > 0) parts.push(`${seconds}s`);

    return parts.join(' ');
  }


  debounce(func: Function, wait: number) {
    let isFirstCall = true;
    let timer: number | undefined;

    return (...args: any[]) => {
      if (isFirstCall) {
        func.apply(this, args);
        isFirstCall = false;
      }
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        func.apply(this, args);
      }, wait);
    };
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

  startLoading() {
    if (document && document.getElementById("loadingDiv")) {
      document.getElementById("loadingDiv")!.style.display = "block";
    }
    this.isLoading = true;
  }
  stopLoading() {
    if (document && document.getElementById("loadingDiv")) {
      document.getElementById("loadingDiv")!.style.display = "none";
    }
    this.isLoading = false;
  }
  viewProfile(user?: User) {
    if (user && user.id != 0) {
      this.parentRef?.closeOverlay();
      this.parentRef?.createComponent("User", { "userId": user.id });
    }
  }
  sortTable(columnIndex: number, tableId: string): void {
    const table = document.getElementById(tableId) as HTMLTableElement;
    if (!table) return;

    const rowsArray = Array.from(table.rows).slice(1); // Skip the header row
    const isAscending = this.asc.some(([tbl, col]) => tbl === tableId && col === columnIndex);

    // Regular expression to detect common date formats
    const dateRegex = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/;

    // Custom comparator for sorting
    const compare = (rowA: HTMLTableRowElement, rowB: HTMLTableRowElement) => {
      const cellA = rowA.cells[columnIndex].textContent?.trim() || '';
      const cellB = rowB.cells[columnIndex].textContent?.trim() || '';

      // Check if both values match the date pattern
      const isDateA = dateRegex.test(cellA);
      const isDateB = dateRegex.test(cellB);

      if (isDateA && isDateB) {
        const dateA = new Date(cellA).getTime();
        const dateB = new Date(cellB).getTime();
        return isAscending ? dateA - dateB : dateB - dateA;
      }

      // Check if both values are numbers
      const numA = parseFloat(cellA);
      const numB = parseFloat(cellB);
      const isNumA = !isNaN(numA) && cellA === numA.toString();
      const isNumB = !isNaN(numB) && cellB === numB.toString();

      if (isNumA && isNumB) {
        return isAscending ? numA - numB : numB - numA;
      }

      // Default to string comparison
      return isAscending ? cellA.localeCompare(cellB) : cellB.localeCompare(cellA);
    };

    // Sort rows in memory
    rowsArray.sort(compare);

    // Rebuild the table using a DocumentFragment
    const fragment = document.createDocumentFragment();
    rowsArray.forEach(row => fragment.appendChild(row));

    // Append sorted rows back to the table
    table.tBodies[0].appendChild(fragment);

    // Update sort direction tracking
    if (isAscending) {
      this.asc = this.asc.filter(([tbl, col]) => !(tbl === tableId && col === columnIndex));
    } else {
      this.asc.push([tableId, columnIndex]);
    }
  }


  isElementInViewport(el: HTMLElement): boolean {
    const rect = el.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  }

  searchForEmoji(event?: any): void {
    const searchTerm = event ? event.target.value.toLowerCase() : '';

    // If there's a search term, filter the emojiMap by key or value
    if (searchTerm) {
      this.filteredEmojis = Object.entries(this.emojiMap).reduce<{ [key: string]: string }>((result, [key, value]) => {
        if (key.toLowerCase().includes(searchTerm) || value.includes(searchTerm)) {
          result[key] = value;
        }
        return result;
      }, {});
    } else {
      // If there's no search term, show all emojis
      this.filteredEmojis = { ...this.emojiMap };
    }
  }


  log(text: any) {
    console.log(text);
  }
}
