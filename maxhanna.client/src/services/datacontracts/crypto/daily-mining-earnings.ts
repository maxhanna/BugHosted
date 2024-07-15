export class DailyMiningEarnings {
  date: Date;
  algos: number[];
  totalEarnings: number;

  constructor(date: Date, algos: number[], totalEarnings: number) {
    this.date = date;
    this.algos = algos;
    this.totalEarnings = totalEarnings;
  }
}
