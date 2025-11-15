export interface PartyMember {
  heroId: number;
  name: string;
  color?: string;
  type?: string; // class or archetype e.g. 'knight', 'magi', 'rogue'
}
