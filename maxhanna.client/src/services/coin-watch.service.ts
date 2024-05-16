import { Injectable } from '@angular/core';
import { User } from './datacontracts/user';
import { Contact } from './datacontracts/contact';

@Injectable({
  providedIn: 'root'
})
export class CoinWatchService {

  async getCoinwatchResponse(user: User) { 
    try {
      const response = await fetch(`https://api.livecoinwatch.com/coins/list`, {
        method: 'POST',
        headers: {
          "content-type": "application/json",
          "x-api-key": "49965ff1-ebed-48b2-8ee3-796c390fcde1",
        },
        body: JSON.stringify(
          {
            currency: "CAD",
            sort: "rank",
            order: "ascending",
            offset: 0,
            limit: 8,
            meta: true,
          }
        ),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async createContact(user: User, contact: Contact) {
    try {
      const response = await fetch(`/contact/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user, contact }),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async updateContact(user: User, contact: Contact) {
    try {
      const response = await fetch(`/contact/${contact.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user, contact }),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async deleteContact(user: User, id: number) {
    try {
      const response = await fetch(`/contact/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
}
