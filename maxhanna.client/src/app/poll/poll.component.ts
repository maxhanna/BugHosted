import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface PollData {
  pollId: string;
  question: string;
  options: string[];
  normalizedComponentId?: string;
}

@Component({
  selector: 'app-poll',
  templateUrl: './poll.component.html',
  styleUrls: ['./poll.component.css'],
  standalone: true,
  imports: [CommonModule]
})
export class PollComponent {
  @Input() pollData?: PollData;

  vote(option: string, index: number) {
    try {
      const qEl = (window.parent.document.getElementById('pollQuestion') as HTMLInputElement);
      const valEl = (window.parent.document.getElementById('pollValue') as HTMLInputElement);
      const compEl = (window.parent.document.getElementById('pollComponentId') as HTMLInputElement);
      const checkIdEl = (window.parent.document.getElementById('pollCheckId') as HTMLInputElement);
      const btn = (window.parent.document.getElementById('pollCheckClickedButton') as HTMLButtonElement);
      if (qEl) qEl.value = this.pollData?.question ?? '';
      if (valEl) valEl.value = option;
      if (compEl) compEl.value = this.pollData?.normalizedComponentId ?? '';
      if (checkIdEl) checkIdEl.value = `poll-option-${this.pollData?.pollId}-${index}`;
      if (btn) btn.click();
    } catch (e) {
      // ignore
    }
  }
}
