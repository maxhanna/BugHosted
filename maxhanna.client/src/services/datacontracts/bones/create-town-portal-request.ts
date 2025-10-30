export interface CreateTownPortalRequest {
  heroId: number;
  userId?: number | null;
  map?: string | null;
  x: number;
  y: number;
  radius?: number | null;
}
