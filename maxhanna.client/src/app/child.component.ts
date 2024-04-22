import { Component } from '@angular/core';
import { AppComponent } from './app.component';

@Component({
  selector: 'app-child-component',
  template: '',
})
export class ChildComponent {
  public unique_key?: number;
  public parentRef?: AppComponent; 

  remove_me() {
    if (this.parentRef && this.unique_key) {
      this.parentRef.removeComponent(this.unique_key);
    }
  }
}
