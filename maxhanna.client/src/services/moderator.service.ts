import { Injectable } from '@angular/core';
import { ChatBan, ChatBanAppeal, ModeratorInfo, ModeratorLog, ModeratorRequest, ModeratorRole, PublicChatInfo, RoleDefinition } from './datacontracts/moderator/moderator';

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

  // ─── Chat-scoped bans & appeals (low-level chat room moderation) ───

  async banChatUser(chatId: number, targetUserId: number, callerUserId: number, reason: string, sessionToken: string): Promise<boolean> {
    try {
      const response = await fetch('/moderator/banchatuser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Encrypted-UserId': sessionToken },
        body: JSON.stringify({ ChatId: chatId, TargetUserId: targetUserId, CallerUserId: callerUserId, Reason: reason }),
      });
      return response.ok;
    } catch (error) {
      console.error('Error banning chat user:', error);
      return false;
    }
  }

  async unbanChatUser(chatId: number, targetUserId: number, callerUserId: number, sessionToken: string): Promise<boolean> {
    try {
      const response = await fetch('/moderator/unbanchatuser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Encrypted-UserId': sessionToken },
        body: JSON.stringify({ ChatId: chatId, TargetUserId: targetUserId, CallerUserId: callerUserId }),
      });
      return response.ok;
    } catch (error) {
      console.error('Error unbanning chat user:', error);
      return false;
    }
  }

  async getChatBans(chatId: number, callerUserId: number, sessionToken: string): Promise<ChatBan[]> {
    try {
      const response = await fetch('/moderator/getchatbans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Encrypted-UserId': sessionToken },
        body: JSON.stringify({ ChatId: chatId, CallerUserId: callerUserId }),
      });
      if (!response.ok) return [];
      return await response.json() as ChatBan[];
    } catch (error) {
      console.error('Error fetching chat bans:', error);
      return [];
    }
  }

  async appealChatBan(chatId: number, userId: number, appealText: string, sessionToken: string): Promise<{ ok: boolean; message: string }> {
    try {
      const response = await fetch('/moderator/appealchatban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Encrypted-UserId': sessionToken },
        body: JSON.stringify({ ChatId: chatId, UserId: userId, AppealText: appealText }),
      });
      // Read the body as text first — the server returns plain strings on error
      // (BadRequest), so trying JSON.parse directly would consume the body and
      // make the real error message unrecoverable.
      const body = await response.text();
      let data: any = null;
      try { data = body ? JSON.parse(body) : null; } catch { data = null; }
      if (response.ok) return { ok: true, message: (data && data.message) || 'Appeal submitted.' };
      return { ok: false, message: (data && data.message) || body || 'Failed to submit appeal.' };
    } catch (error) {
      console.error('Error appealing chat ban:', error);
      return { ok: false, message: 'Failed to submit appeal. Please try again.' };
    }
  }

  async getChatBanAppeals(chatId: number, callerUserId: number, sessionToken: string): Promise<ChatBanAppeal[]> {
    try {
      const response = await fetch('/moderator/getchatbanappeals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Encrypted-UserId': sessionToken },
        body: JSON.stringify({ ChatId: chatId, CallerUserId: callerUserId }),
      });
      if (!response.ok) return [];
      return await response.json() as ChatBanAppeal[];
    } catch (error) {
      console.error('Error fetching chat ban appeals:', error);
      return [];
    }
  }

  async resolveChatBanAppeal(appealId: number, callerUserId: number, resolution: string, sessionToken: string): Promise<boolean> {
    try {
      const response = await fetch('/moderator/resolvechatbanappeal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Encrypted-UserId': sessionToken },
        body: JSON.stringify({ AppealId: appealId, CallerUserId: callerUserId, Resolution: resolution }),
      });
      return response.ok;
    } catch (error) {
      console.error('Error resolving chat ban appeal:', error);
      return false;
    }
  }

  /** Lets a chat member request moderator status for that room. */
  /** Request moderator status — for a chat room or, when topicId is given, a topic. */
  async requestModerator(chatId: number, userId: number, requestText: string, sessionToken: string, topicId?: number): Promise<{ ok: boolean; message: string }> {
    try {
      const response = await fetch('/moderator/requestmoderator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Encrypted-UserId': sessionToken },
        body: JSON.stringify({ ChatId: chatId, TopicId: topicId, UserId: userId, RequestText: requestText }),
      });
      let data: any = null;
      const body = await response.text();
      try { data = body ? JSON.parse(body) : null; } catch { /* non-JSON body */ }
      if (response.ok) return { ok: true, message: (data && data.message) || 'Moderator request submitted.' };
      return { ok: false, message: (data && data.message) || body || 'Failed to submit moderator request.' };
    } catch (error) {
      console.error('Error requesting moderator:', error);
      return { ok: false, message: 'Failed to submit moderator request. Please try again.' };
    }
  }

  /** The caller's own pending moderator request for a chat or topic (id 0 when none). */
  async getMyModeratorRequest(chatId: number, userId: number, sessionToken: string, topicId?: number): Promise<ModeratorRequest | null> {
    try {
      const response = await fetch('/moderator/getmymoderatorrequest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Encrypted-UserId': sessionToken },
        body: JSON.stringify({ ChatId: chatId, TopicId: topicId, UserId: userId }),
      });
      if (!response.ok) return null;
      const data = await response.json();
      return data && data.id > 0 ? data as ModeratorRequest : null;
    } catch (error) {
      console.error('Error checking moderator request:', error);
      return null;
    }
  }

  /** Any logged-in user can list the moderators of a topic (0 = general moderators). */
  async getModeratorsFor(callerUserId: number, topicId: number, sessionToken: string): Promise<any[]> {
    try {
      const response = await fetch('/moderator/getmoderatorsfor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Encrypted-UserId': sessionToken },
        body: JSON.stringify({ CallerUserId: callerUserId, TopicId: topicId }),
      });
      if (!response.ok) return [];
      return await response.json() as any[];
    } catch (error) {
      console.error('Error fetching moderators for topic:', error);
      return [];
    }
  }

  /** All of the caller's own moderator requests (chat + topic, pending + resolved). */
  async getMyModeratorRequests(userId: number, sessionToken: string): Promise<any[]> {
    try {
      const response = await fetch('/moderator/getmymoderatorrequests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Encrypted-UserId': sessionToken },
        body: JSON.stringify(userId),
      });
      if (!response.ok) return [];
      return await response.json() as any[];
    } catch (error) {
      console.error('Error fetching my moderator requests:', error);
      return [];
    }
  }

  /** Open moderator requests — admins see all, chat moderators see their rooms'. */
  async getModeratorRequests(callerUserId: number, sessionToken: string, isChatModeratorView = false): Promise<ModeratorRequest[]> {
    try {
      const response = await fetch('/moderator/getmoderatorrequests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Encrypted-UserId': sessionToken },
        body: JSON.stringify({ CallerUserId: callerUserId, IsChatModeratorView: isChatModeratorView }),
      });
      if (!response.ok) return [];
      return await response.json() as ModeratorRequest[];
    } catch (error) {
      console.error('Error fetching moderator requests:', error);
      return [];
    }
  }

  /** Approve (grants chat_moderator) or deny a moderator request. */
  async resolveModeratorRequest(requestId: number, callerUserId: number, resolution: string, sessionToken: string): Promise<{ ok: boolean; message: string }> {
    try {
      const response = await fetch('/moderator/resolvemoderatorrequest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Encrypted-UserId': sessionToken },
        body: JSON.stringify({ RequestId: requestId, CallerUserId: callerUserId, Resolution: resolution }),
      });
      let data: any = null;
      const body = await response.text();
      try { data = body ? JSON.parse(body) : null; } catch { /* non-JSON body */ }
      if (response.ok) return { ok: true, message: (data && data.message) || 'Request resolved.' };
      return { ok: false, message: (data && data.message) || body || 'Failed to resolve request.' };
    } catch (error) {
      console.error('Error resolving moderator request:', error);
      return { ok: false, message: 'Failed to resolve request.' };
    }
  }

  /** Lets a user check their own ban status in a chat (for the banned notice + appeal UI). */
  async isChatUserBanned(chatId: number, userId: number, sessionToken: string): Promise<{ isBanned: boolean; hasPendingAppeal: boolean }> {
    try {
      const response = await fetch('/moderator/ischatuserbanned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Encrypted-UserId': sessionToken },
        body: JSON.stringify({ ChatId: chatId, UserId: userId }),
      });
      if (!response.ok) return { isBanned: false, hasPendingAppeal: false };
      return await response.json() as { isBanned: boolean; hasPendingAppeal: boolean };
    } catch (error) {
      console.error('Error checking chat ban status:', error);
      return { isBanned: false, hasPendingAppeal: false };
    }
  }
}
