import { Injectable } from '@angular/core';
import { MenuItem } from './datacontracts/user/menu-item';
import { User } from './datacontracts/user/user';
import { UserAbout } from './datacontracts/user/user-about';
import { HttpClient } from '@angular/common/http';
import { UserSettings } from './datacontracts/user/user-settings';
import { Compactness, ShowPostsFrom } from './datacontracts/user/show-posts-from';
import { UserTheme } from './datacontracts/chat/chat-theme';

export interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
}

export interface ActiveGamer {
  userId: number;
  username?: string;
  game?: string;
  lastActivityUtc?: string;
  user?: User;
}

export interface UserWithLocation {
  user: User;
  city?: string;
  country?: string;
}

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private userPromises: { [key: number]: Promise<User | null> | undefined } = {};

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

  async login(username: string, password: string, pin?: string): Promise<User | { isLocked: boolean; lockedAt: string; reason: string; hasPendingAppeal: boolean } | { requirePin: true; pin: string } | undefined> {
    try {
      const body: any = { username, password };
      if (pin) { body.pin = pin; }
      const response = await fetch('/user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (response.status === 423) {
        return await response.json();
      }

      if (response.status === 428) {
        return await response.json();
      }

      return await response.json();
    } catch (error) {
      return undefined;
    }
  }

  async getUserById(userId: number, userCache?: User[]): Promise<User | null> {
    // If already loading, return the existing promise
    if (this.userPromises[userId]) {
      return this.userPromises[userId];
    }

    // Create a properly typed promise
    const promise = fetch(`/user/${userId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
      .then(r => r.json() as Promise<User | null>)
      .then(user => {
        if (user && userCache && !userCache.some(u => u.id === user.id)) {
          userCache.push(user);
        }
        return user;
      })
      .finally(() => {
        delete this.userPromises[userId];
      });

    this.userPromises[userId] = promise;

    return promise;
  }


  async getUserByUsername(username: string, userCache?: User[]): Promise<User | null> {
    if (userCache) {
      const cachedUser = userCache.find(u => u.username === username && u.lastSeen && ((new Date().getTime() - new Date(u.lastSeen).getTime()) < 15 * 60 * 1000)); // Cache valid for 15 minutes
      if (cachedUser) {
        return cachedUser;
      }
    }

    try {
      const response = await fetch(`/user/username/${username}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (userCache) {
        const fetchedUser = await response.json();
        if (fetchedUser) {
          userCache.push(fetchedUser);
          return fetchedUser;
        }
      }
      return await response.json();
    } catch (error) {
      return null;
    }
  }

  async getLoginStreak(userId: number) {
    try {
      const response = await fetch(`/user/getloginstreak/${userId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        return await response.json() as StreakInfo;
      }
      return { currentStreak: 0, longestStreak: 0 } as StreakInfo;
    } catch (error) {
      return { currentStreak: 0, longestStreak: 0 } as StreakInfo;
    }
  }

  async getAllUsers(userId?: number, search?: string, userCache?: User[]): Promise<User[] | null> {
    try {
      const response = await fetch('/user/getallusers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, Search: search }),
      });
      if (response.status === 404) {
        return [];
      }

      if (userCache) {
        const fetchedUsers = await response.json() as User[];
        fetchedUsers.forEach(u => {
          if (!userCache.some(cu => cu.id === u.id)) {
            userCache.push(u);
          }
        });
        return fetchedUsers;
      }

      return await response.json();
    } catch (error) {
      return [];
    }
  }
  async getNewUsersToday(): Promise<User[]> {
    try {
      const response = await fetch('/user/newuserstoday', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.status === 404) return [];
      if (!response.ok) return [];
      return await response.json() as User[];
    } catch (error) {
      console.error('Error fetching new users today:', error);
      return [];
    }
  }

  async getOnlineUsers(): Promise<User[]> {
    try {
      const response = await fetch('/user/onlineusers', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.status === 404) return [];
      if (!response.ok) return [];
      return await response.json() as User[];
    } catch (error) {
      console.error('Error fetching online users:', error);
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
        body: JSON.stringify(userId),
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

  async updateProfileBackgroundPicture(userId: number, fileId: number) {
    try {
      const response = await fetch('/user/updateprofilebackgroundpicture', {
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

  async updateEnderInactivityNotifications(userId: number, isAllowed: boolean) {
    try {
      const response = await fetch('/user/updateenderinactivitynotifications', {
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

  async updateCompactness(userId: number, compactness: Compactness) {
    try {
      const response = await fetch('/user/updatecompactness', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, Compactness: compactness }),
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
  async updateLastCharacterColor(userId: number, color: string) {
    try {
      const response = await fetch('/user/updatelastcharactercolor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, Color: color }),
      });

      return await response.text();
    } catch (error) {
      return null;
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
  async updateShowHiddenFiles(userId: number, isAllowed: boolean) {
    try {
      const response = await fetch('/user/updateshowhiddenfiles', {
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
  async updateMuteSounds(userId: number, isAllowed: boolean) {
    try {
      const response = await fetch('/user/updatemutesounds', {
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
  async updateComponentMute(userId: number, component: 'ender' | 'emulator' | 'bones', isMusic: boolean, isAllowed: boolean) {
    try {
      const payload = { UserId: userId, Component: component, IsMusic: isMusic, IsAllowed: isAllowed };
      const response = await fetch('/user/updatecomponentmute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return await response.text();
    } catch (error) {
      return 'Error';
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

  async updateTheme(userId: number, theme: UserTheme) {
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
  async getTheme(userId: number, signal?: AbortSignal): Promise<UserTheme | null> {
    try {
      const response = await fetch('/user/getusertheme/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId),
        signal
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      throw error;
    }
  }
  async getAllThemes(search?: string): Promise<UserTheme[] | null> {
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
      throw error;
    }
  }
  async getAllUserThemes(userId: number): Promise<UserTheme[] | null> {
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
      throw error;
    }
  }

  // Fetch a list of currently active gamers across games
  async getActiveGamers(): Promise<ActiveGamer[]> {
    try {
      const response = await fetch('/user/activegamers', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) return [];
      return await response.json() as ActiveGamer[];
    } catch (error) {
      console.error('Error fetching active gamers', error);
      return [];
    }
  }

  async saveSecurityQuestions(userId: number, questions: Array<{ question: string; answer: string }>, sessionToken: string) {
    try {
      const response = await fetch('/user/savesecurityquestions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Encrypted-UserId': sessionToken,
        },
        body: JSON.stringify({ UserId: userId, Questions: questions }),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }

  async verifySecurityQuestionsReset(userId: number, answers: Array<{ index: number; answer: string }>) {
    try {
      const response = await fetch('/user/verifysecurityquestionsreset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, Answers: answers }),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }

  async getSecurityQuestionsByUserId(userId: number) {
    try {
      const response = await fetch('/user/getsecurityquestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ UserId: userId })
      });
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      return null;
    }
  }

  async resetPassword(targetUserId: number, sessionToken: string) {
    try {
      const response = await fetch('/user/resetpassword', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Encrypted-UserId': sessionToken,
        },
        body: JSON.stringify(targetUserId),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }

  async checkUserHasEmail(username: string): Promise<boolean> {
    try {
      const response = await fetch('/user/checkuserhasemail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(username),
      });
      if (!response.ok) return false;
      return await response.json();
    } catch {
      return false;
    }
  }
  async resetPasswordWithToken(token: string): Promise<Response> {
    const response = await fetch('/user/resetpasswordbyemail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(token),
    });
    return response;
  }

  /**
   * Update one or more user settings generically. Only supported settings will be accepted by the backend.
   * @param userId The user ID
   * @param settings Array of settings to update: { settingName, value }
   */
  /**
   * Supported user setting names for updateUserSettings.
   */
  async updateUserSettings(
    userId: number,
    settings: Array<{ settingName: UserSettingName; value: boolean | string }>
  ) {
    try {
      const payload = {
        UserId: userId,
        Settings: settings.map(s => ({
          SettingName: s.settingName,
          BoolValue: typeof s.value === 'boolean' ? s.value : undefined,
          StringValue: typeof s.value === 'string' ? s.value : undefined
        }))
      };
      const response = await fetch('/user/updateusersettings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      return await response.text();
    } catch (error) {
      return 'Error';
    }
  }
  async sendPasswordResetEmail(username: string) {
    try {
      const response = await fetch('/user/sendpasswordresetemail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(username),
      });
      return await response.json();
    } catch {
      return null;
    }
  }

  async getUsersWithLocations(): Promise<UserWithLocation[]> {
    try {
      const response = await fetch('/user/getuserswithlocations', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.status === 404) return [];
      if (!response.ok) return [];
      return await response.json() as UserWithLocation[];
    } catch (error) {
      console.error('Error fetching users with locations:', error);
      return [];
    }
  }

  /** Fetch specific user settings by key names. Returns a mapping of key -> value (raw DB value) */
  async fetchUserSettings(userId: number, keys: string[]): Promise<Record<string, any> | null> {
    try {
      const payload = { UserId: userId, Keys: keys };
      const response = await fetch('/user/fetchusersettings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      return null;
    }
  }

  async appeal(userId: number, appealText: string): Promise<string | null> {
    try {
      const response = await fetch('/user/appeal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ UserId: userId, AppealText: appealText }),
      });
      if (!response.ok) return null;
      const data = await response.json();
      return data.message;
    } catch (error) {
      return null;
    }
  }

  async banUser(tgtUserId: number, userId: number, reason: string, sessionToken: string): Promise<boolean> {
    try {
      const response = await fetch('/user/ban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Encrypted-UserId': sessionToken },
        body: JSON.stringify({ UserId: userId, Reason: reason, TargetUserId: tgtUserId }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getAppeals(adminUserId: number, sessionToken: string): Promise<any[]> {
    try {
      const response = await fetch('/user/getappeals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Encrypted-UserId': sessionToken },
        body: JSON.stringify(adminUserId),
      });
      if (!response.ok) return [];
      return await response.json();
    } catch (error) {
      return [];
    }
  }

  async resolveAppeal(appealId: number, adminUserId: number, resolution: string, sessionToken: string): Promise<string | null> {
    try {
      const response = await fetch('/user/resolveappeal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Encrypted-UserId': sessionToken },
        body: JSON.stringify({ AppealId: appealId, AdminUserId: adminUserId, Resolution: resolution }),
      });
      if (!response.ok) return null;
      const data = await response.json();
      return data.message;
    } catch (error) {
      return null;
    }
  }

  async setRole(targetUserId: number, role: string, callerUserId: number, remove: boolean = false, sessionToken: string): Promise<boolean> {
    try {
      const response = await fetch('/user/setrole', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Encrypted-UserId': sessionToken },
        body: JSON.stringify({ TargetUserId: targetUserId, Role: role, CallerUserId: callerUserId, Remove: remove }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getModerators(callerUserId: number, sessionToken: string): Promise<User[]> {
    try {
      const response = await fetch('/user/getmoderators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Encrypted-UserId': sessionToken },
        body: JSON.stringify(callerUserId),
      });
      if (!response.ok) return [];
      return await response.json() as User[];
    } catch {
      return [];
    }
  }
}
export type UserSettingName =
  | "nsfw_enabled"
  | "ghost_read"
  | "compactness"
  | "show_posts_from"
  | "notifications_enabled"
  | "display_profile_location"
  | "last_character_name"
  | "last_character_color"
  | "show_hidden_files"
  | "show_favourites_only"
  | "mute_sounds"
  | "mute_music_ender"
  | "mute_sfx_ender"
  | "mute_music_emulator"
  | "mute_music_bones"
  | "mute_sfx_bones"
  | "allow_ender_inactivity_notifications"
  | "digcraft_fov_distance"
  | "page_size"
  | "calendar_notifications_enabled"
  | "digcraft_view_distance"
  | "weekly_digest_enabled";
