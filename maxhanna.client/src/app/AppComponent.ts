import { AfterViewInit, Component, ComponentRef, OnInit, ViewChild, ViewContainerRef } from '@angular/core';
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
import { GbcComponent } from './gbc/gbc.component';
import { UserComponent } from './user/user.component';
import { User } from '../services/datacontracts/user';
import { MenuItem } from '../services/datacontracts/menu-item';
import { ChatComponent } from './chat/chat.component';
import { MemeComponent } from './meme/meme.component';
import { SocialComponent } from './social/social.component';
import { NewsComponent } from './news/news.component';
import { NavigationComponent } from './navigation/navigation.component';
import { ActivatedRoute, Router } from '@angular/router';
import { WordlerComponent } from './wordler/wordler.component';
import { UpdateUserSettingsComponent } from './update-user-settings/update-user-settings.component';




@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, AfterViewInit {
    user: User | undefined = undefined;
    @ViewChild("viewContainerRef", { read: ViewContainerRef }) VCR!: ViewContainerRef;
    @ViewChild(NavigationComponent) navigationComponent!: NavigationComponent;
    showMainContent: boolean = true;

    child_unique_key: number = 0;
    componentsReferences = Array<ComponentRef<any>>();
    navigationItems: MenuItem[] = [
        { ownership: 0, icon: "📕", title: "Close Menu", content: '' },
        { ownership: 0, icon: "🔍", title: "Favourites", content: undefined },
        { ownership: 0, icon: "📅", title: "Calendar", content: undefined },
        { ownership: 0, icon: "⛏️", title: "MiningDevices", content: undefined },
        { ownership: 0, icon: "🖥️", title: "MiningRigs", content: undefined },
        { ownership: 0, icon: "☀️", title: "Weather", content: '' },
        { ownership: 0, icon: "✔️", title: "Todo", content: undefined },
        { ownership: 0, icon: "🎼", title: "Music", content: undefined },
        { ownership: 0, icon: "📁", title: "Files", content: undefined },
        { ownership: 0, icon: "🗒️", title: "Notepad", content: undefined },
        { ownership: 0, icon: "📇", title: "Contacts", content: undefined },
        { ownership: 0, icon: "🎮", title: "Gameboy Color", content: undefined },
        { ownership: 0, icon: "🧠", title: "Wordler", content: undefined },
        { ownership: 0, icon: "💵", title: "Coin-Wallet", content: undefined },
        { ownership: 0, icon: "₿", title: "Coin-Watch", content: undefined },
        { ownership: 0, icon: "📰", title: "News", content: undefined },
        { ownership: 0, icon: "🗨️", title: "Chat", content: undefined },
        { ownership: 0, icon: "🤣", title: "Meme", content: undefined },
        { ownership: 0, icon: "🌍", title: "Social", content: undefined },
        { ownership: 0, icon: "👤", title: "User", content: undefined },
    ];


    private componentMap: { [key: string]: any; } = {
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
        "Gameboy Color": GbcComponent,
        "Wordler": WordlerComponent,
        "News": NewsComponent,
        "Coin-Wallet": CoinWalletComponent,
        "User": UserComponent,
        "Chat": ChatComponent,
        "Social": SocialComponent,
        "Meme": MemeComponent,
        "UpdateUserSettings": UpdateUserSettingsComponent
    };
    userSelectedNavigationItems: Array<MenuItem> = [];
    constructor(private router: Router, private route: ActivatedRoute) {
    }
    ngOnInit() {
        if (this.getCookie("user")) {
            this.user = JSON.parse(this.getCookie("user"));
        }
    }
    ngAfterViewInit() {
        this.route.paramMap.subscribe(params => {
            const storyId = parseInt(params.get('storyId')!);
            if (storyId) {
                this.createComponent("Social", { "storyId": storyId });
            }
            const memeId = parseInt(params.get('memeId')!);
            if (memeId) {
                this.createComponent("Meme", { "memeId": memeId });
            }
            const userId = params.get('userId'); // Do not use parseInt here
            if (userId) {
                this.createComponent("User", { "userId": parseInt(userId) }); // Parse to int only if it exists
            }
        });
        this.router.events.subscribe(event => {
            if (this.router.url.includes("Wordler")) {
                this.createComponent("Wordler");
            }
        });
    }
    createComponent(componentType: string, inputs?: { [key: string]: any; }) {
        console.log("creating component : " + componentType);
        if (!componentType || componentType.trim() === "") return null;

        const componentClass = this.componentMap[componentType];
        if (!componentClass) {
            console.log(`Unknown component: ${componentType}`);
            return null;
        }
        const existingComponent = this.componentsReferences.find(compRef => compRef.instance instanceof componentClass);

        if (componentType !== "User" && existingComponent) {
            return; // Prevent creating the same component if it's not a user profile - Allow new user profile creation even if a user profile is already open.
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

        const componentRef = this.componentsReferences.filter(
            x => x.instance.unique_key == key
        )[0];

        for (let x = 0; x < this.VCR.length; x++) {
            if ((this.VCR.get(x)) == componentRef.hostView) {
                this.VCR.remove(x);
                componentRef.destroy();
            }
        }

        this.componentsReferences = this.componentsReferences.filter(
            x => x.instance.unique_key !== key
        );
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
    getNotifications() {
        this.navigationComponent.getNotifications();
    }
}
