import { Component, Input, OnInit } from '@angular/core'; 
import { AppComponent } from '../app.component';
import { ChildComponent } from '../child.component';
import { User } from '../../services/datacontracts/user/user';

@Component({
  selector: 'app-user-tag',
  templateUrl: './user-tag.component.html',
  styleUrl: './user-tag.component.css'
})
export class UserTagComponent extends ChildComponent implements OnInit {
  @Input() user?: User;
  @Input() inputtedParentRef?: AppComponent;
  @Input() displayEmptyAvatar = false;
  @Input() displayOnlyName = false;
  @Input() hideName = false;
  constructor() { super(); }
  ngOnInit() {
    this.parentRef = this.inputtedParentRef;
  }
}
