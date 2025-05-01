import { Injectable } from '@angular/core';
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
  async getTradeHistory(userId: number, encryptedUserId: string) {
    return this.post(`/trade/gettradehistory`, userId, 'json', encryptedUserId);
  } 
  async updateApiKey(userId: number, apiKey: string, privateKey: string, encryptedUserId: string) {
    return this.post(`/trade/updateapikey`, { UserId: userId, ApiKey: apiKey, PrivateKey: privateKey }, 'text', encryptedUserId);
  } 
  async hasApiKey(userId: number) {
    return this.post(`/trade/hasapikey`, userId, 'json');
  }
  async startBot(userId: number, encryptedUserId: string) {
    return this.post(`/trade/startbot`, userId, 'text', encryptedUserId);
  }
  async stopBot(userId: number, encryptedUserId: string) {
    return this.post(`/trade/stopbot`, userId, 'text', encryptedUserId);
  }
  async isTradebotStarted(userId: number, encryptedUserId: string) {
    return this.post(`/trade/istradebotstarted`, userId, 'text', encryptedUserId);
  }
  async upsertTradeConfiguration(config: any, encryptedUserId: string) {
    return this.post(`/trade/upserttradeconfiguration`, config, 'text', encryptedUserId);
  }
  async getTradeConfigurationLastUpdated(userId: number, encryptedUserId: string, from?: string, to?: string) {
    return this.post(`/trade/getconfigurationlastupdated`, { UserId: userId, FromCoin: from, ToCoin: to }, 'json', encryptedUserId);
  }
  async getTradeConfiguration(userId: number, encryptedUserId: string, from?: string, to?: string) {
    return this.post(`/trade/getconfiguration`, { UserId: userId, FromCoin: from, ToCoin: to }, 'json', encryptedUserId);
  }
  async getTradeLogs(userId: number, encryptedUserId: string) {
    return this.post(`/trade/gettradelogs`, userId, 'json', encryptedUserId);
  }
  async getTradeVolume(days?: number) {
    return this.post(`/trade/gettradevolume`, days, 'json');
  }
  async getTradeVolumeForGraph(from?: Date, hourRange?: number) {
    return this.post(`/trade/gettradevolumeforgraph`, { From: from, HourRange: hourRange }, 'json');
  }
  async getWeightedAveragePrices(userId: number, encryptedUserId: string) {
    return this.post(`/trade/getweightedaverageprices`, userId, 'json', encryptedUserId);
  }
  async enterPosition(userId: number, encryptedUserId: string) {
    return this.post(`/trade/enterposition`, userId, 'json', encryptedUserId);
  }
  async exitPosition(userId: number, encryptedUserId: string) {
    return this.post(`/trade/exitposition`, userId, 'json', encryptedUserId);
  }
  async getProfitData(userId: number, days = 100, encryptedUserId: string) {
    return this.post(`/trade/getprofitdata`, {UserId: userId, Days: days}, 'json', encryptedUserId);
  }
}
