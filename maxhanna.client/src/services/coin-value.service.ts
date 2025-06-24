import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { CoinValue } from './datacontracts/crypto/coin-value';
import { ExchangeRate } from './datacontracts/crypto/exchange-rate';
import { User } from './datacontracts/user/user';
import { MiningWalletResponse } from './datacontracts/crypto/mining-wallet-response';

@Injectable({
  providedIn: 'root'
})
export class CoinValueService {

  constructor(private http: HttpClient) { }

  // Get all coin values
  async getAllCoinValues(): Promise<CoinValue[] | undefined> {
    try {
      const response = await fetch(`/coinvalue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      return await response.json();
    } catch (error) {
      return;
    }
  }

  async getAllCoinValuesForGraph(from?: Date, hourRange?: number, coin?: string): Promise<CoinValue[] | undefined> {
    try {
      const response = await fetch(`/coinvalue/getallforgraph`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ Currency: coin, From: from, HourRange: hourRange }),
      });

      return await response.json();
    } catch (error) {
      return;
    }
  }

  async getWalletBalanceData(walletAddress: string) {
    try {
      const response = await fetch(`/coinvalue/getwalletbalancedata`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(walletAddress),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }

  async getAllExchangeRateValues() {
    try {
      const response = await fetch(`/currencyvalue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }


  async getAllExchangeRateValuesForGraph(from?: Date, hourRange?: number, currency?: string) {
    try {
      const response = await fetch(`/currencyvalue/getallforgraph`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ From: from, HourRange: hourRange, Currency: currency }),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }

  // Get the latest coin values
  async getLatestCoinValues() {
    try {
      const response = await fetch(`/coinvalue/getlatest`, {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
        },
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }

  async getUniqueCurrencyNames() {
    try {
      const response = await fetch(`/currencyvalue/getuniquenames`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }


  async updateUserCurrency(userId: number, currency: string) {
    try {
      const response = await fetch(`/currencyvalue/updateusercurrency`, {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, Currency: currency }),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }


  async getUserCurrency(userId: number) {
    try {
      const response = await fetch(`/currencyvalue/getusercurrency`, {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }

  async getGlobalMetrics() {
    try {
      const response = await fetch(`/coinvalue/globalmetrics`, {
        method: 'GET',

        headers: {
          'Content-Type': 'application/json',
        }, 
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  // Get the latest coin values by name
  async getLatestCoinValuesByName(name: string) {
    const params = new HttpParams().set('name', name);

    try {
      const response = await fetch(`/coinvalue/getlatestbyname/${name}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      return await response.json() as CoinValue;
    } catch (error) {
      return null;
    }
  }

  // Get the latest coin values by name
  async getLatestCurrencyValuesByName(name?: string) {
    if (!name) return;
    const params = new HttpParams().set('name', name);

    try {
      const response = await fetch(`/currencyvalue/getlatestbyname/${name}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      return await response.json() as ExchangeRate;
    } catch (error) {
      return null;
    }
  }
  async isBTCRising() {
    try {
      const response = await fetch(`/coinvalue/isbtcrising`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }

  async updateBTCWalletAddresses(userId: number, btcWalletAddresses: string[], encryptedUserId: string) {
    try {
      const response = await fetch('/coinvalue/btcwalletaddresses/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Encrypted-UserId': encryptedUserId
        },
        body: JSON.stringify({ UserId: userId, Wallets: btcWalletAddresses }),
      });
    } catch (error) {
      console.log(error);
    }
  }
  async fetchCryptoCalendarEvents(daysAhead = 7, limit = 50, coinSymbol = null) {
    try {
      const url = new URL('/coinvalue/cryptocalendarevents', window.location.origin);

      // Add query parameters
      url.searchParams.append('daysAhead', daysAhead.toString());
      url.searchParams.append('limit', limit.toString());
      if (coinSymbol) {
        url.searchParams.append('coinSymbol', coinSymbol);
      }

      const response = await fetch(url.toString(), {
        method: 'POST', // It uses POST even though it reads data
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) throw new Error('Network response was not ok');

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Error fetching crypto calendar events:', error);
      return null;
    }
  }


  async fetchCryptoFearAndGreed(daysAhead = 7, limit = 50) {
    try {
      const url = new URL('/coinvalue/feargreedindex', window.location.origin);

      // Add query parameters
      url.searchParams.append('daysAhead', daysAhead.toString());
      url.searchParams.append('limit', limit.toString()); 

      const response = await fetch(url.toString(), {
        method: 'POST', // It uses POST even though it reads data
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) throw new Error('Network response was not ok');

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Error fetching crypto fear and greed index:', error);
      return null;
    }
  }

  async getBTCWallet(userId: number, encryptedUserId: string) {
    try {
      const response = await fetch('/coinvalue/btcwallet/getbtcwalletdata', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Encrypted-UserId': encryptedUserId
        },
        body: JSON.stringify(userId),
      });
      if (response.status === 404) {
        return [];
      }
      return await response.json();
    } catch (error) {
      return [];
    }
  }
  async getWallet(userId: number, sessionToken: string): Promise<MiningWalletResponse[] | undefined> {
    try {
      const response = await fetch('/coinvalue/btcwallet/getwalletdata', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Encrypted-UserId': sessionToken
        },
        body: JSON.stringify(userId),
      });
      if (response.status === 404) {
        return [];
      }
      return await response.json();
    } catch (error) {
      return [];
    }
  }
  async deleteBTCWalletAddress(userId: number, address: string, encryptedUserId: string) {
    try {
      const response = await fetch('/coinvalue/btcwallet/deletebtcwalletaddress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Encrypted-UserId': encryptedUserId,
        },
        body: JSON.stringify({ userId, address }),
      });
      if (response.status === 404) {
        return [];
      }
      return await response.json();
    } catch (error) {
      return [];
    }
  }
}

export interface FearGreedPoint {
  timestampUtc: string;   // ISO string
  value: number;          // 0‑100
  classification?: string;
}