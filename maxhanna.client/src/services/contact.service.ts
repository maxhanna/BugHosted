import { Injectable } from '@angular/core'; 
import { Contact } from './datacontracts/user/contact';
import { User } from './datacontracts/user/user';

@Injectable({
  providedIn: 'root'
})
export class ContactService {

  async getContacts(user: User) {
    try {
      const response = await fetch(`/contact`, {
        method: 'POST',
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
  async addUserContact(user: User, contact: User) {
    try {
      const response = await fetch(`/contact/adduser`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user, contact }),
      });

      return await response.text();
    } catch (error) {
      return "Error adding user contact: " + error;
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
