export class CalendarDate {
  constructor(cellNumber: number, date: Date | undefined, symbols: string[] | undefined) {
    this.cellNumber = cellNumber;
    this.symbols = symbols;
    this.date = date;
  }
  cellNumber: number = 0;
  symbols?: Array<string> = [];
  date?: Date = undefined;
}
