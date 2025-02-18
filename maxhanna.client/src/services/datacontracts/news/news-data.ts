
export interface ArticlesResult {
  status: Statuses;
  error: Error;
  totalResults: number;
  articles: Article[];
}

export interface Article {
  source: Source;
  author: string;
  title: string;
  description: string;
  url: string;
  urlToImage: string;
  publishedAt: Date | null;
  content: string;
}

export interface Source {
  id: string;
  name: string;
}

export interface Error {
  code: string;
  message: string;
}

export enum Statuses {
  OK = 'ok',
  ERROR = 'error'
}
