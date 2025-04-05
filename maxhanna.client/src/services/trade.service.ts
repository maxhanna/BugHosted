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
}
