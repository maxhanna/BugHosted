import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CoinValue } from './datacontracts/coin-value';
 
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
}
