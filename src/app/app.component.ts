import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  template: `
    <div class="app-container">
      <nav class="app-nav">
        <a routerLink="/sigint" routerLinkActive="active">Signals Intelligence</a>
        <!-- Add other menu items here -->
      </nav>
      <router-outlet></router-outlet>
    </div>
  `,
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'BugHosted';
}