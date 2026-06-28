import { Component, Input } from '@angular/core';

@Component({
 selector: 'app-recipe',
 templateUrl: './recipe.component.html',
 styleUrls: ['./recipe.component.css']
})
export class RecipeComponent {
 @Input() parentComponent: any;
}