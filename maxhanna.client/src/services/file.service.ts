import { Injectable } from '@angular/core';
import { HttpClient, HttpEvent, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs/internal/Observable';
import { User } from './datacontracts/user/user';
import { FileEntry } from './datacontracts/file/file-entry';
import { Topic } from './datacontracts/topics/topic';

@Injectable({
	providedIn: 'root'
})
export class FileService {
	constructor(private http: HttpClient) { }

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
		"d81", "d82", "atr", "xfd", "cas", "sap", "tzx", "pzx", "zx"
	];


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
		showFavouritesOnly?: boolean
	) {
		// Create a URLSearchParams object
		const params = new URLSearchParams();

		// Add parameters dynamically
		params.append('directory', dir || '');
		params.append('visibility', visibility || '');
		params.append('ownership', ownership || '');
		params.append('page', page ? page.toString() : '1');
		params.append('pageSize', pageSize ? pageSize.toString() : '100');
		params.append('sortOption', sortOption ? sortOption : 'Latest');
		params.append('showFavouritesOnly', showFavouritesOnly ? showFavouritesOnly.toString() + '' : 'false');
		if (search) params.append('search', search);
		if (fileId) params.append('fileId', fileId.toString());
		if (fileType) params.append('fileType', fileType.join(','));
		if (showHidden !== undefined) params.append('showHidden', showHidden.toString());

		try {
			const response = await fetch(`/file/getdirectory?${params.toString()}`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(user),
			});

			return await response.json();
		} catch (error) {
			console.error('Error fetching directory:', error);
			return null;
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
	async getLatestMemeId() {
		try {
			const response = await fetch(`/file/getlatestmemeid`, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json',
				},
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

	async getFileViewers(fileId: number) {
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

			return await response.json();
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
	async moveFile(fileFrom: string, fileTo: string, userId: number) {
		try {
			const response = await fetch(`/file/move?inputFile=${encodeURIComponent(fileFrom)}&destinationFolder=${encodeURIComponent(fileTo)}`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(userId),
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
	async notifyFollowersFileUploaded(userId: number, fileId: number, fileCount?: number) {
		try {
			const response = await fetch(`/file/notifyfollowersfileuploaded`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ UserId: userId, FileId: fileId, FileCount: fileCount ?? 1 }),
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
}
