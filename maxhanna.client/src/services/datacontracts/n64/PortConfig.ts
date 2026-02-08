type PortConfig = {
  gpIndex: number | null;
  gpId?: string | null;
  mapping: Record<string, any>;
  mappingName: string | null;
  autoFill: boolean; // NEW: if false, never auto-assign this port
}; 