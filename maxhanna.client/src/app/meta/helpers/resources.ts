 
export class Resources {
  toLoad: { [key: string]: string };
  images: { [key: string]: any } = {};

  constructor() {
    this.toLoad = {
      cave: "assets/metabots/cave.png",
      caveGround: "assets/metabots/cave-ground.png",
      exit: "assets/metabots/exit.png",
      gangster: "assets/metabots/gangsprite.png",
      hero: "assets/metabots/herospritesheet.png",
      heroRoom: "assets/metabots/redroom.jpg",
      shadow: "assets/metabots/shadow.png", 
      watch: "assets/metabots/watch.png",
    };
    this.images = {};
     
    Object.keys(this.toLoad).forEach((key: string) => {
      const img = new Image();
      img.src = this.toLoad[key];
      this.images[key] = {
        image: img,
        isLoaded: false
      };
      img.onload = () => {
        this.images[key].isLoaded = true;
      };
    });
  }
}
export const resources = new Resources();
