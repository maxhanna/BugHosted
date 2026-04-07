import { Component, EventEmitter, Input, Output } from '@angular/core';
import { User } from '../../services/datacontracts/user/user';

@Component({
  selector: 'app-prompt',
  templateUrl: './prompt.component.html',
  styleUrls: ['./prompt.component.css'],
  standalone: false,
})
export class PromptComponent {
  @Input() type: 'login' | 'messageOnly' | 'share' = 'login';
  @Input() message: string = '';
  @Input() emoji: string = '';
  @Input() inputtedParentRef: any;
  @Input() visible: boolean = false;
  @Input() selectedShareUsers: User[] = [];
  @Input() showSpecialAction: boolean = false;
  @Input() specialActionCallback: (() => void) | null = null;
  @Input() specialActionButtonLabel: string = 'Done';
  @Output() close = new EventEmitter<any>();
  @Output() selectedUsersChange = new EventEmitter<User[]>(); 

  onUserSelected(user?: User): void {
    if (!user) {
      return;
    }
    this.selectedShareUsers.push(user);
    // Build the selected users string
    const userNames = this.selectedShareUsers.map(u => u.username || 'user').join(', ');
    // Preserve the original message and append selected users
    let baseMessage = this.message;
    // Remove any previous 'Selected users:' suffix if present
    const suffixIndex = baseMessage.indexOf('Selected users:');
    if (suffixIndex !== -1) {
      baseMessage = baseMessage.substring(0, suffixIndex).trim();
    }
    this.message = `${baseMessage}  Selected users: [${userNames}]`;
    // Do not close immediately; just update message 
    this.selectedUsersChange.emit(this.selectedShareUsers);
  }
}
