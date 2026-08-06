import { User } from "../user/user";

/** A role definition from the dynamically generated role catalog. */
export interface RoleDefinition {
  role: string;
  label: string;
  description: string;
  targetType?: string; // 'global' | 'chat' | 'topic'
}

/** A role assignment for a user, possibly scoped to a target (chat/topic). */
export interface ModeratorRole {
  userId: number;
  role: string;
  targetType?: string;
  targetId?: number;
  targetName?: string;
  assignedBy?: number;
  assignedAt?: Date;
}

/** A moderator user with their full set of roles (expandable in the panel). */
export interface ModeratorInfo {
  user?: User;
  roles: ModeratorRole[];
}

/** A log entry from the moderator logs. */
export interface ModeratorLog {
  id: number;
  comment?: string;
  component: string;
  userId?: number;
  timestampUtc: Date;
}

/** A public chat room that can be searched and joined. */
export interface PublicChatInfo {
  chatId: number;
  name: string;
  description?: string;
  icon?: string;
  isPublic: boolean;
  memberCount: number;
  createdBy?: number;
  createdAt?: Date;
}

/** A ban issued by a chat room's moderators, scoped to that chat only. */
export interface ChatBan {
  id: number;
  chatId: number;
  userId: number;
  username?: string | null;
  bannedBy?: number;
  reason?: string | null;
  createdAt?: Date;
  liftedAt?: Date | null;
  liftedBy?: number | null;
  isActive: boolean;
}

/** An appeal against a chat ban, resolved by that chat's moderators. */
export interface ChatBanAppeal {
  id: number;
  chatId: number;
  userId: number;
  username?: string | null;
  appealText?: string | null;
  createdAt?: Date;
  resolvedAt?: Date | null;
  resolvedBy?: number | null;
  resolution?: string | null;
}

/** A user's request to become a moderator of a chat room, resolved by that
 * chat's moderators (or an admin). Shows up in the moderator panel's requests. */
export interface ModeratorRequest {
  id: number;
  chatId: number;
  userId: number;
  username?: string | null;
  chatName?: string | null;
  requestText?: string | null;
  createdAt?: Date;
  resolvedAt?: Date | null;
  resolvedBy?: number | null;
  resolution?: string | null;
}
