
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
  // parsed convenience arrays (populated client-side)
  platformsJson?: string | string[];
  genresJson?: string | string[];
  platforms?: string[];
  genres?: string[];
  // how many users requested a reset for this enrichment
  resetVotes?: number;
  // user-selected system/core override (from rom_system_overrides table)
  actualSystem?: string;
}
