import { MetaData } from './social/story';

export interface CrawlerSearchRequest {
  Url: string;
  CurrentPage: number;
  PageSize: number;
  ExactMatch?: boolean;
  SkipScrape?: boolean;
}

export type NormalizedMetaData = MetaData & {
  url: string;
  title: string;
  description: string;
  author: string;
  keywords: string;
  imageUrl: string;
  httpStatus?: number | undefined;
  favouriteCount?: number | undefined;
};

export interface CrawlerSearchResponse {
  // server returns PascalCase but many components expect lowercase; include both
  Results: MetaData[];
  TotalResults: number;
  results: NormalizedMetaData[];
  totalResults: number;
}

export interface StorageStats {
  [key: string]: any;
}
