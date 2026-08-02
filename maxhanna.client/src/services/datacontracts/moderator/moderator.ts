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
  isPublic: boolean;
  memberCount: number;
  createdBy?: number;
  createdAt?: Date;
}
