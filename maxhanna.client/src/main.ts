import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';

if (location.protocol === 'http:' && location.hostname === 'bughosted.com') {
  location.href = location.href.replace('http:', 'https:');
}
platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => console.error(err));
