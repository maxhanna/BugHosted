import { Injectable, signal } from '@angular/core';
import { ProfitData } from './datacontracts/trade/profit-data';

@Injectable({
  providedIn: 'root',
})
export class TradeService {
  private async post<T = any>(url: string, body: any, responseType: 'json' | 'text' = 'json', encryptedUserId?: string): Promise<T | string | ''> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Encrypted-UserId': encryptedUserId ?? ''
        },
        body: JSON.stringify(body),
      });
      const contentType = response.headers.get('Content-Type') || ''; 
      const data = contentType.includes('application/json')
        ? await response.json()
        : await response.text();
      if (!response.ok) {
        throw new Error(typeof data === 'string' ? data : data?.message ?? 'Unknown error');
      }

      return data;
    } catch (error: any) {
      console.error(error); 
      return error.message ?? 'Unexpected error';
    }
  } 
  async get<T = any>(url: string, encryptedUserId?: string): Promise<T | string | ''> {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Encrypted-UserId': encryptedUserId ?? '',
        },
      });
      const contentType = response.headers.get('Content-Type') || '';
      const data = contentType.includes('application/json')
        ? await response.json()
        : await response.text();
      if (!response.ok) {
        throw new Error(typeof data === 'string' ? data : data?.message ?? 'Unknown error');
      }

      return data;
    } catch (error: any) {
      console.error(error);
      return error.message ?? 'Unexpected error';
    }
  }
  async getTradeHistory(userId: number, encryptedUserId: string, coin?: string, strategy?: string, hours?: number, page?: number, pageSize?: number) {
    return this.post(`/trade/gettradehistory`, { UserId: userId, Coin: coin ?? "XBT", Strategy: strategy ?? "DCA", Hours: hours, Page: page, PageSize: pageSize }, 'json', encryptedUserId);
  }
  async getTradeById(userId: number, tradeId: number, encryptedUserId: string) {
    return this.post(`/trade/gettradebyid`, { UserId: userId, TradeId: tradeId }, 'json', encryptedUserId);
  }
  async getPageForTradeId(userId: number, tradeId: number, tradesPerPage: number, coin: string, strategy: string, encryptedUserId: string) {
    return this.post(`/trade/getpagefortradeid`, { UserId: userId, TradeId: tradeId, TradesPerPage: tradesPerPage, Coin: coin, Strategy: strategy }, 'json', encryptedUserId);
  }
  async getTradesForPage(userId: number, pageNumber: number, tradesPerPage: number, coin: string, strategy: string, encryptedUserId: string) {
    return this.post(`/trade/gettradesforpage`, { UserId: userId, PageNumber: pageNumber, TradesPerPage: tradesPerPage, Coin: coin, Strategy: strategy }, 'json', encryptedUserId);
  }  
  async getLatestTradeHistory(userId: number, encryptedUserId: string) {
    return this.post(`/trade/getlatesttradehistory`, userId, 'json', encryptedUserId);
  } 
  async updateApiKey(userId: number, apiKey: string, privateKey: string, encryptedUserId: string) {
    return this.post(`/trade/updateapikey`, { UserId: userId, ApiKey: apiKey, PrivateKey: privateKey }, 'text', encryptedUserId);
  } 
  async hasApiKey(userId: number) {
    return this.post(`/trade/hasapikey`, userId, 'json');
  }
  async startBot(userId: number, coin: string, strategy: string, encryptedUserId: string) {
    return this.post(`/trade/startbot`, { UserId: userId, Coin: coin, Strategy: strategy }, 'text', encryptedUserId);
  }
  async stopBot(userId: number, coin: string, strategy: string, encryptedUserId: string) {
    return this.post(`/trade/stopbot`, { UserId: userId, Coin: coin, Strategy: strategy }, 'text', encryptedUserId);
  }
  async isTradebotStarted(userId: number, coin: string, strategy: string, encryptedUserId: string) {
    return this.post(`/trade/istradebotstarted`, {UserId: userId, Coin: coin, Strategy: strategy }, 'text', encryptedUserId);
  }  
  async getAllTradebotStatuses(userId: number, encryptedUserId: string) {
    return this.post(`/trade/getalltradebotstatuses`, userId, 'json', encryptedUserId);
  }
  async upsertTradeConfiguration(config: any, encryptedUserId: string) {
    return this.post(`/trade/upserttradeconfiguration`, config, 'text', encryptedUserId);
  }
  async getTradeConfigurationLastUpdated(userId: number, encryptedUserId: string, from?: string, to?: string, strategy?: string) {
    return this.post(`/trade/getconfigurationlastupdated`, { UserId: userId, FromCoin: from, ToCoin: to, Strategy: strategy }, 'json', encryptedUserId);
  }
  async getTradeConfiguration(userId: number, encryptedUserId: string, from?: string, to?: string, strategy?: string) {
    return this.post(`/trade/getconfiguration`, { UserId: userId, FromCoin: from, ToCoin: to, Strategy: strategy }, 'json', encryptedUserId);
  }
  async getTradeLogs(userId: number, coin: string, strategy: string, encryptedUserId: string, page: number, pageSize: number) {
    return this.post(`/trade/gettradelogs`, { UserId: userId, Coin: coin, Strategy: strategy, Page: page, PageSize: pageSize }, 'json', encryptedUserId);
  }
  async getLastTradeLogs(userId: number, encryptedUserId: string) {
    return this.post(`/trade/getlasttradelogs`, userId, 'json', encryptedUserId);
  }
  async getTradeVolume(days?: number) {
    return this.post(`/trade/gettradevolume`, days, 'json');
  }
  async getTradeVolumeForGraph(from?: Date, hourRange?: number) {
    return this.post(`/trade/gettradevolumeforgraph`, { From: from, HourRange: hourRange }, 'json');
  } 
  async getTopActiveUsersByTradeCount(strategy?: string, from?: Date, to?: Date, limit: number = 50) {
    return this.post(`/trade/gettopactiveusersbytradecount`, { Strategy: strategy, From: from, To: to, Limit: limit }, 'json');
  }
  async enterPosition(userId: number, coin: string, strategy: string, encryptedUserId: string) {
    return this.post(`/trade/enterposition`, { UserId: userId, Coin: coin, Strategy: strategy }, 'json', encryptedUserId);
  }
  async exitPosition(userId: number, coin: string, strategy: string, encryptedUserId: string) {
    return this.post(`/trade/exitposition`, { UserId: userId, Coin: coin, Strategy: strategy }, 'json', encryptedUserId);
  }
  async getTradeIndicators(fromCoin: string, toCoin: string) {
    return this.post(`/trade/gettradeindicators`, { FromCoin: fromCoin, ToCoin: toCoin }, 'json');
  }
  async getMacdData(fromCoin: string, toCoin: string, days: number = 30, fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9) {
    return this.post(`/trade/getmacddata`, { FromCoin: fromCoin, ToCoin: toCoin, Days: days, FastPeriod: fastPeriod, SlowPeriod: slowPeriod, SignalPeriod: signalPeriod }, 'json');
  }
  async getProfitData(userId: number, days = 100, encryptedUserId: string) {
    return this.post(`/trade/getprofitdata`, { UserId: userId, Days: days }, 'json', encryptedUserId);
  }
  async getNumberOfTrades(userId: number) {
    return this.post(`/trade/getnumberoftrades`, userId, 'text');
  }
  
  convertTimePeriodToHours(period: string): number {
    const periodRegex = /^(\d+)\s*(m|min|mins|minute|minutes|h|hour|hours|d|day|days|w|week|weeks|m|month|months|y|year|years)$/;
    const match = period.trim().toLowerCase().match(periodRegex);

    if (match) {
      const value = parseInt(match[1], 10);
      const unit = match[2];

      switch (unit) {
        case 'min':
        case 'mins':
        case 'minute':
        case 'minutes':
          return value / 60; // Minutes to hours
        case 'h':
        case 'hour':
        case 'hours':
          return value; // Hours
        case 'd':
        case 'day':
        case 'days':
          return value * 24;
        case 'w':
        case 'week':
        case 'weeks':
          return value * 24 * 7;
        case 'm':
        case 'month':
        case 'months':
          return value * 24 * 30;
        case 'y':
        case 'year':
        case 'years':
          return value * 24 * 365;
        default:
          console.warn(`Unknown period unit: ${unit}`);
          return 1;
      }
    }
    if (period.toLowerCase().includes("max")) {
      return 10 * 24 * 365;
    }
    console.warn(`Invalid period format: ${period}`);
    return 1;
  }
  /**
   * Formats large numbers with appropriate units while preserving precision
   * @param value The number to format 
   * @returns Formatted string
   */
  formatLargeNumber(value: number): string {
    if (value == null || isNaN(value)) return 'N/A';

    if (value >= 1e12) {
      return '$' + (value / 1e12).toFixed(3) + 'T';
    }
    if (value >= 1e9) {
      return '$' + (value / 1e9).toFixed(2) + 'B';
    }
    if (value >= 1e6) {
      return '$' + (value / 1e6).toFixed(2) + 'M';  // Fixed: Divide by 1e6
    }
    if (value >= 1e3) {
      return '$' + (value / 1e3).toFixed(2) + 'K';  // Fixed: Divide by 1e3
    }
    return '$' + value.toFixed(2);
  }
}
