import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http'; 
import { CoinValue } from './datacontracts/crypto/coin-value';
import { ExchangeRate } from './datacontracts/crypto/exchange-rate';
import { User } from './datacontracts/user/user';
 
@Injectable({
  providedIn: 'root'
})
export class CoinValueService {
  private baseUrl: string = '/coinvalue';

  constructor(private http: HttpClient) { }

  // Get all coin values
  async getAllCoinValues() {
    try {
      const response = await fetch(`${this.baseUrl}`, {
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

  // Get the latest coin values
  async getLatestCoinValues() {
    try {
      const response = await fetch(`${this.baseUrl}/getlatest`, {
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


  async updateUserCurrency(user: User, currency: string) {
    try {
      const response = await fetch(`/currencyvalue/updateusercurrency`, {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ User: user, Currency: currency }),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }


  async getUserCurrency(user: User) {
    try {
      const response = await fetch(`/currencyvalue/getusercurrency`, {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }

  // Get the latest coin values by name
  async getLatestCoinValuesByName(name: string) {
    const params = new HttpParams().set('name', name);

    try {
      const response = await fetch(`${this.baseUrl}/getlatestbyname/${name}`, {
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
  async getLatestCurrencyValuesByName(name: string) {
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
}
