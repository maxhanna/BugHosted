import { PlantPhoto } from './plant-photo';

export interface UserPlant {
  id: number;
  userId: number;
  name: string;
  species?: string;
  notes?: string;
  location?: string;
  lastWatered?: Date;
  createdAt: Date;
  updatedAt: Date;
  photos?: PlantPhoto[];
}
