import { Injectable } from '@angular/core';
import { MetaData } from './datacontracts/social/story';
import { CrawlerSearchRequest, CrawlerSearchResponse, LightweightSearchResult, NormalizedMetaData, StorageStats } from './datacontracts/crawler';
import { YoutubeVideo } from './datacontracts/youtube';
import { User } from './datacontracts/user/user';
import { Meta } from '@angular/platform-browser';

@Injectable({
  providedIn: 'root'
})
export class CrawlerService {

  async searchUrl(
    url: string,
    currentPage = 1,
    pageSize = 10,
    exactMatch?: boolean,
    skipScrape?: boolean,
    userId?: number
  ): Promise<CrawlerSearchResponse | { error: string; status?: number } | null> {
    const body: CrawlerSearchRequest = {
      Url: url,
      CurrentPage: currentPage,
      PageSize: pageSize,
      ExactMatch: exactMatch,
      SkipScrape: skipScrape,
      UserId: userId ?? undefined
    };    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60 * 1000); // 60s client timeout

    try {
      const response = await fetch(`/crawler/searchurl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });


      clearTimeout(timeout);

      if (!response.ok) {
        let msg = 'Search failed';
        let status = response.status;
        try {
          const err = await response.json();
          msg = err?.detail || err?.title || msg;
        } catch {
          try { msg = await response.text(); } catch { /* non-text body */ }
        }
        return { error: msg || 'Search failed', status };
      }

      const json = (await response.json()) as CrawlerSearchResponse;
      const rawResults: LightweightSearchResult[] = json.Results ?? json.results ?? [];
      json.Results = rawResults;
      json.results = rawResults;
      json.TotalResults = json.TotalResults ?? json.totalResults ?? 0;
      json.totalResults = json.totalResults ?? json.TotalResults;
      return json;
    } catch (error: any) {
      clearTimeout(timeout);
      if (error?.name === 'AbortError') {
        return { error: 'Request timed out. The index is very large — try a more specific query (it may also be worth retrying).' };
      }
      // Surface whatever the server/proxy actually said if we can.
      const status = error?.status as number | undefined;
      if (status === 408) return { error: 'Search timed out on the server.', status };
      if (status === 504) return { error: 'The database did not respond in time — try refining your search.', status };
      const proxyMsg = (error?.statusText as string) || '';
      return {
        error: proxyMsg
          ? `Network error: ${proxyMsg}. Try a narrower query.`
          : 'Network or server error while searching. The query may be too broad — try adding more words or refining it.',
        status: 0
      };
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

  async indexCount(signal?: AbortSignal): Promise<string | null> {
    try {
      const response = await fetch(`/crawler/indexcount`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal
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

  async wikipediaLookup(keyword: string): Promise<MetaData | null> {
    try {
      const response = await fetch(`/crawler/wikipedialookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword })
      });
      if (!response.ok) return null;
      return (await response.json()) as MetaData;
    } catch {
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


  async searchReddit(keyword: string): Promise<MetaData[] | null> {
    try {
      const response = await fetch(`/crawler/redditlookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword })
      });

      if (!response.ok) return null;
      const json = (await response.json()) as MetaData[];
      return json;
    } catch (error) {
      console.error('Reddit search failed', error);
      return null;
    }
  }

  async searchX(keyword: string): Promise<MetaData[] | null> {
    try {
      const response = await fetch(`/crawler/xlookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword })
      });

      if (!response.ok) return null;
      const json = (await response.json()) as MetaData[];
      return json;
    } catch (error) {
      console.error('X search failed', error);
      return null;
    }
  }

  async searchIMDb(keyword: string): Promise<MetaData[] | null> {
    try {
      const response = await fetch(`/crawler/imdblookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword })
      });

      if (!response.ok) return null;
      const json = (await response.json()) as MetaData[];
      return json;
    } catch (error) {
      console.error('IMDB search failed', error);
      return null;
    }
  }

  async searchDuckDuckGo(keyword: string): Promise<MetaData[] | null> {
    try {
      const response = await fetch(`/crawler/duckduckgolookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword })
      });

      if (!response.ok) return null;
      const json = (await response.json()) as MetaData[];
      return json;
    } catch (error) {
      console.error('DuckDuckGo search failed', error);
      return null;
    }
  }

  async searchYahoo(keyword: string): Promise<MetaData[] | null> {
    try {
      const response = await fetch(`/crawler/yahoolookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword })
      });

      if (!response.ok) return null;
      const json = (await response.json()) as MetaData[];
      return json;
    } catch (error) {
      console.error('Yahoo search failed', error);
      return null;
    }
  }

  async getFavouritedByUrl(url: string): Promise<User[] | null> {
    try {
      const response = await fetch(`/crawler/getfavouritedbyurl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(url)
      });
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      return null;
    }
  }

  async getMetadataByUrl(url: string, userId?: number): Promise<NormalizedMetaData | null> {
    try {
      const res = await fetch(`/crawler/getmetadatabyurl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Url: url, UserId: userId ?? undefined })
      });
      if (!res.ok) return null;
      const json = await res.json();
      return {
        id: json.id ?? undefined,
        url: json.url ?? '',
        title: json.title ?? '',
        description: json.description ?? '',
        author: json.author ?? '',
        keywords: json.keywords ?? '',
        imageUrl: json.imageUrl ?? '',
        httpStatus: json.httpStatus ?? undefined,
        favouriteCount: json.favouriteCount ?? undefined,
        isUserFavourite: json.isUserFavourite ?? false,
        averageRating: json.averageRating ?? undefined,
        ratingCount: json.ratingCount ?? undefined
      };
    } catch {
      return null;
    }
  }

  async getDetail(searchId: number, userId?: number): Promise<NormalizedMetaData | null> {
    try {
      const res = await fetch(`/crawler/getdetail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchId, userId })
      });
      if (!res.ok) return null;
      const json = await res.json();
      return {
        id: json.id ?? undefined,
        url: json.url ?? '',
        title: json.title ?? '',
        description: json.description ?? '',
        author: json.author ?? '',
        keywords: json.keywords ?? '',
        imageUrl: json.imageUrl ?? '',
        httpStatus: json.httpStatus ?? undefined,
        favouriteCount: json.favouriteCount ?? undefined,
        isUserFavourite: json.isUserFavourite ?? false,
        averageRating: json.averageRating ?? undefined,
        ratingCount: json.ratingCount ?? undefined
      };
    } catch {
      return null;
    }
  }
}
