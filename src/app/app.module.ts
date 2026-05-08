import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouterModule } from '@angular/router';

import { AppComponent } from './app.component';
import { SigintComponent } from './sigint/sigint.component';
import { TitleBarComponent } from './title-bar/title-bar.component';

@NgModule({
  declarations: [
    AppComponent,
    SigintComponent,
    TitleBarComponent
  ],
  imports: [
    BrowserModule,
    RouterModule.forRoot([
      { path: 'sigint', component: SigintComponent },
      { path: '', redirectTo: '/sigint', pathMatch: 'full' },
      // Add other routes here
    ])
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }