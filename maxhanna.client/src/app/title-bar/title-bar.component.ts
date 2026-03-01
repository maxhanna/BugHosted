import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-title-bar',
  templateUrl: './title-bar.component.html',
  styleUrls: ['./title-bar.component.css']
})
export class TitleBarComponent {
  @Input() title: string | undefined;
  @Input() hasNotifications: boolean = false;
}
