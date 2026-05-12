
export interface ArticlesResult {
  status?: Statuses;
  error?: Error;
  totalResults: number;
  articles: Article[];
}

export interface Article {
  // source may be null when the upstream data doesn't provide it
  source: Source | null;
  author: string;
  title: string;
  description: string;
  url: string;
  urlToImage: string;
  publishedAt: Date | null;
  content: string;
  // optional flags set by the client when merging results
  negative?: boolean;
  crypto?: boolean;
}

export interface Source {
  id?: string | null;
  name?: string | null;
}

export interface Error {
  code: string;
  message: string;
}

export interface NewsPin {
  id: number;
  articleUrl: string;
  articleTitle: string;
  lat: number;
  lon: number;
  label: string;
  locationType: string;
  createdAt: Date | null;
  urlToImage: string | null;
  description: string | null;
}

export enum Statuses {
  OK = 'ok',
  ERROR = 'error'
}
