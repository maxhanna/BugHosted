// Backend DTO shape returned by /bones/getpartymembers (PascalCase)
export interface PartyMemberDto {
  HeroId: number;
  Name?: string;
  Color?: string;
  Type: string; // NOT NULL, defaults to 'knight'
  Level: number;
  Hp: number;
  Map?: string;
  Exp: number;
}

// Frontend normalized camelCase version used throughout UI logic
export interface PartyMember {
  heroId: number;
  name?: string;
  color?: string;
  type: string;
  level: number;
  hp: number;
  map?: string;
  exp: number;
}

// Helper to convert a raw DTO (with either casing) to PartyMember
export function toPartyMember(raw: any): PartyMember {
  return {
    heroId: raw.heroId ?? raw.HeroId,
    name: raw.name ?? raw.Name,
    color: raw.color ?? raw.Color,
    type: raw.type ?? raw.Type ?? 'knight',
    level: raw.level ?? raw.Level ?? 0,
    hp: raw.hp ?? raw.Hp ?? 0,
    map: raw.map ?? raw.Map,
    exp: raw.exp ?? raw.Exp ?? 0
  };
}