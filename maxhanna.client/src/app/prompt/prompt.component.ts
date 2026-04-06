import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-prompt',
  templateUrl: './prompt.component.html',
  styleUrls: ['./prompt.component.css'],
  standalone: false,
})
export class PromptComponent {
  @Input() type: 'login' | 'messageOnly' = 'login';
  @Input() message: string = '';
  @Input() parentRef: any;
  @Input() visible: boolean = false;
  @Output() close = new EventEmitter<any>();
}
