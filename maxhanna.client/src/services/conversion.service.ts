import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { User } from './datacontracts/user/user';
import { FileEntry } from './datacontracts/file/file-entry';
import { Observable } from 'rxjs/internal/Observable';

export interface ConversionResult {
  fileId: number;
  fileName: string;
  folderPath: string;
}

export interface FontConversionResult {
  fileId: number;
  fileName: string;
  folderPath: string;
  fontDataUri: string;
  characters: string;
}

export interface VisionReportResult {
  report: string;
}

export interface YoutubeDownloadResult {
  fileId: number;
  fileName: string;
  title: string;
  note: string;
}

export interface TextToAsciiResult {
  fileId: number;
  fileName: string;
  folderPath: string;
  art: string;
}

@Injectable({
  providedIn: 'root'
})
export class ConversionService {
  constructor(private http: HttpClient) { }

  /** Upload a file through the standard file system and resolve to its FileEntry. */
  uploadFile(file: File, user?: User): Observable<any> {
    const formData = new FormData();
    formData.append('files', file);
    formData.append('userId', user?.id ? String(user.id) : '0');
    formData.append('isPublic', 'true');

    let dir = '';
    try {
      dir = `?folderPath=${encodeURIComponent('Uploads/Convert')}`;
    } catch { }

    return this.http.post(`/file/upload${dir}`, formData, { responseType: 'text' });
  }

  convertFile(fileId: number, targetFormat: string, userId: number | undefined): Promise<ConversionResult | null> {
    return fetch('/conversion/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ FileId: fileId, TargetFormat: targetFormat, UserId: userId })
    }).then(async (res) => {
      if (!res.ok) return null;
      return await res.json();
    }).catch(() => null);
  }

  imageToFont(fileId: number, text: string | undefined, userId: number | undefined): Promise<FontConversionResult | null> {
    return fetch('/conversion/imagetofont', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ FileId: fileId, Text: text || null, UserId: userId })
    }).then(async (res) => {
      if (!res.ok) return null;
      return await res.json();
    }).catch(() => null);
  }

  visionReport(fileId: number, prompt: string | undefined, userId: number | undefined): Promise<VisionReportResult | null> {
    return fetch('/conversion/visionreport', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ FileId: fileId, Prompt: prompt || null, UserId: userId })
    }).then(async (res) => {
      if (!res.ok) return null;
      return await res.json();
    }).catch(() => null);
  }

  youtubeDownload(url: string, format: string, userId: number | undefined): Promise<YoutubeDownloadResult | null> {
    return fetch('/conversion/youtubedownload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Url: url, Format: format, UserId: userId })
    }).then(async (res) => {
      if (!res.ok) {
        const errText = await res.text();
        return { fileId: 0, fileName: '', title: '', note: errText || 'Download failed.' };
      }
      return await res.json();
    }).catch(() => ({ fileId: 0, fileName: '', title: '', note: 'Download failed.' }));
  }

  textToAscii(text: string, style: string, scale: number, userId: number | undefined): Promise<TextToAsciiResult | null> {
    return fetch('/conversion/texttoascii', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Text: text, Style: style, Scale: scale, UserId: userId })
    }).then(async (res) => {
      if (!res.ok) return null;
      return await res.json();
    }).catch(() => null);
  }
}

export { FileEntry };