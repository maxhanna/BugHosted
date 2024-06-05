import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AppComponent } from './app.component';
import { MemeComponent } from './meme/meme.component';
import { SocialComponent } from './social/social.component';

const routes: Routes = [
  { path: 'Memes/:memeId', component: MemeComponent },
  { path: 'Social/:storyId', component: SocialComponent }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
