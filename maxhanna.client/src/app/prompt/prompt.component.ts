import { Component, EventEmitter, Input, Output, ViewChild, ElementRef } from '@angular/core';
import { User } from '../../services/datacontracts/user/user';

@Component({
  selector: 'app-prompt',
  templateUrl: './prompt.component.html',
  styleUrls: ['./prompt.component.css'],
  standalone: false,
  host: {
    '[style.font-family]': 'fontFamily'
  }
})
export class PromptComponent {
  @Input() type: 'login' | 'messageOnly' | 'share' | 'textInput' | 'color' | 'face' | 'confirm' = 'login';
  /**  
       For 'messageOnly' type, this is the message to display.
       For 'textInput' type, this is the label above the text input.
       For multi-line messages, delimit with: '\n'. 
  */
  @Input() message: string = '';
  @Input() icon: string = '';
  @Input() placeholder: string = 'Enter chat message';
  @Input() inputtedParentRef: any;
  @Input() visible: boolean = false;
  @Input() selectedShareUsers: User[] = [];
  @Input() showSpecialAction: boolean = false;
  @Input() specialActionCallback: (() => void) | null = null;
  @Input() specialActionButtonLabel: string = 'Done';
  @Input() fontFamily: string = '';
  @Output() close = new EventEmitter<any>();
  @Output() submit = new EventEmitter<string>();
  @Output() selectedUsersChange = new EventEmitter<User[]>(); 
  textValue: string = '';
  faceOptions = ['default', 'smile', 'wink', 'sad', 'angry', 'cool', 'surprised', 'sick', 'tongue', 'monocle', 'glasses', 'bandana', 'robot', 'alien', 'cat', 'dog', 'skull', 'pirate', 'moustache', 'hero', 'villain', 'bunny', 'ghost', 'zombie', 'vampire', 'ninja', 'dragon', 'demon', 'angel', 'spark', 'love', 'confuse', 'meh', 'shy', 'winkTongue', 'coolSunglasses', 'cyber', 'clown', 'mask', 'samurai', 'wizard', 'pirateEye', 'vampireTeeth', 'werewolf', 'alien2', 'robot2', 'creeper', 'slime', 'ghost2', 'pumpkin', 'snowman', 'heartEyes', 'crying', 'sleeping', 'dizzy', 'rich', 'brain', 'alien3', 'fire', 'flower', 'leaf', 'star'];

  @ViewChild('textInput') textInput?: ElementRef<HTMLInputElement>;

  // Called by hosts to focus the text input when the prompt becomes visible
  focusInput(): void {
    setTimeout(() => {
      try { this.textInput?.nativeElement.focus(); } catch (e) {}
    }, 0);
  }

  submitAndClose(): void {
    this.submit.emit(this.textValue);
    this.close.emit();
    this.textValue = '';
  }

  get finalMessageLines(): string[] {
    return this.message.split('\n');
  }

  onUserSelected(user?: User): void {
    if (!user) {
      return;
    }
    this.selectedShareUsers.push(user); 
    // Do not close immediately; just update message 
    this.selectedUsersChange.emit(this.selectedShareUsers);
  }

  enterTextInput(event: any): void {
    event.preventDefault(); 
    event.stopPropagation(); 
    this.submitAndClose();
  }
}
