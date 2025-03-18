import { AfterViewInit, Component, ComponentRef, ElementRef, OnDestroy, OnInit, ViewChild, ViewContainerRef } from '@angular/core';
import { ActivatedRoute, NavigationEnd, NavigationStart, Router, RouterOutlet } from '@angular/router';
import { CalendarComponent } from './calendar/calendar.component'; 
import { FavouritesComponent } from './favourites/favourites.component';
import { WeatherComponent } from './weather/weather.component'; 
import { FileComponent } from './file/file.component'; 
import { TodoComponent } from './todo/todo.component';
import { ContactsComponent } from './contacts/contacts.component';
import { NotepadComponent } from './notepad/notepad.component';
import { MusicComponent } from './music/music.component'; 
import { UserComponent } from './user/user.component';
import { MenuItem } from '../services/datacontracts/user/menu-item';
import { ChatComponent } from './chat/chat.component';
import { MemeComponent } from './meme/meme.component';
import { SocialComponent } from './social/social.component';
import { NewsComponent } from './news/news.component';
import { NavigationComponent } from './navigation/navigation.component';
import { WordlerComponent } from './wordler/wordler.component';
import { UpdateUserSettingsComponent } from './update-user-settings/update-user-settings.component';
import { EmulationComponent } from './emulation/emulation.component';
import { ArrayComponent } from './array/array.component';
import { NexusComponent } from './nexus/nexus.component';
import { MetaComponent } from './meta/meta.component';
import { User } from '../services/datacontracts/user/user';
import { ModalComponent } from './modal/modal.component';
import { NotificationsComponent } from './notifications/notifications.component';
import { UserService } from '../services/user.service'; 
import { CryptoHubComponent } from './crypto-hub/crypto-hub.component';
import { HostAiComponent } from './host-ai/host-ai.component';
import { DomSanitizer, Meta, Title } from '@angular/platform-browser';
import { MediaViewerComponent } from './media-viewer/media-viewer.component';
import { ThemesComponent } from './themes/themes.component';
import { FileEntry } from '../services/datacontracts/file/file-entry';



@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, AfterViewInit {
  user: User | undefined = undefined;
  @ViewChild("viewContainerRef", { read: ViewContainerRef }) VCR!: ViewContainerRef;
  @ViewChild("outlet") outlet!: RouterOutlet;
  @ViewChild(NavigationComponent) navigationComponent!: NavigationComponent;
  @ViewChild(ModalComponent) modalComponent!: ModalComponent;
  notifications: string[] = [];
  showMainContent = true;
  isModalOpen = false;
  isModal = false;
  isModalCloseVisible = true;
  isShowingOverlay = false;
  pictureSrcs: { key: string, value: string, type: string, extension: string }[] = []; 
  isNavigationInitialized: boolean = false;
  debounceTimer: any;
  originalWeatherIcon = "☀️";
  child_unique_key: number = 0;
  componentsReferences = Array<ComponentRef<any>>();
  navigationItems: MenuItem[] = [ 
    { ownership: 0, icon: "🌍", title: "Social", content: undefined },
    { ownership: 0, icon: "🤣", title: "Meme", content: undefined },
    { ownership: 0, icon: "🎖️", title: "Bug-Wars", content: undefined },
    { ownership: 0, icon: "🤖", title: "Meta-Bots", content: undefined },
    { ownership: 0, icon: "🗨️", title: "Chat", content: undefined },
    { ownership: 0, icon: "🎮", title: "Emulation", content: undefined },
    { ownership: 0, icon: "⚔️", title: "Array", content: undefined },
    { ownership: 0, icon: "🧠", title: "Wordler", content: undefined },
    { ownership: 0, icon: "📁", title: "Files", content: undefined },
    { ownership: 0, icon: "📅", title: "Calendar", content: undefined },
    { ownership: 0, icon: "☀️", title: "Weather", content: '' },
    { ownership: 0, icon: "✔️", title: "Todo", content: undefined },
    { ownership: 0, icon: "🎼", title: "Music", content: undefined },
    { ownership: 0, icon: "🗒️", title: "Notepad", content: undefined },
    { ownership: 0, icon: "📇", title: "Contacts", content: undefined }, 
    { ownership: 0, icon: "📰", title: "News", content: undefined }, 
    { ownership: 0, icon: "₿", title: "Crypto-Hub", content: undefined },
    { ownership: 0, icon: "🔍", title: "Favourites", content: undefined }, 
    { ownership: 0, icon: "🎨", title: "Theme", content: undefined }, 
    { ownership: 0, icon: "🧐", title: "HostAi", content: undefined }, 
    { ownership: 0, icon: "🔔", title: "Notifications", content: undefined },
    { ownership: 0, icon: "👤", title: "User", content: undefined },
    { ownership: 0, icon: "➕", title: "UpdateUserSettings", content: undefined },
  ];
  location?: { ip:string, city: string, country: string } = undefined;

  private componentMap: { [key: string]: any; } = {
    "Navigation": NavigationComponent,
    "Favourites": FavouritesComponent, 
    "Calendar": CalendarComponent,
    "Weather": WeatherComponent, 
    "Files": FileComponent,
    "Todo": TodoComponent,
    "Music": MusicComponent,
    "Notepad": NotepadComponent,
    "Contacts": ContactsComponent,
    "Emulation": EmulationComponent,
    "Array": ArrayComponent,
    "Bug-Wars": NexusComponent,
    "Meta-Bots": MetaComponent,
    "Wordler": WordlerComponent,
    "News": NewsComponent,
    "Crypto-Hub": CryptoHubComponent,
    "User": UserComponent,
    "Chat": ChatComponent,
    "Social": SocialComponent,
    "HostAi": HostAiComponent,
    "Theme": ThemesComponent,
    "MediaViewer": MediaViewerComponent,
    "Meme": MemeComponent,
    "Notifications": NotificationsComponent,
    "UpdateUserSettings": UpdateUserSettingsComponent
  };
  userSelectedNavigationItems: Array<MenuItem> = [];
  constructor(private router: Router,
    private route: ActivatedRoute,
    private userService: UserService,
    private meta: Meta,
    private title: Title, 
    private sanitizer: DomSanitizer) { }

  ngOnInit() {
    if (this.getCookie("user")) {
      this.user = JSON.parse(this.getCookie("user")); 
    } 
    this.updateHeight();
    this.getSelectedMenuItems()
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/firebase-messaging-sw.js')
        .then((registration) => {
          console.log('Service Worker registered:', registration);
        })
        .catch((error) => {
          console.error('Service Worker registration failed:', error);
        });
    }
  }
  ngAfterViewInit() {
    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) { 
        if (this.router.url.includes('Memes')) {
          this.checkAndClearRouterOutlet();
          const memeId = this.router.url.toLowerCase().split('memes/')[1]?.split('?')[0];
          this.createComponent("Meme", { "memeId": memeId });
        }
        if (this.router.url.includes('Social')) {
          this.checkAndClearRouterOutlet();
          const storyId = this.router.url.toLowerCase().split('social/')[1]?.split('?')[0];
          this.createComponent("Social", { "storyId": storyId });
        }
        if (this.router.url.includes('User')) {
          this.checkAndClearRouterOutlet();
          const userId = this.router.url.toLowerCase().split('user/')[1]?.split('?')[0];
          this.createComponent("User", { "userId": userId });
        }
        if (this.router.url.includes('File')) {
          this.checkAndClearRouterOutlet();
          const fileId = this.router.url.toLowerCase().split('file/')[1]?.split('?')[0];
          this.createComponent("Files", { "fileId": fileId });
        }
        if (this.router.url.includes('Media')) {
          this.checkAndClearRouterOutlet();
          const fileId = this.router.url.toLowerCase().split('media/')[1]?.split('?')[0];
          this.createComponent("MediaViewer", { "fileId": fileId, "isLoadedFromURL": true });
        }
        if (this.router.url.includes('Array')) {
          this.checkAndClearRouterOutlet();
          this.createComponent('Array');
        }
        if (this.router.url.includes('War')) {
          this.checkAndClearRouterOutlet();
          this.createComponent('Bug-Wars');
        }
        if (this.router.url.includes('Meta')) {
          this.checkAndClearRouterOutlet();
          this.createComponent('Meta-Bots');
        }
        if (this.router.url.includes('Wordler')) {
          this.checkAndClearRouterOutlet();
          this.createComponent('Wordler');
        }
        if (this.router.url.includes('Crypto')) {
          this.checkAndClearRouterOutlet();
          this.createComponent('Crypto-Hub');
        }
      }
    }); 
  } 
  async getSelectedMenuItems() {
    if (!this.user) {
      this.userSelectedNavigationItems = [ 
        { ownership: 0, icon: "🌍", title: "Social", content: undefined },
        { ownership: 0, icon: "🤣", title: "Meme", content: undefined },
        { ownership: 0, icon: "🗨️", title: "Chat", content: undefined },
        { ownership: 0, icon: "🧠", title: "Wordler", content: undefined },
        { ownership: 0, icon: "🎮", title: "Emulation", content: undefined },
        { ownership: 0, icon: "📁", title: "Files", content: undefined }, 
        { ownership: 0, icon: "👤", title: "User", content: undefined },
      ];
    } else {
      this.userSelectedNavigationItems = await this.userService.getUserMenu(this.user!);
    }
    this.isNavigationInitialized = true;
  }
  checkAndClearRouterOutlet() {
    if (this.outlet) {
      //console.log("Router outlet is activated, navigating to root to clear it.");
      this.router.navigate(['/']);
      this.router.dispose();
    }
  }
  createComponent(componentType: string, inputs?: { [key: string]: any; }) { 
    this.navigationComponent.minimizeNav();
    this.closeOverlay();
    this.replacePageTitleAndDescription(componentType, componentType);

    if (!componentType || componentType.trim() === "") { 
      window.location = window.location;
      return null;
    }

    const componentClass = this.componentMap[componentType];
    if (!componentClass) { 
      return null;
    }
    const existingComponent = this.componentsReferences.find(compRef => compRef.instance instanceof componentClass);

    if (componentType !== "User" && existingComponent) { 
      return;
    }

    this.removeAllComponents();

    const childComponentRef = this.VCR.createComponent(componentClass);
    let childComponent: any = childComponentRef.instance;
    childComponent.unique_key = ++this.child_unique_key;
    childComponent.parentRef = this;

    if (inputs) {
      Object.keys(inputs).forEach(key => {
        childComponent[key] = inputs[key];
      });
    }
    this.componentsReferences.push(childComponentRef);
    return childComponentRef;
  }
  removeComponent(key: number) {
    if (!this.VCR || this.VCR.length < 1) return;
    this.replacePageTitleAndDescription("Bug Hosted", "Bug Hosted"); 
    history.pushState({ page: "" }, "", "/");

    const componentRef = this.componentsReferences.find(
      x => x.instance.unique_key == key
    );

    for (let x = 0; x < this.VCR.length; x++) {
      if ((this.VCR.get(x)) == componentRef?.hostView) {
        this.VCR.remove(x);
        componentRef?.destroy();
      }
    }

    this.componentsReferences = this.componentsReferences.filter(
      x => x.instance.unique_key !== key
    );
    this.navigationComponent.maximizeNav();
  }

  removeAllComponents() {
    if (!this.VCR || this.VCR.length < 1) return;

    this.componentsReferences.forEach(componentRef => {
      componentRef.destroy();
    });

    this.VCR.clear();
    this.componentsReferences = [];
  }

  getCookie(name: string) {
    let ca: Array<string> = document.cookie.split(';');
    let caLen: number = ca.length;
    let cookieName = `${name}=`;
    let c: string;

    for (let i: number = 0; i < caLen; i += 1) {
      c = ca[i].replace(/^\s+/g, '');
      if (c.indexOf(cookieName) == 0) {
        return c.substring(cookieName.length, c.length);
      }
    }
    return '';
  }
  resetUserCookie() {
    this.deleteCookie("user");
    this.setCookie("user", JSON.stringify(this.user), 10);
  }
  deleteCookie(name: string) {
    this.setCookie(name, '', 1);
  }
  setCookie(name: string, value: string, expireDays: number, path: string = '') {
    let d: Date = new Date();
    d.setTime(d.getTime() + expireDays * 24 * 60 * 60 * 1000);
    let expires: string = `expires=${d.toUTCString()}`;
    let cpath: string = path ? `; path=${path}` : '';
    document.cookie = `${name}=${value}; ${expires}${cpath}`;
  }
  verifyUser() {
    if (!this.user || this.user == null || this.user.id == 0) return false;
    return true;
  }
  clearAllNotifications() {
    this.navigationComponent.clearNotifications();
    this.navigationComponent.ngOnInit();
  }
  async getNotifications() {
    this.navigationComponent.clearNotifications();
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => { 
      await this.navigationComponent.getNotifications(); 
    }, 500); 
  }
  openModal() {
    this.isModalOpen = true;
  }

  closeModal() {
    this.isModalOpen = false;
  }
  setModalBody(msg: any) { 
    if (!this.isModalOpen) {
      this.isModalOpen = true;
    }
    setTimeout(() => {
      this.modalComponent.setModalBody(msg);
    }, 100);
  }
  
  updateHeight() { 
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  }
  hideBodyOverflow() { 
    document.body.style.overflow = "hidden";
    const elems = document.getElementsByClassName("popupPanel");
    for (let x = 0; x < elems.length; x++) {
      (elems[x] as HTMLDivElement).style.overflow = "hidden";
    }
    const elems2 = document.getElementsByClassName("componentContainer");
    for (let x = 0; x < elems2.length; x++) {
      (elems2[x] as HTMLDivElement).style.overflow = "hidden";
    }
    const elems3 = document.getElementsByClassName("componentMain");
    for (let x = 0; x < elems3.length; x++) {
      (elems3[x] as HTMLDivElement).style.overflow = "hidden";
    }
    const elems4 = document.getElementsByTagName("html");
    for (let x = 0; x < elems4.length; x++) {
      (elems4[x] as HTMLElement).style.overflow = "hidden";
    }
  }
  restoreBodyOverflow() { 
    document.body.style.overflow = "";
    const elems = document.getElementsByClassName("popupPanel");
    for (let x = 0; x < elems.length; x++) {
      (elems[x] as HTMLDivElement).style.overflow = "";
    } 
    const elems2 = document.getElementsByClassName("componentMain");
    for (let x = 0; x < elems2.length; x++) {
      (elems2[x] as HTMLDivElement).style.overflow = "";
    }
    const elems3 = document.getElementsByClassName("componentContainer");
    for (let x = 0; x < elems3.length; x++) {
      (elems3[x] as HTMLDivElement).style.overflow = "";
    }
    const elems4 = document.getElementsByTagName("html");
    for (let x = 0; x < elems4.length; x++) {
      (elems4[x] as HTMLElement).style.overflow = "";
    }
  }
  showOverlay() { 
    this.isShowingOverlay = true;
    this.hideBodyOverflow();
  }
  closeOverlay() {
    //console.log("closing overlay");
    const closeButtons = document.querySelectorAll<HTMLButtonElement>("#closeOverlay"); 
    closeButtons.forEach((button) => button.click()); 
    this.isShowingOverlay = false;
    this.restoreBodyOverflow();
  }
  openUserSettings() {
    this.createComponent('UpdateUserSettings', { showOnlySelectableMenuItems: false, areSelectableMenuItemsExplained: false, inputtedParentRef: this });
  }

  setViewportScalability(scalable?: boolean) {
    if (scalable === undefined) {
      scalable = true;
    } 

    if (scalable) {
      window.location = window.location;
    } else {  
      this.meta.updateTag({ name: 'viewport', content: `width=device-width, initial-scale=1.0, user-scalable=no` });  
    }
  }

  showNotification(text?: string) {
    if (!text) { return; }
    else {
      this.notifications.push(text); 
      setTimeout(() => { this.notifications.shift(); }, 8000);
    }
  }
  cleanStoryText(text: string) {
    return text?.replace(/\[\/?[^]\]/g, '')?.replace(/https?:\/\/[^\s]+/g, '');
  }
  replacePageTitleAndDescription(title: string, description: string) {
    let tmpTitle = title;
    let tmpDescription = description;

    tmpTitle = this.cleanStoryText(tmpTitle);
    tmpDescription = this.cleanStoryText(tmpDescription);

    this.title.setTitle(tmpTitle);
    this.meta.updateTag({ name: 'description', content: tmpDescription ?? tmpTitle });
    return {
      title: tmpTitle, description: tmpDescription
    };
  }
  getTextForDOM(text?: string, component_id?: number) {
    if (!text) return "";

    const youtubeRegex = /(https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)([\w-]{11})|youtu\.be\/([\w-]{11}))(?:\S+)?)/g;

    // Step 1: Temporarily replace YouTube links with placeholders
    text = text.replace(youtubeRegex, (match, url, videoId, shortVideoId) => {
      const id = videoId || shortVideoId;
      return `__YOUTUBE__${id}__YOUTUBE__`;
    });

    // Step 2: Convert regular URLs into clickable links
    text = text.replace(/(<a[^>]*>.*?<\/a>)|(https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+)/gi, (match, existingLink, url) => {
      if (existingLink) return existingLink;
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    }).replace(/\n/g, '<br>');

    // Step 3: Replace YouTube placeholders with clickable links
    text = text.replace(/__YOUTUBE__([\w-]{11})__YOUTUBE__/g, (match, videoId) => {
      return `<a onClick="document.getElementById('youtubeVideoIdInput').value='${videoId}';document.getElementById('youtubeVideoButton').click()" class="cursorPointer youtube-link">https://www.youtube.com/watch?v=${videoId}</a>`;
    });

    // Step 4: Convert quotes and style the quote text
    while (/\[Quoting \{(.+?)\|(\d+)\|([\d-T:.]+)\}: (.*?)\](?!\])/s.test(text)) {
      text = text.replace(/\[Quoting \{(.+?)\|(\d+)\|([\d-T:.]+)\}: (.*?)\](?!\])/gs, (match, username, userId, timestamp, quotedMessage) => {
        const formattedTimestamp = new Date(timestamp).toLocaleString();

        return `
      <span class="quote-text">
        <span class="quote-user">${username}</span> 
        <span class="quote-time">(${formattedTimestamp})</span>:  
        "<span class="quote-message">${quotedMessage}</span>"
      </span>
    `;
      });
    }  

    // Step 5: Convert Bold, Bullet-point, and Italics
    text = text
      .replace(/\[b\](.*?)\[\/b\]/gi, "<b>$1</b>") // Bold
      .replace(/\[\*\](.*?)\[\/\*\]/gi, "<br>&bull; $1") // Bullet-point
      .replace(/\[i\](.*?)\[\/i\]/gi, "<i>$1</i>"); // Italics

    return this.sanitizer.bypassSecurityTrustHtml(text);
  }

  getDirectoryName(file: FileEntry): string {
    let base = file.directory?.replace('E:/Dev/maxhanna/maxhanna.client/src/assets/Uploads/', '').trim();
    if (base === "") {
      return ".";
    } 
    return base ?? "";
  }
  addResizeListener() {
    window.addEventListener('resize', this.updateHeight);
  }
  removeResizeListener() {
    window.removeEventListener('resize', this.updateHeight);
  }
  async getLocation() {
    if (this.location) { 
      return this.location;
    }
    else {
      if (this.getCookie("location")) {
        this.location = JSON.parse(this.getCookie("location"));
      } else {
        await this.userService.getUserIp().then(res => {
          if (res) {
            this.location = { ip: res.ip, city: res.city, country: res.country };
            this.setCookie("location", JSON.stringify(this.location), 1);
          }
        });
      } 
      return this.location;
    }
  }
}
