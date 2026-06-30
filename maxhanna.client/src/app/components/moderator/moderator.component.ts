import { Component } from '@angular/core';
import { ChildComponent } from '../../child.component';
 
@Component({
 selector: 'app-moderator',
 standalone: false,
 templateUrl: './moderator.component.html',
 styleUrl: './moderator.component.css'
})
export class ModeratorComponent extends ChildComponent {
 ngOnInit() {
 // Basic ngOnInit implementation
 }
}
