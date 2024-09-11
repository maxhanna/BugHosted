import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router'; 
import { AppComponent } from './app.component';

const routes: Routes = [
  { path: 'Memes/:memeId', component: AppComponent },
  { path: 'Memes', component: AppComponent },
  { path: 'Social/:storyId', component: AppComponent },
  { path: 'Social', component: AppComponent },
  { path: 'User/:userId', component: AppComponent },
  { path: 'File/:fileId', component: AppComponent },
  { path: 'File', component: AppComponent },
  { path: 'Wordler', component: AppComponent },
  { path: 'Array', component: AppComponent },
  { path: 'War', component: AppComponent },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
