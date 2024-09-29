import { Component, OnDestroy } from '@angular/core'; 
import { AppComponent } from './app.component';
import { User } from '../services/datacontracts/user/user';

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
   
  remove_me(componentTitle: string) { 
    this.isLoading = false;
    if (this.parentRef && this.unique_key) {
      this.parentRef.removeComponent(this.unique_key);
    } else {
      console.log("key not found: " + componentTitle);
    }
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
    const emojiMap: { [key: string]: string } =
    { ":)": "😊", ":(": "☹️", ";)": "😉", ":D": "😃", "XD": "😆", ":P": "😛", ":O": "😮", "B)": "😎", /*":/": "😕",*/ ":'(": "😢", "<3": "❤️", "</3": "💔", ":*": "😘", "O:)": "😇", "3:)": "😈", ":|": "😐", ":$": "😳", "8)": "😎", "^_^": "😊", "-_-": "😑", ">_<": "😣", ":'D": "😂", ":3": "😺", ":v": "✌️", ":S": "😖", ":b": "😛", ":x": "😶", ":X": "🤐", ":Z": "😴", "*_*": "😍", ":@": "😡", ":#": "🤬", ">:(": "😠", ":&": "🤢", ":T": "😋", "T_T": "😭", "Q_Q": "😭", ":1": "😆", "O_O": "😳", "*o*": "😍", "T-T": "😭", ";P": "😜", ":B": "😛", ":W": "😅", ":L": "😞", ":E": "😲", ":M": "🤔", ":C": "😏", ":I": "🤓", ":Q": "😮", ":F": "😇", ":G": "😵", ":H": "😱", ":J": "😜", ":K": "😞", ":Y": "😮", ":N": "😒", ":U": "😕", ":V": "😈", ":wave:": "👋", ":ok:": "👌", ":thumbsup:": "👍", ":thumbsdown:": "👎", ":clap:": "👏", ":star:": "⭐", ":star2:": "🌟", ":dizzy:": "💫", ":sparkles:": "✨", ":boom:": "💥", ":fire:": "🔥", ":droplet:": "💧", ":sweat_drops:": "💦", ":dash:": "💨", ":cloud:": "☁️", ":sunny:": "☀️", ":umbrella:": "☂️", ":snowflake:": "❄️", ":snowman:": "⛄", ":zap:": "⚡", ":cyclone:": "🌀", ":fog:": "🌫️", ":rainbow:": "🌈", ":heart:": "❤️", ":blue_heart:": "💙", ":green_heart:": "💚", ":yellow_heart:": "💛", ":purple_heart:": "💜", ":black_heart:": "🖤", ":white_heart:": "🤍", ":orange_heart:": "🧡", ":broken_heart:": "💔", ":heartbeat:": "💓", ":heartpulse:": "💗", ":two_hearts:": "💕", ":sparkling_heart:": "💖", ":cupid:": "💘", ":gift_heart:": "💝", ":revolving_hearts:": "💞", ":heart_decoration:": "💟", ":peace:": "☮️", ":cross:": "✝️", ":star_and_crescent:": "☪️", ":om:": "🕉️", ":wheel_of_dharma:": "☸️", ":yin_yang:": "☯️", ":orthodox_cross:": "☦️", ":star_of_david:": "✡️", ":six_pointed_star:": "🔯", ":menorah:": "🕎", ":infinity:": "♾️", ":wavy_dash:": "〰️", ":congratulations:": "㊗️", ":secret:": "㊙️", ":red_circle:": "🔴", ":orange_circle:": "🟠", ":yellow_circle:": "🟡", ":green_circle:": "🟢", ":blue_circle:": "🔵", ":purple_circle:": "🟣", ":brown_circle:": "🟤", ":black_circle:": "⚫", ":white_circle:": "⚪", ":red_square:": "🟥", ":orange_square:": "🟧", ":yellow_square:": "🟨", ":green_square:": "🟩", ":blue_square:": "🟦", ":purple_square:": "🟪", ":brown_square:": "🟫", ":black_large_square:": "⬛", ":white_large_square:": "⬜", ":black_medium_square:": "◼️", ": black_medium_small_square: ": "◾", ": white_medium_small_square: ": "◽", ": black_small_square: ": "▪️", ": white_small_square: ": "▫️", ": large_orange_diamond: ": "🔶", ": large_blue_diamond: ": "🔷", ": small_orange_diamond: ": "🔸", ": small_blue_diamond: ": "🔹", ": red_triangle_pointed_up: ": "🔺", ": red_triangle_pointed_down: ": "🔻", ": diamond_shape_with_a_dot_inside: ": "💠", ": radio_button: ": "🔘", ": white_square_button: ": "🔳", ": black_square_button: ": "🔲", ": checkered_flag: ": "🏁", ": triangular_flag_on_post: ": "🚩", ": crossed_flags: ": "🎌", ": black_flag: ": "🏴", ": white_flag: ": "🏳️", ": rainbow_flag: ": "🏳️‍🌈", ": pirate_flag: ": "🏴‍☠️" };

    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const escapedKeys = Object.keys(emojiMap).map(key => key.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'));
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
        return part.replace(emojiRegex, match => emojiMap[match]);
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
      this.parentRef?.createComponent("User", { "userId": user.id });
    }
  }
  sortTable(columnIndex: number, tableId: string): void {
    const table = document.getElementById(tableId) as HTMLTableElement;
    if (!table) return;

    const rowsArray = Array.from(table.rows).slice(1); // Skip the header row
    const isAscending = this.asc.some(([table, column]) => table === tableId && column === columnIndex);

    // Custom comparator for sorting
    const compare = (rowA: HTMLTableRowElement, rowB: HTMLTableRowElement) => {
      const cellA = rowA.cells[columnIndex].textContent?.trim().toLowerCase() || '';
      const cellB = rowB.cells[columnIndex].textContent?.trim().toLowerCase() || '';

      // Handle numeric sorting if needed
      const numA = parseFloat(cellA);
      const numB = parseFloat(cellB);

      if (!isNaN(numA) && !isNaN(numB)) {
        return isAscending ? numA - numB : numB - numA;
      }

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
      this.asc = this.asc.filter(([table, column]) => !(table === tableId && column === columnIndex));
    } else {
      this.asc.push([tableId, columnIndex]);
    }
  }
  async promiseWrapper(apromise: any) {
    try {
      this.startLoading();
      let response = await apromise;
      return response;
    } finally {
      this.stopLoading();
    }
  }
  log(text: any) {
    console.log(text);
  }
}
