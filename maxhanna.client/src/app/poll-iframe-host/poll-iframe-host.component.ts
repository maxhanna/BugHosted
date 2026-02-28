import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PollData, PollComponent } from '../poll/poll.component';

@Component({
  selector: 'app-poll-iframe-host',
  template: `<app-poll [pollData]="pollData"></app-poll>`,
  standalone: true,
  imports: [PollComponent]
})
export class PollIframeHostComponent implements OnInit {
  pollData?: PollData;
  constructor(private route: ActivatedRoute) { }

  ngOnInit(): void {
    const payload = this.route.snapshot.queryParamMap.get('payload');
    if (!payload) return;
    try {
      const json = decodeURIComponent(atob(payload));
      const obj = JSON.parse(json);
      this.pollData = obj as PollData;
    } catch (e) {
      console.error('Failed to decode poll payload', e);
    }
  }
}
