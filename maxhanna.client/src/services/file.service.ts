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
	romFileExtensions = ["sgx", "vb", "ws", "wsc", "gba", "gbc", "gb", "gen", "md", "smd", "32x", "sms", "gg", "nes", "fds", "sfc", "smc", "snes", "nds"];

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
		showHidden?: boolean
	) {
		// Create a URLSearchParams object
		const params = new URLSearchParams();

		// Add parameters dynamically
		params.append('directory', dir || '');
		params.append('visibility', visibility || '');
		params.append('ownership', ownership || '');
		params.append('page', page ? page.toString() : '1');
		params.append('pageSize', pageSize ? pageSize.toString() : '100');
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
	async updateFileData(user: User, fileData: { FileId: number, GivenFileName: string, Description: string, LastUpdatedBy: User }) {
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
	async updateFileVisibility(user: User, isVisible: boolean, fileId: number) {
		try {
			const response = await fetch(`/file/updatefilevisibility`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ User: user, IsVisible: isVisible, FileId: fileId }),
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
	uploadFileWithProgress(formData: FormData, directory: string | undefined, isPublic: boolean, user?: User, compress?: boolean): Observable<HttpEvent<any>> {
		formData.append('user', JSON.stringify(user));
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
	async getFileEntryById(fileId: number) {
		try {
			const response = await fetch(`/file/getfileentrybyid`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify( fileId ),
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
				body: JSON.stringify({ Topics: topics, File: file, User: user }),
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
