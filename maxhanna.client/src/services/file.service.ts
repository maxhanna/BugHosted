import { Injectable } from '@angular/core';
import { HttpClient, HttpEvent, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs/internal/Observable';
import { User } from './datacontracts/user/user';
import { FileData } from './datacontracts/file/file-data';
import { FileEntry } from './datacontracts/file/file-entry';

@Injectable({
  providedIn: 'root'
})
export class FileService {
  constructor(private http: HttpClient) { }

  videoFileExtensions = [
    "mp4", "mov", "avi", "wmv", "webm", "flv", "mkv", "m4v", "mpg", "mpeg", "3gp", "3g2", "asf", "rm",
    "rmvb", "swf", "vob", "ts", "mts", "m2ts", "mxf", "ogv", "divx", "xvid", "dv", "drc", "f4v", "f4p",
    "f4a", "f4b"
  ];
  audioFileExtensions = [
    "mp3", "wav", "ogg", "flac", "aac", "aiff", "alac", "amr", "ape", "au", "dss", "gsm", "m4a", "m4b",
    "m4p", "mid", "midi", "mpa", "mpc", "oga", "opus", "ra", "rm", "sln", "tta", "voc", "vox", "wma",
    "wv"
  ];
  imageFileExtensions = [
    "jpg", "jpeg", "png", "gif", "bmp", "tiff", "svg", "webp", "heif", "heic", "ico", "psd", "raw",
    "cr2", "nef", "orf", "sr2", "arw", "dng", "rw2", "pef", "raf", "3fr", "ari", "bay", "cap", "dcr",
    "drf", "eip", "erf", "fff", "iiq", "k25", "kdc", "mdc", "mos", "mrw", "nrw", "obm", "orf", "pef",
    "ptx", "r3d", "raf", "raw", "rwl", "rw2", "sr2", "srf", "srw", "x3f"
  ];

  async getDirectory(dir: string, visibility: string, ownership: string, user?: User, page?: number, pageSize?: number, search?: string, fileId?: number, fileType?: Array<string>) {
    const params = new URLSearchParams(
      {
        directory: dir,
        visibility: visibility || '',
        ownership: ownership || '',
        page: page ? page + '' : '1',
        pageSize: pageSize ? pageSize + '' : '100',
        search: search ? search : '',
        fileId: fileId ? fileId + '' : '',
        fileType: fileType ? fileType.join(',') : '',
      });
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
  async updateFileData(user: User, fileData: FileData) {
    try {
      const response = await fetch(`/file/updatefiledata`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user, fileData }),
      });

      return await response.text();
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
  async getFile(file: string, options?: { signal: AbortSignal }, user?: User) {
    try {
      const response = await fetch(`/file/getfile/${encodeURIComponent(file)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user),
        signal: options?.signal  // Pass the AbortSignal here
      });

      // Check if the request was aborted
      if (options?.signal?.aborted) {
        throw new Error('Request aborted');
      }

      const headers: Record<string, string> = {};
      response.headers.forEach((value: string, name: string) => {
        headers[name] = value;
      });
      const blob = await response.blob();
      return { blob, headers };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw error;
      } else {
        return null;
      }
    }
  }

  async getFileById(fileId: number, options?: { signal: AbortSignal }, user?: User) {
    try {
      const response = await fetch(`/file/getfilebyid/${encodeURIComponent(fileId)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'max-age=31536000'
        },
        body: JSON.stringify(user),
        signal: options?.signal
      });

      if (options?.signal?.aborted) {
        throw new Error('Request aborted');
      }

      const headers: Record<string, string> = {};
      response.headers.forEach((value: string, name: string) => {
        headers[name] = value;
      });
      const blob = await response.blob();
      return { blob, headers };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw error;
      } else {
        return null;
      }
    }
  }


  async getComments(fileId: number) {
    try {
      const response = await fetch(`/file/comments/${fileId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status} - ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      throw error;
    }
  }
  async commentFile(fileId: number, comment: string, user?: User) {
    try {
      const response = await fetch(`/file/comment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user, fileId, comment }),
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status} - ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      throw error;
    }
  }

  async upvoteComment(user: User, commentId: number) {
    try {
      const response = await fetch(`/file/upvotecomment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user: user, commentId, upvote: true, downvote: false }),
      });

      return await response.text();
    } catch (error) {
      throw error;
    }
  }
  async deleteComment(user: User, commentId: number) {
    try {
      const response = await fetch(`/file/deletecomment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user: user, commentId }),
      });

      return await response.text();
    } catch (error) {
      throw error;
    }
  }
  async downvoteComment(user: User, commentId: number) {
    try {
      const response = await fetch(`/file/downvotecomment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user: user, commentId, upvote: false, downvote: true }),
      });

      return await response.text();
    } catch (error) {
      throw error;
    }
  }
  async upvoteFile(user: User, fileId: number) {
    try {
      const response = await fetch(`/file/upvote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user, fileId }),
      });

      return await response.text();
    } catch (error) {
      throw error;
    }
  }
  async downvoteFile(user: User, fileId: number) {
    try {
      const response = await fetch(`/file/downvote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user, fileId }),
      });

      return await response.text();
    } catch (error) {
      throw error;
    }
  }
  uploadFileWithProgress(formData: FormData, directory: string | undefined, isPublic: boolean, user?: User): Observable<HttpEvent<any>> {
    formData.append('user', JSON.stringify(user));
    formData.append('isPublic', isPublic + "");

    let dir = '';
    try {
      dir = directory ? `?folderPath=${encodeURIComponent(directory)}` : '';
    } catch { }
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
  async deleteFile(user: User, file: FileEntry) {
    try {
      const response = await fetch(`/file/delete`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user, file }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }
  async moveFile(user: User, fileFrom: string, fileTo: string) {
    try {
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
  async getFileSrcByFileId(fileId: number): Promise<string> {
    const response = await this.getFileById(fileId);
    if (!response || response == null) return '';
    const contentDisposition = response.headers["content-disposition"];
    const selectedFileExtension = this.getFileExtensionFromContentDisposition(contentDisposition);
    const type = this.videoFileExtensions.includes(selectedFileExtension)
      ? `video/${selectedFileExtension}`
      : this.audioFileExtensions.includes(selectedFileExtension)
        ? `audio/${selectedFileExtension}`
        : `image/${selectedFileExtension}`;


    const blob = new Blob([response.blob], { type });

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = () => {
        resolve(reader.result as string);
      };
      reader.onerror = reject;
    });
  }
  getFileExtension(file: string) {
    if (!file) return '';
    return file.lastIndexOf('.') !== -1 ? file.split('.').pop() ?? '' : '';
  }
  getFileWithoutExtension(file: string) {
    if (file) {
      const lastPeriodIndex = file.lastIndexOf('.');
      if (lastPeriodIndex !== -1) {
        // Extract the name part before the last period
        const nameWithoutExtension = file.substring(0, lastPeriodIndex);
        return nameWithoutExtension;  // Output: my.file.name.rom.sav
      } else {
        return file;
      }
    } else return '';
  }
  getFileExtensionFromContentDisposition(contentDisposition: string | null): string {
    if (!contentDisposition) return '';
    try {
      const filenameStarMatch = contentDisposition.match(/filename\*=['"]?UTF-8''([^'";\s]+)['"]?/);
      if (filenameStarMatch && filenameStarMatch[1] && filenameStarMatch[1] !== '') {
        try {
          const isUriEncoded = /^[A-Za-z0-9\-._~%!$&'()*+,;=:@]+$/.test(filenameStarMatch[1]);
          if (isUriEncoded) {
            const utf8Filename = decodeURIComponent(filenameStarMatch[1]);
            return utf8Filename.split('.').pop() || '';
          } else {
            console.log('Filename is not properly URI-encoded:', filenameStarMatch[1]);
            return '';
          } 
        } catch (error) {
          console.log('Error decoding UTF-8 filename:', error);
          return ''; // Return an empty string or handle the error as needed
        }
      }

      // Match the filename pattern
      const filenameMatch = contentDisposition.match(/filename=['"]?([^'";\s]+)['"]?/);
      if (filenameMatch && filenameMatch[1] && filenameMatch[1] != '') {
        const filename = filenameMatch[1];
        return filename.split('.').pop() || '';
      }
    } catch (error) {
      console.log('Error processing Content-Disposition header:', error);
    }

    return '';
  }

}
