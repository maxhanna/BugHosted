// user.service.ts
import { Injectable } from '@angular/core';
import { MenuItem } from './datacontracts/user/menu-item';
import { User } from './datacontracts/user/user';
import { UserAbout } from './datacontracts/user/user-about';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  constructor(private http: HttpClient) { }

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
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async getUserById(userId: number, user?: User) {
    try {
      const response = await fetch(`/user/${userId}`, {
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
  async getAllUsers(user?: User, search?: string) {
    try {
      const response = await fetch('/user/getallusers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user, search }),
      });
      if (response.status === 404) {
        return [];
      }
      return await response.json();
    } catch (error) {
      return [];
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
  async updateUserAbout(user: User, about: UserAbout) {
    try {
      const response = await fetch('/user/updateabout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', // Set the Content-Type header to indicate JSON data
        },
        body: JSON.stringify({ user, about }), // Convert the user object to JSON string
      });

      return await response.text(); // Parse JSON response 
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
    try {
      const ipResponse: any = await this.http.get('https://api.ipify.org?format=json').toPromise();
      const ip = ipResponse.ip;

      const response = await fetch('/user/getipandlocation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', // Set the Content-Type header to indicate JSON data
        },
        body: JSON.stringify(ip), // Convert the user object to JSON string
      });

      return await response.json();
    } catch (error) {
      return null; // Return null in case of error
    }
  }

  isValidIpAddress(value?: string): boolean {
    if (!value) return false;
    const ipPattern = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipPattern.test(value);
  }
  async updateDisplayPicture(user: User, fileId: number) {
    try {
      const response = await fetch('/user/updatedisplaypicture', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', // Set the Content-Type header to indicate JSON data
        },
        body: JSON.stringify({ user, fileId }), // Convert the user object to JSON string
      });

      return await response.text(); // Parse JSON response 
    } catch (error) {
      return ''; // Return null in case of error
    }
  }


  async getUserSettings(user: User) {
    try {
      const response = await fetch(`/user/getusersettings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user.id),
      }); 
      return await response.json();
    } catch (error) {
      return error;
    }
  }
  async updateLastSeen(user: User) {
    try {
      const response = await fetch('/user/updatelastseen', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user.id),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async updateNSFW(user: User, isAllowed: boolean) {
    try {
      const response = await fetch('/user/updatensfw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ User: user, IsAllowed: isAllowed }),
      });


      return await response.text();
    } catch (error) {
      return "Error";
    }
  }
  async getUserMenu(user: User): Promise<Array<MenuItem>> {
    if (!user || user.id == 0) return [];
    try {
      const response = await fetch('/user/menu', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user menu.');
      }

      return await response.json();
    } catch (error) {
      return [];
    }
  }

  async deleteMenuItem(user: User, title: string) {
    try {
      const response = await fetch('/user/menu', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ User: user, Titles: [title] }),
      });
       

      return await response.text();
    } catch (error) {
      console.error('An error occurred:', error);
      return null;
    }
  }

  async addMenuItem(user: User, titles: string[]) {
    try {
      const response = await fetch('/user/menu/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ User: user, Titles: titles }),
      });

      return await response.text();
    } catch (error) {
      console.error('An error occurred:', error);
      return null;
    }
  }

  async getTrophies(user: User) {
    try {
      const response = await fetch('/user/trophies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user),
      });

      return await response.json();
    } catch (error) {
      console.error('An error occurred:', error);
      return null;
    }
  } 
  async updateBTCWalletAddresses(user: User, btcWalletAddresses: string[]) {
    try {
      const response = await fetch('/user/btcwalletaddresses/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ User: user, Wallets: btcWalletAddresses }),
      }); 
    } catch (error) {
      console.log(error);
    }
  }
  async getBTCWallet(user: User) {
    try {
      const response = await fetch('/user/btcwallet/getbtcwalletdata', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user),
      });
      if (response.status === 404) {
        return [];
      }
      return await response.json();
    } catch (error) {
      return [];
    }
  }

  async deleteBTCWalletAddress(user: User, address: string) {
    try {
      const response = await fetch('/user/btcwallet/deletebtcwalletaddress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user, address }),
      });
      if (response.status === 404) {
        return [];
      }
      return await response.json();
    } catch (error) {
      return [];
    }
  }

  async updateTheme(user: User, theme: JSON) {
    try {
      const response = await fetch('/user/updateusertheme/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: user.id, Theme: theme }),
      });
      return await response.text();
    } catch (error) {
      return 'error';
    }
  }

  async deleteUserTheme(user: User, themeId: number) {
    try {
      const response = await fetch('/user/deleteusertheme/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: user.id, ThemeId: themeId }),
      });
      return await response.json();
    } catch (error) {
      return 'error';
    }
  }

  async deleteUserSelectedTheme(user: User) {
    try {
      const response = await fetch('/user/deleteuserselectedtheme/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify( user.id ),
      });
      return await response.json();
    } catch (error) {
      return 'error';
    }
  }


  async getTheme(user: User) {
    try {
      const response = await fetch('/user/getusertheme/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user.id),
      });
      return await response.json();
    } catch (error) {
      return 'error';
    }
  }
  async getAllThemes(search?: string) {
    try {
      const response = await fetch('/user/getallthemes/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(search ?? ''),
      });
      return await response.json();
    } catch (error) {
      return 'error';
    }
  }
  async getAllUserThemes(user: User) {
    try {
      const response = await fetch('/user/getalluserthemes/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user.id),
      });
      return await response.json();
    } catch (error) {
      return 'error';
    }
  }
}
