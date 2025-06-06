import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { ArrayService } from '../../services/array.service'; 
import { GraveyardHero } from '../../services/datacontracts/array/graveyard-hero';
import { DirectoryResults } from '../../services/datacontracts/file/directory-results';
import { FileService } from '../../services/file.service'; 
import { ArrayCharacterInventory } from '../../services/datacontracts/array/array-character-inventory';
import { ArrayCharacter } from '../../services/datacontracts/array/array-character';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { User } from '../../services/datacontracts/user/user';

@Component({
    selector: 'app-array',
    templateUrl: './array.component.html',
    styleUrl: './array.component.css',
    standalone: false
})
export class ArrayComponent extends ChildComponent implements OnInit, OnDestroy {
  hero = new ArrayCharacter();
  inventory?: ArrayCharacterInventory;
  allPlayerHeros: ArrayCharacter[] = [];
  graveyardHero = new GraveyardHero();
  radar: User[][] = [[], [], [], [], [], [], [], [], []];
  backgroundPictureDirectory: DirectoryResults | undefined;
  nexusPictureDirectory: DirectoryResults | undefined;
  inventoryPictureDirectory: DirectoryResults | undefined;
  randomLocationPicture: FileEntry | undefined;
  randomNexusPicture: FileEntry | undefined;
  randomInventoryPicture: FileEntry | undefined;
  lastNexusPoint: number = 0;
  itemsFound: number = 0;

  isHelpPanelOpen = false;
  isRanksExpanded = false;
  hideRanks = false;
  isDead = false;
  isInventoryOpen = false;
  canMove = true;
  isUserComponentClosed = this.parentRef?.user ? true : false;
  private ladderRefreshInterval: any;

  @ViewChild('rankingDiv') rankingDiv!: ElementRef<HTMLInputElement>; 

  constructor(private arrayService: ArrayService, private fileService: FileService) {
    super();
  }

  async ngOnInit() {
    if (this.parentRef && this.parentRef.user) {
      this.isUserComponentClosed = true;
    }
    this.parentRef?.addResizeListener();
    await this.refreshHeroData();

    this.ladderRefreshInterval = setInterval(async () => {
      await this.refreshHeroLadder();
    }, 60000); 
  }

  ngOnDestroy() {
    this.parentRef?.removeResizeListener();
    if (this.ladderRefreshInterval) {
      clearInterval(this.ladderRefreshInterval);
    }
  }

  private async refreshHeroData() {
    const heroRes = await this.arrayService.getHero(this.parentRef?.user?.id);
    if (heroRes) {
      this.hero = heroRes;
      this.itemsFound = this.hero.itemsFound!;
      if (this.hero.monstersKilled) {
        this.isDead = false;
        this.canMove = true;
      }
    }
    await this.GetGraveyardHero();

    this.radar = [[], [], [], [],
    [this.parentRef?.user ?? new User(0, "Anonymous")],
    [], [], [], []];

    await this.refreshHeroLadder();
    this.refreshRadar();
    await this.getBackgroundPictures();
  }

  private async getBackgroundPictures() {
    const locationDirectoryRes = await this.fileService.getDirectory("Array/Locations", "all", "all", this.parentRef?.user, undefined, 1000, undefined, undefined, ["webp"]);
    if (locationDirectoryRes) {
      this.backgroundPictureDirectory = locationDirectoryRes;
      this.loadRandomBackground();
    }

    const nexusDirectoryRes = await this.fileService.getDirectory("Array/Nexus", "all", "all", this.parentRef?.user, undefined, 1000, undefined, undefined, ["webp"]);
    if (nexusDirectoryRes) {
      this.nexusPictureDirectory = nexusDirectoryRes;
      this.loadRandomNexusBackground();
    }

    const inventoryDirectoryRes = await this.fileService.getDirectory("Array/Inventory", "all", "all", this.parentRef?.user, undefined, 1000, undefined, undefined, ["webp"]);
    if (inventoryDirectoryRes) {
      this.inventoryPictureDirectory = inventoryDirectoryRes;
      this.loadRandomInventoryBackground();
    }



    //const bossDirectoryRes = await this.fileService.getDirectory("Array/Characters/Villains", "all", "all", this.parentRef?.user, undefined, 1000, undefined, undefined, ["webp"]);
    //if (bossDirectoryRes) {
    //  this.bossPictureDirectory = bossDirectoryRes;
    //  this.loadRandomInventoryBackground();
    //}
  }

  private async GetGraveyardHero() {
    try {
      const graveyardData = await this.arrayService.getGraveyardHero(this.parentRef?.user?.id);
      if (graveyardData && graveyardData.killer) {
        this.canMove = false;
        this.isDead = true;
        this.graveyardHero = graveyardData;
      }
    } catch (fetchError) {
      console.error("Error fetching graveyard data:", fetchError);
    }
  }

  async move(direction: string) {
    const heroRes = await this.arrayService.move(direction, this.parentRef?.user?.id);
    if (heroRes) {
      await this.updateHero(heroRes);
    }
    await this.refreshHeroLadder();
    this.refreshRadar();
    if (direction && direction != '' && this.isNexusPosition(this.hero?.position ?? 0) && this.lastNexusPoint != this.hero.position) {
      this.loadRandomBackground();
      this.loadRandomNexusBackground();
      this.lastNexusPoint = this.hero.position!;
    }
  }

  async resurrect() {
    const res = await this.arrayService.resurrect(this.parentRef?.user?.id);
    if (res) {
      this.hero = res;
      this.isDead = false;
      this.canMove = true;
    }
  }

  private async updateHero(heroRes: ArrayCharacter) {
    if (!heroRes) return;
    if (heroRes.user?.id != this.hero.user?.id) {
      this.refreshHeroLadder();

      const myHeroRes = await this.arrayService.getHero(this.parentRef?.user?.id);
      if (myHeroRes) {
        this.hero = myHeroRes;
        if (!this.hero.monstersKilled) {
          this.isDead = true;
          await this.GetGraveyardHero();
          return alert(`You have been slain by ${heroRes.user?.username}`);
        } else {
          return alert(`You have killed ${heroRes.user?.username}`);
        }

      }
    }
    this.hero = heroRes;
    if (this.itemsFound != this.hero.itemsFound) {
      alert("You have found an item!");
      this.itemsFound = this.hero.itemsFound!;
    }
  }


  refreshRadar() {

    const heroPosition = Number(this.hero.position!);
    for (let i = 0; i < this.radar.length; i++) {
      if (i != 4) {
        this.radar[i] = [];
      }
    }
    this.allPlayerHeros.forEach(player => {
      if (player?.user?.id != (this.parentRef?.user?.id ?? 0)) {
        const playerPosition = Number(player.position!);

        if (playerPosition + 4 === heroPosition) { 
          this.radar[0].push(player.user ?? new User(0, "Anonymous"));
        }
        else if (playerPosition + 3 === heroPosition) { 
          this.radar[1].push(player.user ?? new User(0, "Anonymous"));
        }
        else if (playerPosition + 2 === heroPosition) { 
          this.radar[2].push(player.user ?? new User(0, "Anonymous"));
        }
        else if (playerPosition + 1 === heroPosition) { 
          this.radar[3].push(player.user ?? new User(0, "Anonymous"));
        }
        else if (playerPosition - 1 === heroPosition) { 
          this.radar[5].push(player.user ?? new User(0, "Anonymous"));
        }
        else if (playerPosition - 2 === heroPosition) { 
          this.radar[6].push(player.user ?? new User(0, "Anonymous"));
        }
        else if (playerPosition - 3 === heroPosition) { 
          this.radar[7].push(player.user ?? new User(0, "Anonymous"));
        }
        else if (playerPosition - 4 === heroPosition) { 
          this.radar[8].push(player.user ?? new User(0, "Anonymous"));
        }
      }
    });
  }


  private async refreshHeroLadder() {
    if (!this.hideRanks) {
      const heroListRes = await this.arrayService.getAllHeros();
      let newHeroes: ArrayCharacter[] = [];
      if (heroListRes) {
        heroListRes.forEach(x => {
          const matchingHero = this.allPlayerHeros.find(y => (y.user?.id ?? 0) === (x.user?.id ?? 0));
          if (matchingHero) {
            matchingHero.level = x.level;
            matchingHero.monstersKilled = x.monstersKilled;
            matchingHero.playersKilled = x.playersKilled;
            matchingHero.position = x.position;
            matchingHero.characterClass = x.characterClass;
          } else {
            newHeroes.push(x);
          }
        });

        if (!this.allPlayerHeros) {
          this.allPlayerHeros = [];
        }
        newHeroes.forEach(x => {
          if (x.level !== 0) {
            this.allPlayerHeros.push(x);
          }
        });

        this.allPlayerHeros.sort((a, b) => Number(b.level) - Number(a.level));
      }
    }
  }

  async loadRandomBackground() {
    if (this.backgroundPictureDirectory?.data && this.backgroundPictureDirectory.data.length > 0) {
      const randomIndex = Math.floor(Math.random() * this.backgroundPictureDirectory.data.length);
      this.randomLocationPicture = undefined;
      setTimeout(() => { this.randomLocationPicture = this.backgroundPictureDirectory!.data![randomIndex]; }, 1);
    } else {
      console.log("No data or empty picture directory.");
    }
  }


  async loadRandomNexusBackground() {
    if (this.nexusPictureDirectory?.data && this.nexusPictureDirectory.data.length > 0) {
      const randomIndex = Math.floor(Math.random() * this.nexusPictureDirectory.data.length);
      this.randomNexusPicture = undefined;
      setTimeout(() => { this.randomNexusPicture = this.nexusPictureDirectory!.data![randomIndex]; }, 1);
    } else {
      console.log("No data or empty picture directory.");
    }
  }


  async loadRandomInventoryBackground() {
    if (this.inventoryPictureDirectory?.data && this.inventoryPictureDirectory.data.length > 0) {
      const randomIndex = Math.floor(Math.random() * this.inventoryPictureDirectory.data.length);
      this.randomInventoryPicture = undefined;
      setTimeout(() => { this.randomInventoryPicture = this.inventoryPictureDirectory!.data![randomIndex]; }, 1);
    } else {
      console.log("No data or empty picture directory.");
    }
  }

  async showInventory() {
    this.isInventoryOpen = true;
    const res = await this.arrayService.getInventory(this.parentRef?.user?.id);
    if (res) { 
      this.inventory = res as ArrayCharacterInventory; 
    }
  }
  closeInventory() {
    this.isInventoryOpen = false;
  }

  isNexusPosition(value: number): boolean {
    if (!value) return true;
    const valueAsNumber = Number(value);
    const result = valueAsNumber % 50;
    return result === 0;
  }

  copyLink() {
    const link = `https://bughosted.com/Array`;

    try {
      navigator.clipboard.writeText(link);
      this.parentRef?.showNotification("Link copied to clipboard!");
    } catch {
      this.parentRef?.showNotification("Error: Unable to share link!");
    }
  }

  async closeUserComponent(user: User) {
    if (!this.parentRef) return;
    this.parentRef.user = user;
    await this.refreshHeroData();
    this.isUserComponentClosed = true; 
  }

  expandRanks() {
    this.isRanksExpanded = !this.isRanksExpanded;
    if (!this.isRanksExpanded) {
      this.rankingDiv.nativeElement.classList.remove("expanded");
    } else {
      this.rankingDiv.nativeElement.classList.add("expanded");
    }
  } 
  openHelpPanel() {
    this.isHelpPanelOpen = true;
    this.parentRef?.showOverlay();
  }
  closeHelpPanel() {
    this.isHelpPanelOpen = false;
    this.parentRef?.closeOverlay();
  }
}
