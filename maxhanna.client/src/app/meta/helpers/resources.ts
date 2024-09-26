 
export class Resources {
  toLoad: { [key: string]: string };
  images: { [key: string]: any } = {};

  constructor() {
    this.toLoad = {
      hero: "assets/metabots/herospritesheet.png",
      gangster: "assets/metabots/gangsprite.png",
      heroRoom: "assets/metabots/redroom.jpg",
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
