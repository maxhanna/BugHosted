// user.service.ts
import { Injectable } from '@angular/core'; 
import { User } from './datacontracts/user';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  async createUser(user: User) {
    try {
      const response = await fetch('/user/createuser', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', // Set the Content-Type header to indicate JSON data
        },
        body: JSON.stringify(user), // Convert the user object to JSON string
      });

      const responseData = await response.text(); // Extract the response as text
      return responseData; // Return the response text
    } catch (error) {
      console.error('Error creating user:', error);
      return null; // Return null in case of error
    }
  }

  async getUserCount() {
    try {
      const response = await fetch('/user');

      const responseData = await response.text(); // Extract the response as text
      return responseData; // Return the response text
    } catch (error) {
      console.error('Error creating user:', error);
      return null; // Return null in case of error
    }
  }
  async getUser(user: User) {
    try {
      const response = await fetch('/user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', // Set the Content-Type header to indicate JSON data
        },
        body: JSON.stringify(user), // Convert the user object to JSON string
      });

      return await response.json(); // Parse JSON response 
    } catch (error) {
      return null; // Return null in case of error
    }
  }
  async updateUser(user: User) {
    try {
      const response = await fetch('/user', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json', // Set the Content-Type header to indicate JSON data
        },
        body: JSON.stringify(user), // Convert the user object to JSON string
      });

      return await response.json(); // Parse JSON response 
    } catch (error) {
      return null; // Return null in case of error
    }
  }
  async deleteUser(user: User) {
    try {
      const response = await fetch('/user/deleteuser', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json', // Set the Content-Type header to indicate JSON data
        },
        body: JSON.stringify(user), // Convert the user object to JSON string
      });

      return await response.json();
    } catch (error) {
      return null; // Return null in case of error
    }
  }
  async getUserIp() {
    const apiKey = '1872fa51e6924c37a1d2f30cb13f1b83';

    const response = await fetch('https://ipgeolocation.abstractapi.com/v1/?api_key=' + apiKey, {
      method: 'GET'
    }); 
    return await response.json();
  }
}
