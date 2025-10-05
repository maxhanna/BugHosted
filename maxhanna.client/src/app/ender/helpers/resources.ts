export class Resources {

  toLoad: { [key: string]: string };
  images: { [key: string]: any } = {};
  dir = "assets/ender/";
  initialized = false;
  constructor() {
    this.toLoad = {
      advertisementpanelside: `${this.dir}advertisementpanelside.png`,
      aimask: `${this.dir}Aimask.png`,
      apple: `${this.dir}apple.png`,
      armobot: `${this.dir}armobot.png`,
      anbumask: `${this.dir}anbumask.png`,
      blinds: `${this.dir}blinds.png`,
      barrels: `${this.dir}barrels.png`,
      bedroomFloor: `${this.dir}bedroom-floor.png`,
      biggerBush: `${this.dir}biggerbush.png`,
      bikewall: `${this.dir}bikewall.png`,
      boards: `${this.dir}boards.png`,
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
      boxes: `${this.dir}boxes.png`,
      brickRoad: `${this.dir}brickroad.png`,
      bucket: `${this.dir}bucket.png`,
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
      criticalhit: `${this.dir}criticalhit.png`,
      deer: `${this.dir}deer.png`,
      enderFloor: `${this.dir}enderfloor.png`,
      exit: `${this.dir}exit.png`,
      exit2: `${this.dir}exit2.png`,
      fontWhite: `${this.dir}sprite-font-white.png`,
      fontBlack: `${this.dir}sprite-font-black.png`,
      groundFire: `${this.dir}groundFire.png`,
      hero: `${this.dir}herospritesheet.png`,
      heroHome: `${this.dir}hero-home.png`,
      house: `${this.dir}house.png`,
      houseSide: `${this.dir}house-side.png`,
      leftArm: `${this.dir}LEFT_ARM.png`,
      lockers: `${this.dir}lockers.png`,
      menuBorder: `${this.dir}menuborder.png`,
      metagrindershopsign: `${this.dir}metagrindershopsign.png`, 
      metalfence: `${this.dir}metalfence.png`,
      painting: `${this.dir}painting.png`,
      pointer: `${this.dir}pointer.png`,
      portraits: `${this.dir}portraits-sheet.png`,
      recycling: `${this.dir}recycling.png`,
      referee: `${this.dir}referee-spritesheet.png`,
      rocks: `${this.dir}rocks.png`,
      salesPerson: `${this.dir}salesperson.png`,
      scandroid: `${this.dir}scandroid.png`,
      scorpinox: `${this.dir}scorpinox.png`,
      sign: `${this.dir}sign.png`,
      sign2: `${this.dir}sign2.png`,
      sink: `${this.dir}sink.png`,
      skill_sting: `${this.dir}skill_sting.png`,
      skill_flare: `${this.dir}skill_flare.png`,
      skill_rail: `${this.dir}skill_rail.png`,
      skill_chain: `${this.dir}skill_chain.png`,
      shadow: `${this.dir}shadow.png`,
      ship: `${this.dir}ship.png`,
      shop: `${this.dir}shop.png`,
      shopFloor: `${this.dir}shopfloor.png`,
      shrub: `${this.dir}shrub.png`,
      shortgrass: `${this.dir}shortgrass.png`,
      spiderBot: `${this.dir}spiderbot.png`,
      stoneCircle: `${this.dir}stonecircle.png`,
      target: `${this.dir}target.png`,
      textBox: `${this.dir}text-box.png`,
      tree: `${this.dir}tree.png`,
      tv: `${this.dir}tv.png`,
      undergroundentrance: `${this.dir}undergroundentrance.png`,
      warpbase: `${this.dir}warpBase.png`,
      warpspiral: `${this.dir}warpSpiral.png`,
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
