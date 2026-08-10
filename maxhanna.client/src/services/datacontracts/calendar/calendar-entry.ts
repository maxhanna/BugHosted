export class CalendarEntry {
  id?: number;
  date?: Date;
  type?: string;
  note?: string;
  ownership?: string;
  /** Minutes before the event to notify (undefined = default 60; 0 = never notify). */
  reminder?: number;
}
