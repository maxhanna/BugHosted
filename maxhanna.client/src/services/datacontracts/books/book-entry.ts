export class BookEntry {
  bookId: number = 0;
  fileId: number = 0;
  /** Owner of the library entry (the user who saved/registered the book). */
  ownerId: number = 0;
  /** Owner of the underlying uploaded file — differs from ownerId when a
   *  user saved someone else's book into their library. */
  fileOwnerId: number = 0;
  /** Displayed uploader: the file's original owner when it's a saved copy. */
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
