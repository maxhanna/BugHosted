import { Component, EventEmitter, Input, Output } from '@angular/core';
import { User } from '../../services/datacontracts/user/user';

@Component({
  selector: 'app-prompt',
  templateUrl: './prompt.component.html',
  styleUrls: ['./prompt.component.css'],
  standalone: false,
})
export class PromptComponent {
  @Input() type: 'login' | 'messageOnly' | 'share' | 'textInput' = 'login';
  @Input() message: string = '';
  @Input() emoji: string = '';
  @Input() placeholder: string = 'Enter chat message';
  @Input() inputtedParentRef: any;
  @Input() visible: boolean = false;
  @Input() selectedShareUsers: User[] = [];
  @Input() showSpecialAction: boolean = false;
  @Input() specialActionCallback: (() => void) | null = null;
  @Input() specialActionButtonLabel: string = 'Done';
  @Output() close = new EventEmitter<any>();
  @Output() submit = new EventEmitter<string>();
  @Output() selectedUsersChange = new EventEmitter<User[]>(); 
  textValue: string = '';

  onUserSelected(user?: User): void {
    if (!user) {
      return;
    }
    this.selectedShareUsers.push(user); 
    // Do not close immediately; just update message 
    this.selectedUsersChange.emit(this.selectedShareUsers);
  }
}
