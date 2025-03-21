import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router'; 
import { AppComponent } from './app.component';
import { MediaViewerComponent } from './media-viewer/media-viewer.component';

const routes: Routes = [
  { path: 'Memes/:memeId', component: AppComponent },
  { path: 'Memes', component: AppComponent },
  { path: 'Social/:storyId', component: AppComponent },
  { path: 'Social', component: AppComponent },
  { path: 'User/:userId', component: AppComponent },
  { path: 'User/:userId/:storyId', component: AppComponent },
  { path: 'File/:fileId', component: AppComponent },
  { path: 'File', component: AppComponent },
  { path: 'Wordler', component: AppComponent },
  { path: 'Media/:fileId', component: MediaViewerComponent },
  { path: 'Array', component: AppComponent },
  { path: 'Crypto', component: AppComponent },
  { path: 'War', component: AppComponent },
  { path: 'Meta', component: AppComponent },
  { path: 'Crawler/:url', component: AppComponent },
  { path: 'Crawler', component: AppComponent },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
