// Shared client-side data contract for a persisted bike wall (matches server MetaBikeWall)
export interface MetaBikeWall {
    id?: number;
    heroId?: number;
    map?: string;
    x: number;
    y: number;
    level?: number;
}
