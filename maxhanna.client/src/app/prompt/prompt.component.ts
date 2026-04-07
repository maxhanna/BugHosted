import { Component, EventEmitter, Input, Output } from '@angular/core';

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
  @Input() showSpecialAction: boolean = false;
  @Input() specialActionCallback: (() => void) | null = null;
  @Input() specialActionButtonLabel: string = 'Done';
  @Output() close = new EventEmitter<any>();
  @Output() userSelected = new EventEmitter<any>();
}
