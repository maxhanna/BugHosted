import { Injectable } from '@angular/core';
import { MetaData } from './datacontracts/social/story';
import { CrawlerSearchRequest, CrawlerSearchResponse, NormalizedMetaData, StorageStats } from './datacontracts/crawler';
import { YoutubeVideo } from './datacontracts/youtube';

@Injectable({
  providedIn: 'root'
})
export class CrawlerService {
  async searchUrl(
    url: string,
    currentPage = 1,
    pageSize = 10,
    exactMatch?: boolean,
    skipScrape?: boolean
  ): Promise<CrawlerSearchResponse | null> {
    const body: CrawlerSearchRequest = {
      Url: url,
      CurrentPage: currentPage,
      PageSize: pageSize,
      ExactMatch: exactMatch,
      SkipScrape: skipScrape,
      UserId: (window as any)?.appUser?.id ?? undefined
    };

    try {
      const response = await fetch(`/crawler/searchurl`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) return null;
  const json = (await response.json()) as CrawlerSearchResponse;
      // normalize casing used across the app
      const rawResults: MetaData[] = json.Results ?? json.results ?? [];
    const normalizedResults: NormalizedMetaData[] = (rawResults ?? []).map(r => ({
        url: r.url ?? '',
        title: r.title ?? '',
        description: r.description ?? '',
        author: r.author ?? '',
        keywords: r.keywords ?? '',
        imageUrl: r.imageUrl ?? '',
  httpStatus: r.httpStatus ?? undefined,
  favouriteCount: r.favouriteCount ?? undefined,
  isUserFavourite: (r as any).isUserFavourite ?? false
      }));

      json.Results = rawResults;
      json.results = normalizedResults;
      json.TotalResults = json.TotalResults ?? json.totalResults ?? 0;
      json.totalResults = json.totalResults ?? json.TotalResults;
      return json;
    } catch (error) {
      return null;
    }
  }

  async indexLink(url: string): Promise<boolean> {
    try {
      const response = await fetch(`/crawler/indexlinks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(url),
      });

      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async indexCount(): Promise<string | null> {
    try {
      const response = await fetch(`/crawler/indexcount`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) return null;
      return await response.text();
    } catch (error) {
      return null;
    }
  }

  async storageStats(): Promise<StorageStats | null> {
    try {
      const response = await fetch(`/crawler/getstoragestats`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) return null;
      return (await response.json()) as StorageStats;
    } catch (error) {
      return null;
    }
  }

  async searchYoutube(keyword: string): Promise<YoutubeVideo[] | null> {
    try {
      const response = await fetch(`/crawler/searchyoutube?keyword=${encodeURIComponent(keyword)}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) return null;
      const json = (await response.json()) as YoutubeVideo[];
      return json;
    } catch (error) {
      console.error('YouTube search failed', error);
      return null;
    }
  }

}
