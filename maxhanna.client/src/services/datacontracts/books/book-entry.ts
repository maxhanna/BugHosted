export class BookEntry {
  bookId: number = 0;
  fileId: number = 0;
  ownerId: number = 0;
  ownerName: string = 'Unknown';
  title: string = '';
  author?: string;
  description?: string;
  coverFileId?: number;
  coverUrl?: string;
  fileType: string = '';
  fileSize: number = 0;
  isPublic: boolean = false;
  sharedWith: number[] = [];
  createdUtc?: string;
  updatedUtc?: string;
  uploadDateUtc?: string;
  accessCount: number = 0;
}
