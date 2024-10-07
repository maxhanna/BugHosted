export class MetaEvent {
  id: number;
  heroId: number;
  timestamp: Date;
  event: string;
  map: string;
  data?: Record<string, string>;

  constructor(
    id: number,
    heroId: number,
    timestamp: Date,
    event: string,
    map: string,
    data?: Record<string, string>
  ) {
    this.id = id;
    this.heroId = heroId;
    this.timestamp = timestamp;
    this.event = event;
    this.map = map;
    this.data = data;
  }
   
}
