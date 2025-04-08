import { Injectable } from '@angular/core';   

@Injectable({
  providedIn: 'root'
})
export class TradeService {
  async GetWalletBalance(currency: string) {
    try {
      const response = await fetch(`/trade/getwalletbalance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(currency),
      });

      if (!response.ok) {
        throw new Error(`Error fetching balance: ${response}`);
      }

      return await response.json();
    } catch (error) {
      console.error(error);
      return '';
    }
  }
  async UpdateApiKey(userId: number, apiKey: string, privateKey: string) {
    try {
      const response = await fetch(`/trade/updateapikey`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, ApiKey: apiKey, PrivateKey: privateKey }),
      });
      return await response.text();
    } catch (error) {
      console.error(error);
      return '';
    }
  }
  async HasApiKey(userId: number) {
    try {
      const response = await fetch(`/trade/hasapikey`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId),
      });
      return await response.json();
    } catch (error) {
      console.error(error);
      return '';
    }
  }
}
