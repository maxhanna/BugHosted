import { Injectable } from '@angular/core';
import { HttpClient, HttpEvent, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs/internal/Observable';
import { User } from './datacontracts/user/user';
import { FileEntry } from './datacontracts/file/file-entry';
import { Topic } from './datacontracts/topics/topic';
import { FileAccessLog } from './datacontracts/file/file-access-log';
import { FileNote } from './datacontracts/file/file-note';
import { Core, System } from '../app/emulator/emulator-types';

@Injectable({
  providedIn: 'root'
})
export class FileService {
  // Controller to allow cancelling an in-flight getDirectory() request
  private _getDirectoryAbortController: AbortController | null = null;
  constructor(private http: HttpClient) { }

  // System-specific title keywords to help disambiguate ambiguous file extensions
  private n64TitleKeywords: string[] = [
    'ocarina of time', 'majora', 'majoras mask', 'goldeneye', 'super mario 64', 'mario 64', 'banjo kazooie', 'conker', 'paper mario', 'donkey kong 64', 'perfect dark'
  ];

  private ps1TitleKeywords: string[] = [
    'final fantasy vii', 'metal gear solid', 'gran turismo', 'silent hill', 'tekken', 'crash bandicoot', 'spyro','spyro - year of the dragon', 'vagrant story'
  ];

  private pspTitleKeywords: string[] = [
    'liberty city stories', 'vice city stories', 'crisis core', 'dissidia',
    'birth by sleep', 'kingdom hearts bbs', 'patapon', 'loco roco', 'locoroco',
    'god eater', 'phantasy star portable', "jeanne d'arc", 'daxter',
    'chains of olympus', 'ghost of sparta', 'peace walker', 'portable ops',
    'lumines', 'wipeout pure', 'wipeout pulse', 'fat princess', 'tactics ogre',
    'valkyria chronicles ii', 'valkyria chronicles 2', 'persona 3 portable',
    'ys seven', 'ys vs', 'trails in the sky', 'the 3rd birthday',
    'monster hunter freedom', 'monster hunter portable'
  ];

  private saturnTitleKeywords: string[] = [
    'sonic jam', 'panzer dragoon', 'panzer dragoon saga', 'panzer dragoon zwei', 'burning rangers', 'guardian heroes', 'dragon force', 'shining force iii', 'shining force 3', 'saturn bomberman', 'enemy zero', 'nights into dreams', 'radiant silvergun'
  ];

  private snesTitleKeywords: string[] = [
    'chrono trigger', 'secret of mana', 'super mario world', 'donkey kong country', 'earthbound', 'legend of zelda a link to the past', 'zelda a link to the past'
  ];

  private nesTitleKeywords: string[] = [
    'super mario bros', 'the legend of zelda', 'zelda ii', 'metroid', 'castlevania', 'mega man'
  ];

  private gbaTitleKeywords: string[] = [
    'pokemon ruby', 'pokemon sapphire', 'pokemon emerald', 'pokemon fire red', 'pokemon leaf green', 'metroid fusion', 'advance wars', 'mario kart advance'
  ];

  private genesisTitleKeywords: string[] = [
    'sonic the hedgehog', 'streets of rage', 'shining in the darkness', 'golden axe', 'mortal kombat'
  ];

  private ndsTitleKeywords: string[] = [
    'new super mario bros', 'pokemon diamond', 'pokemon pearl', 'pokemon platinum', 'professor layton'
  ];

  private dreamcastTitleKeywords: string[] = [
    'shenmue', 'sonic adventure', 'crazy taxi', 'jet set radio', 'powerstone'
  ];

  videoFileExtensions = [
    "mp4", "mov", "avi", "wmv", "webm", "flv", "mkv", "m4v", "mpg", "mpeg", "3gp", "3g2", "asf", "rm",
    "rmvb", "swf", "vob", "ts", "mts", "m2ts", "mxf", "ogv", "divx", "xvid", "dv", "drc", "f4v", "f4p",
    "f4a", "f4b", "mjp", "mjpg", "ogm", "nut", "bik", "roq", "viv", "vp6", "vp7"
  ];

  audioFileExtensions = [
    "mp3", "wav", "ogg", "flac", "aac", "aiff", "alac", "amr", "ape", "au", "dss", "gsm", "m4a", "m4b",
    "m4p", "mid", "midi", "mpa", "mpc", "oga", "opus", "ra", "sln", "tta", "voc", "vox", "wma", "wv",
    "kar", "sid", "spx", "txw", "asx", "cda", "mod", "it", "s3m", "xm", "uax"
  ];

  imageFileExtensions = [
    "jpg", "jpeg", "png", "gif", "bmp", "tiff", "svg", "webp", "heif", "heic", "ico", "psd", "raw",
    "cr2", "nef", "orf", "sr2", "arw", "dng", "rw2", "pef", "raf", "3fr", "ari", "bay", "cap", "dcr",
    "drf", "eip", "erf", "fff", "iiq", "k25", "kdc", "mdc", "mos", "mrw", "nrw", "obm", "ptx", "r3d",
    "rwl", "srf", "srw", "x3f", "avif", "jxr", "hdp", "wdp", "cur", "jp2", "jpx", "j2k", "jpf", "ras",
    "emf", "wmf", "dib"
  ];

  romFileExtensions = [
    "sgx", "vb", "ws", "wsc", "gba", "gbc", "gb", "gen", "md", "smd", "32x", "sms", "gg", "nes", "fds",
    "sfc", "smc", "snes", "nds", "n64", "z64", "v64", "gcm", "iso", "cdi", "chd", "cue", "ccd", "mdf",
    "pbp", "bin", "img", "dsk", "adf", "st", "ipf", "d64", "t64", "tap", "prg", "crt", "g64", "nib",
    "d81", "d82", "atr", "xfd", "cas", "sap", "tzx", "pzx", "zx", "fig"
  ];

  n64FileExtensions = ["z64", "n64", "v64"];
  ps1FileExtensions = ["bin", "cue", "iso", "chd", "pbp"];
  genesisFileExtensions: string[] = ["smd", "gen", "32x", "gg", "sms", "md"];
  segaFileExtensions: string[] = ["smd", "gen", "32x", "gg", "sms", "md"];
  nesFileExtensions: string[] = ["nes", "fds"];
  gbaFileExtensions: string[] = ['gba'];
  ndsFileExtensions: string[] = ['nds'];
  pspFileExtensions: string[] = ['psp', 'iso', 'cso', 'pbp'];
  snesFileExtensions: string[] = ['snes', 'sfc', 'smc', 'fig', 'swc', 'bs', 'st'];
  saturnFileExtensions: string[] = ['cue', 'chd', 'iso', 'bin'];
  ambiguousRomExtensions: string[] = ['zip', '7z', 'bin', 'cue', 'iso', 'chd', 'img', 'ccd', 'mdf', 'mds', 'nrg', 'gdi', 'cdi', 'pdp']; 
 
  getRomFileExtensions(): string[] {
    const all = [
      this.romFileExtensions,
      this.n64FileExtensions,
      this.ps1FileExtensions,
      this.genesisFileExtensions,
      this.segaFileExtensions,
      this.nesFileExtensions,
      this.gbaFileExtensions,
      this.ndsFileExtensions,
      this.pspFileExtensions,
      this.snesFileExtensions,
      this.saturnFileExtensions,
      this.ambiguousRomExtensions
    ];
    return Array.from(new Set(all.flat()));
  }
  /** Return Genesis/MegaDrive related extensions present in romFileExtensions */
  getGenesisFileExtensions(): string[] {
    return Array.from(this.genesisFileExtensions);
  }

  /** Return Sega-related extensions (alias for Genesis/MegaDrive) present in romFileExtensions */
  getSegaFileExtensions(): string[] {
    return Array.from(this.segaFileExtensions);
  }

  getPspFileExtensions(): string[] {
    return Array.from(this.pspFileExtensions);
  }

  /** Return Saturn-related extensions (commonly ambiguous: cue, chd, iso, bin) */
  getSaturnFileExtensions(): string[] {
    return Array.from(this.saturnFileExtensions);
  }

  /** Return NES (and Famicom) related extensions present in romFileExtensions */
  getNesFileExtensions(): string[] {
    return Array.from(this.nesFileExtensions);
  }

  /** Return GBA extensions (usually just 'gba') */
  getGbaFileExtensions(): string[] {
    return Array.from(this.gbaFileExtensions);
  }

  /** Return NDS extensions (usually just 'nds') */
  getNdsFileExtensions(): string[] {
    return Array.from(this.ndsFileExtensions);
  }

  /** Return SNES related extensions present in romFileExtensions */
  getSnesFileExtensions(): string[] {
    return Array.from(this.snesFileExtensions);
  }

  /** Return N64 extensions (delegates to the explicit array) */
  getN64FileExtensions(): string[] {
    return Array.from(this.n64FileExtensions);
  }

  /** Return PlayStation 1 extensions (delegates to explicit array) */
  getPs1FileExtensions(): string[] {
    return Array.from(this.ps1FileExtensions);
  }

  /** Return Ambiguous rom extensions (delegates to explicit array) */
  getAmbiguousRomExtensions(): string[] {
    return Array.from(this.ambiguousRomExtensions);
  }

  getN64TitleKeywords(): string[] { return Array.from(this.n64TitleKeywords); }
  getPs1TitleKeywords(): string[] { return Array.from(this.ps1TitleKeywords); }
  getPspTitleKeywords(): string[] { return Array.from(this.pspTitleKeywords); }
  getSaturnTitleKeywords(): string[] { return Array.from(this.saturnTitleKeywords); }
  getSnesTitleKeywords(): string[] { return Array.from(this.snesTitleKeywords); }
  getNesTitleKeywords(): string[] { return Array.from(this.nesTitleKeywords); }
  getGbaTitleKeywords(): string[] { return Array.from(this.gbaTitleKeywords); }
  getGenesisTitleKeywords(): string[] { return Array.from(this.genesisTitleKeywords); }
  getNdsTitleKeywords(): string[] { return Array.from(this.ndsTitleKeywords); }
  getDreamcastTitleKeywords(): string[] { return Array.from(this.dreamcastTitleKeywords); }

  async getDirectory(
    dir: string,
    visibility: string,
    ownership: string,
    user?: User,
    page?: number,
    pageSize?: number,
    search?: string,
    fileId?: number,
    fileType?: Array<string>,
    showHidden?: boolean,
    sortOption?: string,
    showFavouritesOnly?: boolean,
    includeRomMetadata?: boolean, // ✅ NEW
    actualCore?: string[]
  ) {
    const params = new URLSearchParams();

    params.append('directory', dir || '');
    params.append('visibility', visibility || '');
    params.append('ownership', ownership || '');
    params.append('page', page ? page.toString() : '1');
    params.append('pageSize', pageSize ? pageSize.toString() : '100');
    params.append('sortOption', sortOption ? sortOption : '');
    params.append('showFavouritesOnly', showFavouritesOnly ? String(showFavouritesOnly) : 'false');

    if (search) params.append('search', search);
    if (fileId) params.append('fileId', fileId.toString());
    if (fileType) params.append('fileType', fileType.join(','));
    if (showHidden !== undefined) params.append('showHidden', showHidden.toString());

    // ✅ add this
    if (includeRomMetadata !== undefined) {
      params.append('includeRomMetadata', includeRomMetadata.toString());
    }
    if (actualCore) {
      params.append('actualCore', actualCore.join(','));
    }

    try {
      // Abort any previous getDirectory request so callers always receive
      // the most-recent response.
      try {
        this._getDirectoryAbortController?.abort();
      } catch { }
      this._getDirectoryAbortController = new AbortController();

      const response = await fetch(`/file/getdirectory?${params.toString()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user),
        signal: this._getDirectoryAbortController.signal,
      });

      return await response.json();
    } catch (error: any) {
      // If the request was explicitly aborted, rethrow so callers can
      // handle it specially (and avoid showing error UI for expected cancels).
      if (error && (error.name === 'AbortError' || error.message === 'The user aborted a request.')) {
        throw error;
      }
      console.error('Error fetching directory:', error);
      return null;
    } finally {
      // clear controller reference if it belongs to the completed/failed request
      // (don't clear if it was replaced by a newer request)
      try {
        if (this._getDirectoryAbortController && this._getDirectoryAbortController.signal.aborted) {
          this._getDirectoryAbortController = null;
        }
      } catch { }
    }
  }

  async updateFileData(userId: number, fileData: { FileId: number, GivenFileName: string, Description: string, LastUpdatedBy: User }) {
    try {
      const response = await fetch(`/file/updatefiledata`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, fileData }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }
  async updateFileVisibility(userId: number, isVisible: boolean, fileId: number) {
    try {
      const response = await fetch(`/file/updatefilevisibility`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, IsVisible: isVisible, FileId: fileId }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }
  async createDirectory(userId: number, directory: string, isPublic: boolean, sessionToken: string) {
    try {
      const response = await fetch(`/file/makedirectory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Encrypted-UserId': sessionToken,
        },
        body: JSON.stringify({ userId, directory, isPublic }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }
  async getLatestMeme(): Promise<FileEntry | null> {
    try {
      const response = await fetch(`/file/getlatestmeme`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) return null;

      const payload = await response.json();
      if (!payload) return null;

      // Expecting an object with an `id` property representing the file id
      const id = payload.id ?? payload.Id;
      if (!id) return null;

      // Populate a FileEntry instance with returned properties
      const entry = Object.assign(new FileEntry(id), payload) as FileEntry;
      return entry;
    } catch (error) {
      return null;
    }
  }

  async getNumberOfFiles(userId: number) {
    try {
      const response = await fetch(`/file/getnumberoffiles?userId=${userId}`, { method: 'GET' });
      if (!response.ok) return 0;
      const txt = await response.text();
      const n = parseInt(txt);
      return isNaN(n) ? 0 : n;
    } catch (e) { return 0; }
  }

  async getNumberOfMemes(userId: number) {
    try {
      const response = await fetch(`/file/getnumberofmemes?userId=${userId}`, { method: 'GET' });
      if (!response.ok) return 0;
      const txt = await response.text();
      const n = parseInt(txt);
      return isNaN(n) ? 0 : n;
    } catch (e) { return 0; }
  }

  async getNumberOfArt(userId?: number) {
    try {
      const query = (userId !== undefined && userId !== null) ? `?userId=${encodeURIComponent(userId)}` : '';
      const response = await fetch(`/file/getnumberofart${query}`, { method: 'GET' });
      if (!response.ok) return 0;
      const txt = await response.text();
      const n = parseInt(txt);
      return isNaN(n) ? 0 : n;
    } catch (e) { return 0; }
  }
  async getFile(file: string, options?: { signal: AbortSignal }, user?: User) {
    try {
      const response = await fetch(`/file/getfile/${encodeURIComponent(file)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'max-age=31536000',
        },
        signal: options?.signal,
        body: JSON.stringify(user?.id)
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

  async getFileById(fileId: number, sessionToken: string, options?: { signal: AbortSignal }, userId?: number) {
    try {
      const response = await fetch(`/file/getfilebyid/${encodeURIComponent(fileId)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'max-age=31536000',
          'Encrypted-UserId': sessionToken,
        },
        signal: options?.signal,
        body: JSON.stringify(userId)
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

  async getFileViewers(fileId: number): Promise<FileAccessLog[] | undefined> {
    try {
      const response = await fetch(`/file/getfileviewers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fileId),
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status} - ${response.statusText}`);
      }

      return await response.json() as FileAccessLog[];
    } catch (error) {
      throw error;
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
  async hideFile(fileId: number, userId: number) {
    try {
      const response = await fetch(`/file/hide`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, fileId }),
      });

      return await response.text();
    } catch (error) {
      throw error;
    }
  }
  async unhideFile(fileId: number, userId: number) {
    try {
      const response = await fetch(`/file/unhide`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, fileId }),
      });

      return await response.text();
    } catch (error) {
      throw error;
    }
  }
  uploadFileWithProgress(formData: FormData, directory: string | undefined, isPublic: boolean, userId?: number, compress?: boolean): Observable<HttpEvent<any>> {
    formData.append('userId', userId ? userId + "" : "0");
    formData.append('isPublic', isPublic + "");

    let dir = '';
    try {
      dir = directory ? `?folderPath=${encodeURIComponent(directory)}&compress=${compress ?? false}` : '';
    } catch { }
    const url = `/file/upload${dir}`;

    const req = new HttpRequest('POST', url, formData, {
      reportProgress: true,
      responseType: 'text'
    });

    return this.http.request(req);
  }
  async uploadFile(form: FormData, directory?: string) {

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
  async deleteFile(userId: number, file: FileEntry) {
    try {
      const response = await fetch(`/file/delete`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, file }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }
  async moveFile(fileFrom: string, fileTo: string, userId: number, fileId?: number) {
    try {
      const url = `/file/move`;
      const body = { userId, fileId, inputFile: fileFrom, destinationFolder: fileTo };
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }
  async shareFile(userId: number, user2Id: number, fileId: number) {
    try {
      const response = await fetch(`/file/share/${fileId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user1Id: userId, user2Id: user2Id }),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async getFileEntryById(fileId: number, userId?: number) {
    try {
      const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
      const response = await fetch(`/file/getfileentrybyid${query}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fileId),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async notifyFollowersFileUploaded(userId: number, userName: string, fileId: number, fileCount?: number) {
    try {
      const response = await fetch(`/file/notifyfollowersfileuploaded`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, UserName: userName, FileId: fileId, FileCount: fileCount ?? 1 }),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async getFileSrcByFileId(fileId: number, sessionToken: string): Promise<string> {
    const response = await this.getFileById(fileId, sessionToken);
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
  /** Returns the file extension from a given file name without the dot */
  getFileExtension(file: string) {
    if (!file) return '';
    return file.lastIndexOf('.') !== -1 ? file.split('.').pop() ?? '' : '';
  }

  /** Returns the file name without its extension (without the dot) */
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
      // Match the UTF-8 filename* pattern
      const filenameStarMatch = contentDisposition.match(/filename\*=['"]?UTF-8''([^'";\s]+)['"]?/);

      if (filenameStarMatch && filenameStarMatch[1]) {
        const utf8Filename = this.customDecodeURIComponent(filenameStarMatch[1]);
        if (utf8Filename) return utf8Filename.split('.').pop() || '';
      }

      // Fallback: match the regular filename pattern
      const filenameMatch = contentDisposition.match(/filename=['"]?([^'";\s]+)['"]?/);

      if (filenameMatch && filenameMatch[1]) {
        return filenameMatch[1].split('.').pop() || '';
      }

    } catch (error) {
      console.error('Error processing Content-Disposition header:', error);
    }
    // Match the filename pattern

    const filenameMatch = contentDisposition.match(/filename=['"]?([^'";\s]+)['"]?/);
    if (filenameMatch && filenameMatch[1] && filenameMatch[1] != '') {
      const filename = filenameMatch[1];
      return filename.split('.').pop() || '';
    }
    return '';
  }
  async editTopics(user: User, file: FileEntry, topics: Topic[]) {
    try {
      const res = await fetch('/file/edit-topics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ Topics: topics, File: file, UserId: user.id }),
      });

      if (!res.ok) {
        return 'Error editing file';
      }
      return 'File editing successfully';
    } catch (error) {
      console.error('Error editing file:', error);
      return 'Error editing file';
    }
  }
  async toggleFavourite(userId: number, fileId: number) {
    try {
      const res = await fetch('/file/togglefavorite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, FileId: fileId }),
      });

      if (!res.ok) {
        return 'Error favouriting file';
      }
      return res.json();
    } catch (error) {
      console.error('Error editing file:', error);
      return 'Error favouriting file';
    }
  }
  async getFavouritedBy(fileId: number) {
    try {
      const res = await fetch('/file/getfavouritedby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fileId),
      });
      if (!res.ok) throw new Error('Failed to fetch');
      return await res.json();
    } catch (error) {
      console.error(error);
      return [];
    }
  }

  // Record a search query (type optional: 'file' | 'social')
  async recordSearch(query: string, type?: string, userId?: number) {
    try {
      await fetch('/search/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Query: query, Type: type, UserId: userId }),
      });
    } catch (e) {
      console.error('Failed to record search', e);
    }
  }

  async getTrending(type?: string, limit: number = 5) {
    try {
      const url = '/search/trending' + (type ? `?type=${encodeURIComponent(type)}&limit=${limit}` : `?limit=${limit}`);
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) throw new Error('Failed to fetch trending');
      return await res.json();
    } catch (e) {
      console.error('Failed to fetch trending', e);
      return [];
    }
  }

  async massDelete(userId: number, fileIds: number[]) {
    try {
      const response = await fetch(`/file/massdelete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          { UserId: userId, FileIds: fileIds }
        ),
      });
      return await response.text();
    } catch (error) {
      return null;
    }
  }

  formatFileSize(bytes: number, decimalPoint: number = 2): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimalPoint <= 0 ? 0 : decimalPoint;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
  customDecodeURIComponent(encodedString: string): string {
    return encodedString.replace(/%([0-9a-fA-F]{2})/g, (match, hex) => {
      // Convert hex to a character
      const charCode = parseInt(hex, 16);

      // Handle safe range of characters (excluding control chars, etc.)
      if (charCode > 31 && charCode < 127) {
        return String.fromCharCode(charCode);
      } else {
        // Leave the percent encoding as-is if it's not a valid printable character
        console.warn('Skipping invalid percent-encoded character:', match);
        return match;
      }
    });
  }

  // Convert a stored bios/core identifier or generic system token into a human-friendly name.
  // Examples: 'yabause' -> 'Sega Saturn', 'mednafen_psx_hw' -> 'PlayStation'.
  getSystemFromBios(systemOrBios?: string | null | undefined): string | undefined {
    if (!systemOrBios) return undefined;
    const s = String(systemOrBios).toLowerCase();

    if (s.includes('psx') || s.includes('ps1') || s.includes('mednafen_psx') || s.includes('pcsx') || s.includes('duckstation')) return 'PlayStation';
    if (s === 'psp' || s.includes('ppsspp') || s.includes('psp')) return 'PlayStation Portable (PSP)';
    if (s.includes('mupen64') || s.includes('n64')) return 'Nintendo 64';
    if (s.includes('snes')) return 'Super Nintendo (SNES)';
    if (s.includes('fceumm') || s.includes('nes') || s === 'nestopia') return 'Nintendo (NES)';
    if (s.includes('mgba') || s.includes('gba')) return 'Game Boy Advance (GBA)';
    if (s.includes('gambatte') || s.includes('gbc') || s === 'gb') return 'Game Boy / GBC';
    if (s.includes('genesis') || s.includes('megadrive') || s.includes('picodrive')) return 'Sega Genesis / Mega Drive';
    if (s.includes('dreamcast') || s.includes('dc') || s.includes('flycast')|| s.includes('naomi') || s.includes('reicast')) return 'Sega Dreamcast';
    if (s.includes('saturn') || s.includes('yabause') || s.includes('sega_saturn') || s.includes('segaSaturn')) return 'Sega Saturn';
    if (s.includes('melonds') || s.includes('nds') || s.includes('desmume')) return 'Nintendo DS';
    if (s.includes('tgcd') || s.includes('pcengine') || s.includes('hu')) return 'TurboGrafx / PC Engine';

    try {
      const cleaned = systemOrBios.replace(/_/g, ' ');
      return cleaned.split(' ').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    } catch {
      return systemOrBios;
    }
  }

  /** Try to guess system by matching known title keywords in filename. */
  guessSystemFromTitle(fileName: string): System | undefined {
    if (!fileName) return undefined;
    const name = fileName.toLowerCase();

    if (this.n64TitleKeywords.some(k => name.includes(k))) return 'n64';
    if (this.pspTitleKeywords.some(k => name.includes(k))) return 'psp';
    if (this.ps1TitleKeywords.some(k => name.includes(k))) return 'ps1';
    if (this.saturnTitleKeywords.some(k => name.includes(k))) return 'saturn';
    if (this.snesTitleKeywords.some(k => name.includes(k))) return 'snes';
    if (this.nesTitleKeywords.some(k => name.includes(k))) return 'nes';
    if (this.gbaTitleKeywords.some(k => name.includes(k))) return 'gba';
    if (this.genesisTitleKeywords.some(k => name.includes(k))) return 'genesis';
    if (this.ndsTitleKeywords.some(k => name.includes(k))) return 'nds';
    if (this.dreamcastTitleKeywords.some(k => name.includes(k))) return 'dreamcast';

    return undefined;
  }
  
  getSystemCoreFromKey(key: string): Core | undefined {
    const k = key.toLowerCase();
    // --- Sony ---
    if (k === 'psp') return 'psp';
    if (k === 'ps1' || k === 'psx' || k.includes('playstation')) return 'pcsx_rearmed';

    // --- Sega ---
    if (k === 'genesis' || k.includes('megadrive') || k === 'md') return 'genesis_plus_gx';
    if (k === 'sega cd' || k === 'megacd' || k === 'mega-cd') return 'genesis_plus_gx';
    if (k === '32x') return 'picodrive';
    if (k === 'saturn') return 'yabause';
    if (k === 'dreamcast') return 'flycast';

    // --- 3DO ---
    if (k === '3do') return 'opera';

    // --- Nintendo ---
    if (k === 'n64' || k.includes('nintendo 64')) return 'mupen64plus_next';
    if (k === 'nds' || k.includes('ds') || k === 'desmume') return 'desmume2015';
    if (k === 'melonds') return 'melonds';
    if (k === 'gamecube' || k === 'gc' || k === 'wii' || k === 'dolphin') return 'dolphin';
    if (k === 'gba' || k.includes('game boy advance')) return 'mgba';
    if (k === 'gb' || k === 'gbc' || k.includes('game boy color')) return 'mgba';
    if (k === 'fceumm' || k === 'nes' || k.includes('famicom')) return 'fceumm';
    if (k === 'snes' || k === 'sfc' || k.includes('super nintendo') || k.includes('super famicom')) return 'snes9x';

    if (k === 'virtual boy' || k === 'vb' || k === 'vboy') return 'mednafen_vb';

    // --- Arcade ---
    if (k === 'mame' || k.includes('arcade')) return 'mame2003_plus';
    if (k === 'fbneo' || k === 'neogeo') return 'fbneo';

    // --- Atari ---
    if (k === 'atari 2600' || k === '2600' || k === 'a26') return 'stella2014';
    if (k === 'atari 7800' || k === '7800' || k === 'a78') return 'prosystem';
    if (k === 'lynx' || k === 'atari lynx' || k === 'lnx') return 'handy';
    if (k === 'jaguar' || k === 'atari jaguar' || k === 'jag') return 'virtualjaguar';

    // --- Coleco / Commodore / Amiga ---
    if (k === 'colecovision' || k === 'coleco' || k === 'col') return 'gearcoleco';
    if (k === 'commodore 64' || k === 'c64' || k === 'd64') return 'vice_x64';
    if (k === 'amiga' || k === 'commodore amiga' || k === 'adf') return 'puae';

    // --- Experimental ---
    if (k === 'flycast') return 'flycast';
    if (k === 'vitaquake3' || k === 'quake iii' || k === 'pk3') return 'vitaquake3';

    return undefined;
  }
    
  parseYoutubeId(url: string): string {
    if (!url) return '';
    try {
      const u = new URL(url);
      const host = u.hostname.replace('www.', '');

      // youtu.be/<id>
      if (host === 'youtu.be') {
        // path is "/<id>" possibly followed by segments; strip query/fragment
        const id = u.pathname.split('/').filter(Boolean)[0] || '';
        return id.split('?')[0].split('#')[0];
      }

      // youtube.com/watch?v=<id>
      const v = u.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;

      // youtube.com/embed/<id>
      const embed = u.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
      if (embed) return embed[1];

      // youtube.com/shorts/<id>
      const shorts = u.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
      if (shorts) return shorts[1];
    } catch {
      // Fallback regex if URL constructor fails
      const m =
        url.match(/[?&]v=([a-zA-Z0-9_-]{11})/) ||
        url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/) ||
        url.match(/\/embed\/([a-zA-Z0-9_-]{11})/) ||
        url.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
      if (m) return m[1];
    }
    return '';
  }

  async getFileNotes(fileId: number): Promise<FileNote[]> {
    try {
      const response = await fetch('/file/getfilenotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fileId),
      });
      if (!response.ok) throw new Error(`Error: ${response.status}`);
      return await response.json() as FileNote[];
    } catch (error) {
      console.error(error);
      return [];
    }
  }

  async addFileNote(userId: number, fileId: number, note: string): Promise<string | null> {
    try {
      const response = await fetch('/file/addfilenote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, fileId, note }),
      });
      return await response.text();
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  async deleteFileNote(userId: number, fileId: number, targetUserId: number): Promise<string | null> {
    try {
      const response = await fetch('/file/deletefilenote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, fileId, targetUserId }),
      });
      return await response.text();
    } catch (error) {
      console.error(error);
      return null;
    }
  }
}
