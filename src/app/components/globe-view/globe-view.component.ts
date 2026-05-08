import { Component } from '@angular/core';

@Component({
  selector: 'app-globe-view',
  templateUrl: './globe-view.component.html',
  styleUrls: ['./globe-view.component.css']
})
export class GlobeViewComponent {
  // Mock bonfire data
  bonfireItems = [
    { id: 1, name: 'Bonfire 1', position: { x: 0, y: 0 } },
    { id: 2, name: 'Bonfire 2', position: { x: 100, y: 100 } },
    { id: 3, name: 'Bonfire 3', position: { x: 200, y: 200 } },
  ];

  // Loading state
  isSwapping = false;

  // Simulate swapping bonfire positions
  swapBonfirePositions(bonfire1: any, bonfire2: any) {
    this.isSwapping = true;
    
    // Simulate async operation
    setTimeout(() => {
      // Swap positions
      const tempX = bonfire1.position.x;
      const tempY = bonfire1.position.y;
      
      bonfire1.position.x = bonfire2.position.x;
      bonfire1.position.y = bonfire2.position.y;
      
      bonfire2.position.x = tempX;
      bonfire2.position.y = tempY;
      
      this.isSwapping = false;
    }, 1500); // 1.5 second delay to show loading
  }
}