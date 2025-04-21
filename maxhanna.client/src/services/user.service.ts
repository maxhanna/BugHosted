// user.service.ts
import { Injectable } from '@angular/core';
import { MenuItem } from './datacontracts/user/menu-item';
import { User } from './datacontracts/user/user';
import { UserAbout } from './datacontracts/user/user-about';
import { HttpClient } from '@angular/common/http';
import { UserSettings } from './datacontracts/user/user-settings';

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
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user),
      });

      const responseData = await response.text();
      return responseData;
    } catch (error) {
      console.error('Error creating user:', error);
      return null;
    }
  }

  async getUserCount() {
    try {
      const response = await fetch('/user');

      const responseData = await response.text();
      return responseData;
    } catch (error) {
      console.error('Error creating user:', error);
      return null;
    }
  }
  async login(username: string, password: string): Promise<User | undefined> {
    try {
      const response = await fetch('/user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      return await response.json();
    } catch (error) {
      return undefined;
    }
  }
  async getUserById(userId: number) {
    try {
      const response = await fetch(`/user/${userId}`, {
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
  async getAllUsers(search?: string) {
    try {
      const response = await fetch('/user/getallusers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(search),
      });
      if (response.status === 404) {
        return [];
      }
      return await response.json();
    } catch (error) {
      return [];
    }
  }
  async updateUser(user: User, sessionToken: string) {
    try {
      const response = await fetch('/user', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Encrypted-UserId': sessionToken,
        },
        body: JSON.stringify(user),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async blockUser(userId: number, blockedUserId: number) {
    try {
      const response = await fetch('/user/block', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, BlockedUserId: blockedUserId }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }
  async unblockUser(userId: number, blockedUserId: number) {
    try {
      const response = await fetch('/user/unblock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, BlockedUserId: blockedUserId }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }
  async isUserBlocked(userId: number, blockedUserId: number) {
    try {
      const response = await fetch('/user/isUserBlocked', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, BlockedUserId: blockedUserId }),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async getBlockedUsers(userId: number): Promise<User[] | undefined> {
    try {
      const response = await fetch('/user/getblockedusers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify( userId ),
      });

      return await response.json();
    } catch (error) {
      return undefined;
    }
  }
  async updateUserAbout(userId: number, about: UserAbout) {
    try {
      const response = await fetch('/user/updateabout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, about }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }
  async deleteUser(userId: number, sessionToken: string) {
    try {
      const response = await fetch('/user/deleteuser', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Encrypted-UserId': sessionToken,
        },
        body: JSON.stringify(userId),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }

  async getUserIp() {
    try {
      const ipResponse: any = await this.http.get('https://api.ipify.org?format=json').toPromise();
      const ip = ipResponse.ip;

      const response = await fetch('/user/getipandlocation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(ip),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async getUserIpFromBackend(userId: number) {
    try {
      const response = await fetch('/user/getipaddress', {
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

  isValidIpAddress(value?: string): boolean {
    if (!value) return false;
    const ipPattern = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipPattern.test(value);
  }
  async updateDisplayPicture(userId: number, fileId: number) {
    try {
      const response = await fetch('/user/updatedisplaypicture', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, fileId }),
      });

      return await response.text();
    } catch (error) {
      return '';
    }
  }


  async getUserSettings(userId: number): Promise<UserSettings | undefined> {
    try {
      const response = await fetch(`/user/getusersettings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId),
      });
      return await response.json();
    } catch (error) {
      return undefined;
    }
  }
  async updateLastSeen(userId: number) {
    try {
      const response = await fetch('/user/updatelastseen', {
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
  async updateNSFW(userId: number, isAllowed: boolean) {
    try {
      const response = await fetch('/user/updatensfw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, IsAllowed: isAllowed }),
      });


      return await response.text();
    } catch (error) {
      return "Error";
    }
  }
  async updateNotificationsEnabled(userId: number, isAllowed: boolean) {
    try {
      const response = await fetch('/user/updatenotificationsenabled', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, IsAllowed: isAllowed }),
      });


      return await response.text();
    } catch (error) {
      return "Error";
    }
  }
  async updateGhostRead(userId: number, isAllowed: boolean) {
    try {
      const response = await fetch('/user/updateghostread', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, IsAllowed: isAllowed }),
      });


      return await response.text();
    } catch (error) {
      return "Error";
    }
  }
  async getUserMenu(userId?: number): Promise<Array<MenuItem>> {
    if (!userId) return [];
    try {
      const response = await fetch('/user/menu', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user menu.');
      }

      return await response.json();
    } catch (error) {
      return [];
    }
  }

  async deleteMenuItem(userId: number, title: string) {
    try {
      const response = await fetch('/user/menu', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, Titles: [title] }),
      });


      return await response.text();
    } catch (error) {
      console.error('An error occurred:', error);
      return null;
    }
  }

  async addMenuItem(userId: number, titles: string[]) {
    try {
      const response = await fetch('/user/menu/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, Titles: titles }),
      });

      return await response.text();
    } catch (error) {
      console.error('An error occurred:', error);
      return null;
    }
  }

  async getTrophies(userId: number) {
    try {
      const response = await fetch('/user/trophies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId),
      });

      return await response.json();
    } catch (error) {
      console.error('An error occurred:', error);
      return null;
    }
  }

  async getIPAddress(userId: number) {
    try {
      const response = await fetch(`/user/getipaddress`, {
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

  async updateIPAddress(userId: number, location: string, city?: string, country?: string) {
    try {
      const response = await fetch(`/user/updateipaddress`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, location, city, country }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }

  async updateTheme(userId: number, theme: JSON) {
    try {
      const response = await fetch('/user/updateusertheme/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, Theme: theme }),
      });
      return await response.text();
    } catch (error) {
      return 'error';
    }
  }

  async deleteUserTheme(userId: number, themeId: number) {
    try {
      const response = await fetch('/user/deleteusertheme/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, ThemeId: themeId }),
      });
      return await response.json();
    } catch (error) {
      return 'error';
    }
  }

  async deleteUserSelectedTheme(userId: number) {
    try {
      const response = await fetch('/user/deleteuserselectedtheme/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId),
      });
      return await response.json();
    } catch (error) {
      return 'error';
    }
  }
  async getTheme(userId: number) {
    try {
      const response = await fetch('/user/getusertheme/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId),
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
  async getAllUserThemes(userId: number) {
    try {
      const response = await fetch('/user/getalluserthemes/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId),
      });
      return await response.json();
    } catch (error) {
      return 'error';
    }
  }
}
