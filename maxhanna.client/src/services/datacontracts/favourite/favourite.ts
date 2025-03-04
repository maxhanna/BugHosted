export class Favourite { 
  id: number;
  url: string;
  imageUrl?: string;
  createdBy?: number;
  creationDate: Date;
  modifiedBy?: number;
  modificationDate: Date;
  name?: string;

  constructor(data: Partial<Favourite> = {}) { 
    this.id = data.id ?? 0;
    this.url = data.url ?? "";
    this.name = data.name ?? "";
    this.imageUrl = data.imageUrl ?? undefined;
    this.createdBy = data.createdBy ?? undefined;
    this.creationDate = data.creationDate ? new Date(data.creationDate) : new Date();
    this.modifiedBy = data.modifiedBy ?? undefined;
    this.modificationDate = data.modificationDate ? new Date(data.modificationDate) : new Date();
  }
}
