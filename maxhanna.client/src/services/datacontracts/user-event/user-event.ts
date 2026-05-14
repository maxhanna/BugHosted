export interface UserEvent {
  id: number;
  userId: number;
  username?: string;
  eventType: string;
  eventText: string;
  referenceId?: number;
  referenceType?: string;
  createdAt: Date;
}
