export class UserSettings { 
  userId!: number;
  nsfwEnabled?: boolean;
  ghostReadEnabled?: boolean;
  compactness?: string;
  showPostsFrom?: string; 
  notificationsEnabled?: boolean; 
  lastCharacterName?: string;
  lastCharacterColor?: string;
  showHiddenFiles?: boolean;
  showFavouritesOnly?: boolean;
  muteSounds?: boolean;
  muteMusicEnder?: boolean;
  muteSfxEnder?: boolean;
  muteMusicEmulator?: boolean;
  muteMusicBones?: boolean;
  muteSfxBones?: boolean;
  allowEnderInactivityNotifications?: boolean;
  // Digcraft FOV (degrees) stored per-user when available
  public digcraftFovDistance?: number;
}
