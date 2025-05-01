export class ProfitData {
  periodType?: 'daily' | 'weekly' | 'monthly';
  periodStart?: Date | null;
  periodEnd?: Date | null;
  startUsdc?: number;
  startBtc?: number;
  startBtcPriceUsdc?: number;
  endUsdc?: number;
  endBtc?: number;
  endBtcPriceUsdc?: number;
  profitUsdc?: number;
  cumulativeProfitUsdc?: number;

  constructor(data?: Partial<ProfitData>) {
    if (data) {
      this.periodType = data.periodType;
      this.periodStart = data.periodStart ? new Date(data.periodStart) : null;
      this.periodEnd = data.periodEnd ? new Date(data.periodEnd) : null;
      this.startUsdc = data.startUsdc;
      this.startBtc = data.startBtc;
      this.startBtcPriceUsdc = data.startBtcPriceUsdc;
      this.endUsdc = data.endUsdc;
      this.endBtc = data.endBtc;
      this.endBtcPriceUsdc = data.endBtcPriceUsdc;
      this.profitUsdc = data.profitUsdc;
      this.cumulativeProfitUsdc = data.cumulativeProfitUsdc;
    }
  }
}