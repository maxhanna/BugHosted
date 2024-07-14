import { Component, OnInit } from '@angular/core';
import { ChildComponent } from '../child.component';
import { ArrayService } from '../../services/array.service';
import { ArrayCharacter } from '../../services/datacontracts/array-character';
import { User } from '../../services/datacontracts/user';
import { GraveyardHero } from '../../services/datacontracts/graveyard-hero';
import { DirectoryResults } from '../../services/datacontracts/directory-results';
import { FileService } from '../../services/file.service';
import { FileEntry } from '../../services/datacontracts/file-entry';
import { ArrayCharacterInventory } from '../../services/datacontracts/array-character-inventory';

@Component({
  selector: 'app-array',
  templateUrl: './array.component.html',
  styleUrl: './array.component.css'
})
export class ArrayComponent extends ChildComponent implements OnInit {
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
  lastNexusPoint: bigint = 0n;
  itemsFound: bigint = 0n;

  hideRanks = false;
  isDead = false;
  isInventoryOpen = false;
  canMove = true;
  isUserComponentClosed = this.parentRef?.user ? true : false;

  clicksTillLadderRefresh = 0;

  constructor(private arrayService: ArrayService, private fileService: FileService) {
    super();
  }

  async ngOnInit() {
    if (this.parentRef && this.parentRef.user) {
      this.isUserComponentClosed = true;
    }
    await this.refreshHeroData();
  }

  private async refreshHeroData() { 
    const heroRes = await this.arrayService.getHero(this.parentRef?.user);
    if (heroRes) {
      this.hero = heroRes;
      this.itemsFound = this.hero.itemsFound!;
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
      const graveyardData = await this.arrayService.getGraveyardHero(this.parentRef?.user);
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
    const heroRes = await this.arrayService.move(direction, this.parentRef?.user);
    if (heroRes) {
      await this.updateHero(heroRes);
    }
    await this.refreshHeroLadder();
    this.refreshRadar();
    if (direction && direction != '' && this.isNexusPosition(this.hero?.position ?? 0n) && this.lastNexusPoint != this.hero.position) {
      this.loadRandomBackground();
      this.loadRandomNexusBackground();
      this.lastNexusPoint = this.hero.position!;
    }
  }

  async resurrect() {
    const res = await this.arrayService.resurrect(this.parentRef?.user);
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

      const myHeroRes = await this.arrayService.getHero(this.parentRef?.user);
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

    const heroPosition = BigInt(this.hero.position!);
    for (let i = 0; i < this.radar.length; i++) {
      if (i != 4) {
        this.radar[i] = [];
      }
    }
    this.allPlayerHeros.forEach(player => {
      if (player?.user?.id != (this.parentRef?.user?.id ?? 0)) {
        const playerPosition = BigInt(player.position!);

        if (playerPosition + 4n === heroPosition) {
          //console.log("player in position 4 left");
          this.radar[0].push(player.user ?? new User(0, "Anonymous"));
        }
        else if (playerPosition + 3n === heroPosition) {
          //console.log("player in position 3 left ");
          this.radar[1].push(player.user ?? new User(0, "Anonymous"));
        }
        else if (playerPosition + 2n === heroPosition) {
          //console.log("player in position 2 left");
          this.radar[2].push(player.user ?? new User(0, "Anonymous"));
        }
        else if (playerPosition + 1n === heroPosition) {
          //console.log("player in position 1 left");
          this.radar[3].push(player.user ?? new User(0, "Anonymous"));
        }
        else if (playerPosition - 1n === heroPosition) {
          //console.log("player in position 1 right");
          this.radar[5].push(player.user ?? new User(0, "Anonymous"));
        }
        else if (playerPosition - 2n === heroPosition) {
          //console.log("player in position 2 right");
          this.radar[6].push(player.user ?? new User(0, "Anonymous"));
        }
        else if (playerPosition - 3n === heroPosition) {
          //console.log("player in position 3 right");
          this.radar[7].push(player.user ?? new User(0, "Anonymous"));
        }
        else if (playerPosition - 4n === heroPosition) {
          //console.log("player in position 4 right");
          this.radar[8].push(player.user ?? new User(0, "Anonymous"));
        }
      }
    });
  }


  private async refreshHeroLadder() {
    if (!this.hideRanks) {
      const heroListRes = await this.arrayService.getAllHeros();
      var newHeroes: ArrayCharacter[] = [];
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
          if (x.level !== 0n) {
            this.allPlayerHeros.push(x);
          }
        });
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
    const res = await this.arrayService.getInventory(this.parentRef?.user);
    if (res) {
      console.log("got inventory");
      this.inventory = res as ArrayCharacterInventory;
      console.log(this.inventory);
    }
  }
  closeInventory() {
    this.isInventoryOpen = false;
  }

  isNexusPosition(value: bigint): boolean {
    if (!value) return true;
    const valueAsNumber = Number(value);
    const result = valueAsNumber % 50;
    return result === 0;
  }

  copyLink() {
    const link = `https://bughosted.com/Array`;
    navigator.clipboard.writeText(link);
  }

  async closeUserComponent() {
    console.log("close User component");
    await this.refreshHeroData();
    this.isUserComponentClosed = true;
    console.log("refreshed hero data");
  }
}
