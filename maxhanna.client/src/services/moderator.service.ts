import { Injectable } from '@angular/core';
import { ModeratorInfo, ModeratorLog, ModeratorRole, PublicChatInfo, RoleDefinition } from './datacontracts/moderator/moderator';

@Injectable({
  providedIn: 'root'
})
export class ModeratorService {
  constructor() { }

  async getRoleCatalog(callerUserId: number, sessionToken: string): Promise<RoleDefinition[]> {
    try {
      const response = await fetch('/moderator/getrolecatalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Encrypted-UserId': sessionToken },
        body: JSON.stringify(callerUserId),
      });
      if (!response.ok) return [];
      return await response.json() as RoleDefinition[];
    } catch (error) {
      console.error('Error fetching role catalog:', error);
      return [];
    }
  }

  async getModeratorsWithRoles(callerUserId: number, sessionToken: string): Promise<ModeratorInfo[]> {
    try {
      const response = await fetch('/moderator/getmoderators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Encrypted-UserId': sessionToken },
        body: JSON.stringify(callerUserId),
      });
      if (!response.ok) return [];
      return await response.json() as ModeratorInfo[];
    } catch (error) {
      console.error('Error fetching moderators:', error);
      return [];
    }
  }

  async setRole(targetUserId: number, role: string, callerUserId: number, remove: boolean, sessionToken: string, targetType?: string, targetId?: number): Promise<boolean> {
    try {
      const response = await fetch('/moderator/setrole', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Encrypted-UserId': sessionToken },
        body: JSON.stringify({
          TargetUserId: targetUserId,
          Role: role,
          TargetType: targetType,
          TargetId: targetId,
          CallerUserId: callerUserId,
          Remove: remove,
        }),
      });
      return response.ok;
    } catch (error) {
      console.error('Error setting role:', error);
      return false;
    }
  }

  async getMyRoles(userId: number, sessionToken: string): Promise<ModeratorRole[]> {
    try {
      const response = await fetch('/moderator/getmyroles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Encrypted-UserId': sessionToken },
        body: JSON.stringify(userId),
      });
      if (!response.ok) return [];
      return await response.json() as ModeratorRole[];
    } catch (error) {
      console.error('Error fetching my roles:', error);
      return [];
    }
  }

  async getModeratorLogs(callerUserId: number, sessionToken: string, limit: number = 200): Promise<ModeratorLog[]> {
    try {
      const response = await fetch('/moderator/getmoderatorlogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Encrypted-UserId': sessionToken },
        body: JSON.stringify({ CallerUserId: callerUserId, Limit: limit }),
      });
      if (!response.ok) return [];
      return await response.json() as ModeratorLog[];
    } catch (error) {
      console.error('Error fetching moderator logs:', error);
      return [];
    }
  }
}
