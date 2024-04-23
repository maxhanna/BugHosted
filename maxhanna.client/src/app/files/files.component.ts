import { Component } from '@angular/core';
import { ChildComponent } from '../child.component';

@Component({
  selector: 'app-files',
  templateUrl: './files.component.html',
  styleUrl: './files.component.css'
})
export class FilesComponent extends ChildComponent {

}
