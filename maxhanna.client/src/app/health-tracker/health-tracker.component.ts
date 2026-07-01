import { Component } from '@angular/core';

@Component({
  selector: 'app-health-tracker',
  standalone: false,
  templateUrl: './health-tracker.component.html',
  styleUrls: ['./health-tracker.component.css']
})
export class HealthTrackerComponent {
  exercises: any[] = [];
  foodItems: any[] = [];
  constructor() { }
  addExercise() {
    // Implementation for adding an exercise
    console.log('Add exercise functionality would go here');
  }
  removeExercise() {
    // Implementation for removing an exercise
    console.log('Remove exercise functionality would go here');
  }
  addFoodItem() {
    // Implementation for adding a food item
    console.log('Add food item functionality would go here');
  }
  removeFoodItem() {
    // Implementation for removing a food item
    console.log('Remove food item functionality would go here');
  }
}