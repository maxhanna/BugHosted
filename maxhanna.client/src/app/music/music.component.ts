import { Component } from '@angular/core';
import { ChildComponent } from '../child.component';

@Component({
  selector: 'app-music',
  templateUrl: './music.component.html',
  styleUrl: './music.component.css'
})
export class MusicComponent extends ChildComponent {

}
