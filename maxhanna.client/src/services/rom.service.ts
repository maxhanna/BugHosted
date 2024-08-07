import { Injectable } from '@angular/core'; 
import { User } from './datacontracts/user/user';

@Injectable({
  providedIn: 'root'
})
export class RomService {
  constructor() { }
   
  async getRomFile(rom: string, user?: User) {
    try {
      const response = await fetch(`/rom/getromfile/${encodeURIComponent(rom)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user),
      });

      return await response.blob();
    } catch (error) {
      return null;
    }
  }
  async uploadRomFile(user: User, form: FormData) {
    form.append('user', JSON.stringify(user));

    try {
      const response = await fetch(`/rom/uploadrom/`, {
        method: 'POST',
        body: form,
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  getFileExtension(file: string) {
    return file.lastIndexOf('.') !== -1 ? file.split('.').pop() : null;
  }
}
