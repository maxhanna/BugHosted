import { Component, Input, OnInit } from '@angular/core';
import { User } from '../../services/datacontracts/user';
import { AppComponent } from '../app.component';
import { ChildComponent } from '../child.component';

@Component({
  selector: 'app-user-tag',
  templateUrl: './user-tag.component.html',
  styleUrl: './user-tag.component.css'
})
export class UserTagComponent extends ChildComponent implements OnInit {
  @Input() user?: User;
  @Input() inputtedParentRef?: AppComponent;
  constructor() { super(); }
  ngOnInit() {
    this.parentRef = this.inputtedParentRef;
  }
}
