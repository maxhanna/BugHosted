import { Component } from '@angular/core';
import { ChildComponent } from '../child.component';

@Component({
  selector: 'app-contacts',
  templateUrl: './contacts.component.html',
  styleUrl: './contacts.component.css'
})
export class ContactsComponent extends ChildComponent {

}
