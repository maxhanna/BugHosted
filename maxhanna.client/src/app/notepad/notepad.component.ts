import { Component } from '@angular/core';
import { ChildComponent } from '../child.component';

@Component({
  selector: 'app-notepad',
  templateUrl: './notepad.component.html',
  styleUrl: './notepad.component.css'
})
export class NotepadComponent extends ChildComponent {

}
