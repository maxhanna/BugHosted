export interface PlantPhoto {
  id: number;
  plantId: number;
  fileId: number;
  fileName?: string;
  filePath?: string;
  createdAt: Date;
}
