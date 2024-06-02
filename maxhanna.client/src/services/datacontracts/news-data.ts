export class NewsItem {
  url: string = "";
  authorsByline: string = "";
  articleId: string = "";
  clusterId: string = "";
  source: Source = new Source();
  imageUrl: string = "";
  country: string = "";
  language: string = "";
  pubDate: string = "";
  addDate: string = "";
  refreshDate: string = "";
  score: number = 0;
  title: string = "";
  description: string = "";
  content: string = "";
  medium: string = "";
  links: string[] = [];
  labels: Label[] = [];
  matchedAuthors: MatchedAuthor[] = [];
  claim: string = "";
  verdict: string = "";
  keywords: Keyword[] = [];
  topics: Topic[] = [];
  categories: any[] = [];
  entities: Entity[] = [];
  companies: Company[] = [];
  sentiment: Sentiment = new Sentiment();
  summary: string = "";
  translation: string = "";
  translatedTitle: string = "";
  translatedDescription: string = "";
  translatedSummary: string = "";
  locations: Location[] = [];
  reprint: boolean = false;
  reprintGroupId: string = "";
  places: Place[] = [];
  people: Person[] = [];
}
export class NewsResponse {
  status?: string = "";
  numResults: number = 0;
  articles?: NewsItem[];
} 

export class Source {
  domain: string | null = null;
  location: any = null;
}

export class Label {
  name: string = "";
}

export class MatchedAuthor {
  id: string = "";
  name: string = "";
}

export class Keyword {
  name: string = "";
  weight: number = 0;
}

export class Topic {
  // Define properties as needed
}

export class Entity {
  data: string = "";
  type: string = "";
  mentions: number = 0;
}

export class Company {
  id: string = "";
  name: string = "";
  domains: string[] = [];
  symbols: string[] = [];
}

export class Sentiment {
  positive: number = 0;
  negative: number = 0;
  neutral: number = 0;
}

export class Location {
  country: string = "";
  state: string = "";
  county: string = "";
  city: string = "";
  coordinates: Coordinates = new Coordinates();
}

export class Coordinates {
  lat: number = 0;
  lon: number = 0;
}

export class Place {
  osmId: string = "";
  town: string = "";
  county: string = "";
  state: string = "";
  country: string = "";
  countryCode: string = "";
  coordinates: Coordinates = new Coordinates();
}

export class Person {
  wikidataId: string = "";
  name: string = "";
}
