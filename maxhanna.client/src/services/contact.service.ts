import { Injectable } from '@angular/core'; 
import { Contact } from './datacontracts/user/contact';
import { User } from './datacontracts/user/user';

@Injectable({
  providedIn: 'root'
})
export class ContactService {

  async getContacts(userId: number) {
    try {
      const response = await fetch(`/contact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async createContact(userId: number, contact: Contact) {
    try {
      const response = await fetch(`/contact/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, contact }),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async addUserContact(userId: number, contactId: number) {
    try {
      const response = await fetch(`/contact/adduser`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, contactId }),
      });

      return await response.text();
    } catch (error) {
      return "Error adding user contact: " + error;
    }
  }
  async updateContact(userId: number, contact: Contact) {
    try {
      const response = await fetch(`/contact?id=${contact.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, contact }),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async deleteContact(userId: number, id: number) {
    try {
      const response = await fetch(`/contact/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
}
