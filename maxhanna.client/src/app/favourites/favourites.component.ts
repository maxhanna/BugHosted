import { Component } from '@angular/core';
import { ChildComponent } from '../child.component';

@Component({
  selector: 'app-favourites',
  templateUrl: './favourites.component.html',
  styleUrl: './favourites.component.css'
})
export class FavouritesComponent extends ChildComponent {

}
