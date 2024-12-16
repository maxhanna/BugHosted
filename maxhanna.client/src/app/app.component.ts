import { AfterViewInit, Component, ComponentRef, ElementRef, OnDestroy, OnInit, ViewChild, ViewContainerRef } from '@angular/core';
import { CalendarComponent } from './calendar/calendar.component';
import { CoinWatchComponent } from './coin-watch/coin-watch.component';
import { FavouritesComponent } from './favourites/favourites.component';
import { WeatherComponent } from './weather/weather.component';
import { MiningDevicesComponent } from './mining-devices/mining-devices.component';
import { FileComponent } from './file/file.component';
import { MiningRigsComponent } from './mining-rigs/mining-rigs.component';
import { TodoComponent } from './todo/todo.component';
import { ContactsComponent } from './contacts/contacts.component';
import { NotepadComponent } from './notepad/notepad.component';
import { MusicComponent } from './music/music.component';
import { CoinWalletComponent } from './coin-wallet/coin-wallet.component';
import { UserComponent } from './user/user.component';
import { MenuItem } from '../services/datacontracts/user/menu-item';
import { ChatComponent } from './chat/chat.component';
import { MemeComponent } from './meme/meme.component';
import { SocialComponent } from './social/social.component';
import { NewsComponent } from './news/news.component';
import { NavigationComponent } from './navigation/navigation.component';
import { ActivatedRoute, NavigationEnd, NavigationStart, Router, RouterOutlet } from '@angular/router';
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
  showMainContent = true;
  isModalOpen = false;
  isModal = false;
  isModalCloseVisible = true;
  showOverlay = false;
  pictureSrcs: { key: string, value: string, type: string, extension: string }[] = [];
  created: boolean = false; // Global variable accessible throughout the component
  isNavigationInitialized: boolean = false;
  originalWeatherIcon = "☀️";
  child_unique_key: number = 0;
  componentsReferences = Array<ComponentRef<any>>();
  navigationItems: MenuItem[] = [
    /*{ ownership: 0, icon: "📕", title: "Close Menu", content: '' },*/
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
    /*{ ownership: 0, icon: "🎮", title: "Gameboy Color", content: undefined },*/
    { ownership: 0, icon: "📰", title: "News", content: undefined },
    { ownership: 0, icon: "₿", title: "Coin-Watch", content: undefined },
    { ownership: 0, icon: "💵", title: "Coin-Wallet", content: undefined },
    { ownership: 0, icon: "🔍", title: "Favourites", content: undefined },
    { ownership: 0, icon: "⛏️", title: "MiningDevices", content: undefined },
    { ownership: 0, icon: "🖥️", title: "MiningRigs", content: undefined },
    { ownership: 0, icon: "🔔", title: "Notifications", content: undefined },
    { ownership: 0, icon: "👤", title: "User", content: undefined },
    { ownership: 0, icon: "➕", title: "UpdateUserSettings", content: undefined },
  ];
 

  private componentMap: { [key: string]: any; } = {
    "Navigation": NavigationComponent,
    "Favourites": FavouritesComponent,
    "Coin-Watch": CoinWatchComponent,
    "Calendar": CalendarComponent,
    "Weather": WeatherComponent,
    "MiningDevices": MiningDevicesComponent,
    "MiningRigs": MiningRigsComponent,
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
    "Coin-Wallet": CoinWalletComponent,
    "User": UserComponent,
    "Chat": ChatComponent,
    "Social": SocialComponent,
    "Meme": MemeComponent,
    "Notifications": NotificationsComponent,
    "UpdateUserSettings": UpdateUserSettingsComponent
  };
  userSelectedNavigationItems: Array<MenuItem> = [];
  constructor(private router: Router, private route: ActivatedRoute, private userService: UserService) {
  
  }
  ngOnInit() {
    if (this.getCookie("user")) {
      this.user = JSON.parse(this.getCookie("user")); 
    }
    window.addEventListener('resize', this.updateHeight);
    this.updateHeight();
    this.getSelectedMenuItems()
  }
  ngAfterViewInit() {
    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) { 
        if (this.router.url.includes('Memes')) {
          this.checkAndClearRouterOutlet();
          const memeId = this.router.url.toLowerCase().split('memes/')[1];
          this.createComponent("Meme", { "memeId": memeId });
        }
        if (this.router.url.includes('Social')) {
          this.checkAndClearRouterOutlet();
          const storyId = this.router.url.toLowerCase().split('social/')[1];
          this.createComponent("Social", { "storyId": storyId });
        }
        if (this.router.url.includes('User')) {
          this.checkAndClearRouterOutlet();
          const userId = this.router.url.toLowerCase().split('user/')[1];
          this.createComponent("User", { "userId": userId });
        }
        if (this.router.url.includes('File')) {
          this.checkAndClearRouterOutlet();
          const fileId = this.router.url.toLowerCase().split('file/')[1];
          this.createComponent("Files", { "fileId": fileId });
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

    if (!componentType || componentType.trim() === "") {
      console.log("returning null due to invalid componentType");
      return null;
    }

    const componentClass = this.componentMap[componentType];
    if (!componentClass) {
      console.log(`Unknown component: ${componentType}`);
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
  openModal() {
    this.isModalOpen = true;
  }

  closeModal() {
    this.isModalOpen = false;
  }
  setModalBody(msg: any) {
    console.log("set modal body in parent");
    if (!this.isModalOpen) {
      this.isModalOpen = true;
    }
    setTimeout(() => {
      this.modalComponent.setModalBody(msg);
    }, 100);
  }
  
  updateHeight() {
    console.log("setting inner height " + window.innerHeight * 0.01);
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  }
  closeOverlay() { 
   const closeButtons = document.querySelectorAll<HTMLButtonElement>("#closeOverlay"); 
  closeButtons.forEach((button) => button.click());
   
  this.showOverlay = false;
  }
}
