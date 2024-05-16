import { Injectable } from '@angular/core';
import { User } from './datacontracts/user';

@Injectable({
  providedIn: 'root'
})
export class FileService
{
  async getDirectory(user: User, dir: string)
  {
    var params = new URLSearchParams({ directory: dir });
    try {
      const response = await fetch(`/file/getdirectory?` + params, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }

  async createDirectory(user: User, directory: string)
  {
    try {
      const response = await fetch(`/file/makedirectory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user, directory }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }
  async getFile(user: User, file: string) {
    try {
      const response = await fetch(`/file/getfile/${encodeURIComponent(file)}`, {
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
  async uploadFile(user: User, form: FormData, directory?: string) {
    form.append('user', JSON.stringify(user));

    try {
      const dir = directory ? `folderPath=${encodeURIComponent(directory)}` : '';
      const response = await fetch(`/file/upload?${dir}`, {
        method: 'POST', 
        body: form,
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async deleteFile(user: User, file: string) {
    try {
      const response = await fetch(`/file/delete`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user, file }),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async moveFile(user: User, fileFrom: string, fileTo: string) {
    try {
      console.log("from:" + fileFrom + "; to:" + fileTo);
      const response = await fetch(`/file/move?inputFile=${encodeURIComponent(fileFrom)}&destinationFolder=${encodeURIComponent(fileTo)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }
  async getRomFile(user: User, rom: string) {
    try {
      const response = await fetch(`/file/getromfile/${encodeURIComponent(rom)}`, {
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
      const response = await fetch(`/file/uploadrom/`, {
        method: 'POST',
        body: form,
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  getFileExtension(file: string) {
    console.log("in getFileExtension: " + file);
    return file.lastIndexOf('.') !== -1 ? file.split('.').pop() : null;
  }
}
