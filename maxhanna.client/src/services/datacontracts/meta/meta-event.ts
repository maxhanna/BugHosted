export class MetaEvent {
  id: number;
  heroId: number;
  timestamp: Date;
  eventType: string;
  level: number;
  data?: Record<string, string>;

  constructor(
    id: number,
    heroId: number,
    timestamp: Date,
    eventType: string,
    level: number,
    data?: Record<string, string>
  ) {
    this.id = id;
    this.heroId = heroId;
    this.timestamp = timestamp;
    this.eventType = eventType;
    this.level = level;
    this.data = data;
  }
   
}
