export interface UserEvent {
  id: number;
  userId: number;
  user?: any;
  eventType: string;
  eventText: string;
  referenceId?: number;
  referenceType?: string;
  createdAt: Date;
}
