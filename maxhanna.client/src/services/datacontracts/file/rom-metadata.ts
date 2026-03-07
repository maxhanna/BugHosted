
export class RomMetadata {
  igdbGameId?: number;
  igdbName?: string;
  summary?: string;

  // unix seconds
  firstReleaseDateUnix?: number;

  totalRating?: number;
  totalRatingCount?: number;

  coverUrl?: string;

  // raw json strings from server (we'll parse them in FileSearch)
  screenshotsJson?: string | string[];
  artworksJson?: string | string[];
  videosJson?: string | string[];
}
