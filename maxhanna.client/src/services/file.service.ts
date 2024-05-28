import { Injectable } from '@angular/core';
import { User } from './datacontracts/user';
import { HttpClient, HttpEvent, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs/internal/Observable';

@Injectable({
  providedIn: 'root'
})
export class FileService {
  constructor(private http: HttpClient) { }

  async getDirectory(user: User, dir: string, visibility: string, ownership: string) {
    var params = new URLSearchParams({ directory: dir, visibility: visibility || '', ownership: ownership || '' });
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

  async createDirectory(user: User, directory: string, isPublic: boolean) {
    try {
      const response = await fetch(`/file/makedirectory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user, directory, isPublic }),
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
  uploadFileWithProgress(user: User, formData: FormData, directory: string | undefined, isPublic: boolean): Observable<HttpEvent<any>> {
    formData.append('user', JSON.stringify(user));
    formData.append('isPublic', isPublic + "");
    const dir = directory ? `?folderPath=${encodeURIComponent(directory)}` : '';
    const url = `/file/upload${dir}`;

    const req = new HttpRequest('POST', url, formData, {
      reportProgress: true,
      responseType: 'text'
    });

    return this.http.request(req);
  }
  async uploadFile(user: User, form: FormData, directory?: string, isPublic: boolean = true) {

    try {
      const dir = directory ? `?folderPath=${encodeURIComponent(directory)}` : '';
      const response = await fetch(`/file/upload${dir}`, {
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
  async shareFile(user: User, user2: User, fileId: number) {
    try {
      const response = await fetch(`/file/share/${fileId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user1: user, user2: user2 }),
      });

      return await response.json();
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
    return file.lastIndexOf('.') !== -1 ? file.split('.').pop() : null;
  }
}
