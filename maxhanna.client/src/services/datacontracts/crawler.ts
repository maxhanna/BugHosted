import { MetaData } from './social/story';

export interface CrawlerSearchRequest {
  Url: string;
  CurrentPage: number;
  PageSize: number;
  ExactMatch?: boolean;
  SkipScrape?: boolean;
  UserId?: number;
}

export type NormalizedMetaData = MetaData & {
  id?: number;
  url: string;
  title: string;
  description: string;
  author: string;
  keywords: string;
  imageUrl: string;
  httpStatus?: number | undefined;
  favouriteCount?: number | undefined;
  isUserFavourite?: boolean;
  averageRating?: number | undefined;
  ratingCount?: number | undefined;
};

export interface CrawlerSearchResponse {
  // server now returns lightweight results (id, url, title)
  Results: LightweightSearchResult[];
  TotalResults: number;
  results: LightweightSearchResult[];
  totalResults: number;
}

export interface LightweightSearchResult {
  id?: number;
  url?: string;
  title?: string;
}

export interface StorageStats {
  [key: string]: any;
}
