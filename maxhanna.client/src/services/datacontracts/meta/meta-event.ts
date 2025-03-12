export class MetaEvent {
  id: number;
  heroId: number;
  timestamp: Date;
  eventType: string;
  map: string;
  data?: Record<string, string>;

  constructor(
    id: number,
    heroId: number,
    timestamp: Date,
    eventType: string,
    map: string,
    data?: Record<string, string>
  ) {
    this.id = id;
    this.heroId = heroId;
    this.timestamp = timestamp;
    this.eventType = eventType;
    this.map = map;
    this.data = data;
  }
   
}
