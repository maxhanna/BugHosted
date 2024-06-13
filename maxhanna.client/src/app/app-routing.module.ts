import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router'; 
import { AppComponent } from './app.component';

const routes: Routes = [
  { path: 'Memes/:memeId', component: AppComponent },
  { path: 'Social/:storyId', component: AppComponent },
  { path: 'User/:userId', component: AppComponent },
  { path: 'Wordler', component: AppComponent },
  { path: 'wordler', component: AppComponent },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
