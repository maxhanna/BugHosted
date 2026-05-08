import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-bonfire-loading',
  templateUrl: './bonfire-loading.component.html',
  styleUrls: ['./bonfire-loading.component.css']
})
export class BonfireLoadingComponent {
  @Input() isLoading: boolean = false;
}