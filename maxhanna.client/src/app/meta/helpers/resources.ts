export class Resources {

  toLoad: { [key: string]: string };
  images: { [key: string]: any } = {};
  dir = "assets/metabots/";
  initialized = false;
  constructor() {
    this.toLoad = {
      advertisementpanelside: `${this.dir}advertisementpanelside.png`,
      apple: `${this.dir}apple.png`,
      armobot: `${this.dir}armobot.png`,
      anbumask: `${this.dir}anbumask.png`,
      blinds: `${this.dir}blinds.png`,
      bedroomFloor: `${this.dir}bedroom-floor.png`,
      biggerBush: `${this.dir}biggerbush.png`,
      botcasing: `${this.dir}botcasing.png`,
      botFrame: `${this.dir}botframe.png`,
      botFrame2: `${this.dir}botframe2.png`,
      botFrame3: `${this.dir}botframe3.png`,
      botFrame4: `${this.dir}botframe4.png`,
      botFrame5: `${this.dir}botframe5.png`,
      botFrame6: `${this.dir}botframe6.png`,
      botFrame7: `${this.dir}botframe7.png`,
      botFrame8: `${this.dir}botframe8.png`,
      botmask: `${this.dir}botmask.png`,
      brickRoad: `${this.dir}brickroad.png`,
      bugcatcher: `${this.dir}bugcatcher.png`,
      bunnyearsmask: `${this.dir}bunnyearsmask.png`,
      bunnymask: `${this.dir}bunnymask.png`,
      cave: `${this.dir}cave.png`,
      caveGround: `${this.dir}cave-ground.png`,
      carpet: `${this.dir}carpet.png`,
      chair: `${this.dir}chair.png`,
      chicken: `${this.dir}chicken.png`,
      concretestair: `${this.dir}concretestair.png`,
      cornercounter: `${this.dir}cornercounter.png`,
      counter: `${this.dir}counter.png`,
      counterNoLedge: `${this.dir}counternoledge.png`,
      deer: `${this.dir}deer.png`,
      exit: `${this.dir}exit.png`,
      exit2: `${this.dir}exit2.png`,
      fenceHorizontal: `${this.dir}fence-horizontal.png`,
      fenceVertical: `${this.dir}fence-vertical.png`,
      flowerbush: `${this.dir}flowerbush.png`,
      fontWhite: `${this.dir}sprite-font-white.png`,
      fontBlack: `${this.dir}sprite-font-black.png`,
      fountain: `${this.dir}fountain.png`,
      fridge: `${this.dir}fridge.png`,
      gangster: `${this.dir}gangsprite.png`,
      giantTree: `${this.dir}giantTree.png`,
      goldenPath: `${this.dir}golden-path.png`,
      graphiti1: `${this.dir}graphiti1.png`,
      graphiti2: `${this.dir}graphiti2.png`,
      graphitibunny: `${this.dir}graphitibunny.png`,
      graphitifrog: `${this.dir}graphitifrog.png`,
      graphiticornermonster: `${this.dir}graphiticornermonster.png`,
      graphitiskull: `${this.dir}graphitiskull.png`,
      graphitisun: `${this.dir}graphitisun.png`,
      graphitiyack: `${this.dir}graphitiyack.png`,
      grassBlade: `${this.dir}grassblade.png`,
      hero: `${this.dir}herospritesheet.png`,
      heroHome: `${this.dir}hero-home.png`,
      house: `${this.dir}house.png`,
      houseSide: `${this.dir}house-side.png`,
      knight: `${this.dir}knight-sheet-1.png`,
      leftArm: `${this.dir}LEFT_ARM.png`,
      menuBorder: `${this.dir}menuborder.png`,
      metalrailside: `${this.dir}metalrailside.png`,
      metalrail: `${this.dir}metalrail.png`,
      metalsewergrill: `${this.dir}metalsewergrill.png`,
      metalsewergrillside: `${this.dir}metalsewergrillside.png`,
      metrobilboard: `${this.dir}metrobilboard.png`,
      metrotile: `${this.dir}metrotile.png`,
      metrowall: `${this.dir}metrowall.png`,
      mom: `${this.dir}mom-sprite.png`,
      museum: `${this.dir}museum.png`,
      painting: `${this.dir}painting.png`,
      pointer: `${this.dir}pointer.png`,
      portraits: `${this.dir}portraits-sheet.png`,
      recycling: `${this.dir}recycling.png`,
      referee: `${this.dir}referee-spritesheet.png`,
      salesPerson: `${this.dir}salesperson.png`,
      sign: `${this.dir}sign.png`,
      sign2: `${this.dir}sign2.png`,
      sink: `${this.dir}sink.png`,
      shadow: `${this.dir}shadow.png`,
      shop: `${this.dir}shop.png`,
      shopFloor: `${this.dir}shopfloor.png`,
      shrub: `${this.dir}shrub.png`,
      shortgrass: `${this.dir}shortgrass.png`,
      spiderBot: `${this.dir}spiderbot.png`,
      stand: `${this.dir}stand.png`,
      stove: `${this.dir}stove.png`,
      stoneCircle: `${this.dir}stonecircle.png`,
      stoneroad: `${this.dir}stoneroad.png`,
      textBox: `${this.dir}text-box.png`,
      tree: `${this.dir}tree.png`,
      tv: `${this.dir}tv.png`,
      undergroundentrance: `${this.dir}undergroundentrance.png`,
      watch: `${this.dir}watch.png`,
      water: `${this.dir}Water.png`,
      wardrobe: `${this.dir}wardrobe.png`,
      white: `${this.dir}white.png`,
      xbox: `${this.dir}xbox.png`,
    };
    this.images = {};
    this.waitForCanvas(); 
  }

  waitForCanvas() {  
    const observer = new MutationObserver((mutations, obs) => {
      if (document.getElementById("gameCanvas")) {
        obs.disconnect();
        this.loadResources();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  loadResources() {
    if (this.initialized) return;
    this.initialized = true; 
    Object.keys(this.toLoad).forEach((key: string) => {
      if (!this.images[key]) {
        const img = new Image();
        img.src = this.toLoad[key];
        this.images[key] = {
          image: img,
          isLoaded: false,
        };
         
        img.onload = () => {
          this.images[key].isLoaded = true;
        };
      }
    });
  }
}
export const resources = new Resources();
export function hexToRgb(hex: string) {
  // Remove the leading '#' if present
  hex = hex.replace(/^#/, '');

  // Parse the hex string into RGB components
  let r = parseInt(hex.substring(0, 2), 16);
  let g = parseInt(hex.substring(2, 4), 16);
  let b = parseInt(hex.substring(4, 6), 16);

  return [r, g, b]; // Return the RGB values as an array
}
export interface Resource {
  image: HTMLImageElement;
  isLoaded: boolean; 
}
