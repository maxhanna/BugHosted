export class MenuItem {
  ownership: number;
  title: string;
  icon?: string
  content?: string

  constructor(ownership: number, title: string) {
    this.ownership = ownership;
    this.title = title; 
  }
}
