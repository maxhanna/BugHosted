export type PortConfig = {
  gpIndex: number | null;
  gpId?: string | null;
  mapping: Record<string, any>;
  mappingName: string | null;
  autoFill: boolean;
}; 