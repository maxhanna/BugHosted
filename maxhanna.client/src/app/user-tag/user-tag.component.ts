import { Component, Input } from '@angular/core';
import { User } from '../../services/datacontracts/user';
import { AppComponent } from '../app.component';

@Component({
  selector: 'app-user-tag',
  templateUrl: './user-tag.component.html',
  styleUrl: './user-tag.component.css'
})
export class UserTagComponent {
  @Input() user?: User; 
}
