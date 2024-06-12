import { Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { FileEntry } from '../../services/datacontracts/file-entry';
import { FileService } from '../../services/file.service';
import { FileComment } from '../../services/datacontracts/file-comment';
import { User } from '../../services/datacontracts/user';


@Component({
  selector: 'app-media-viewer',
  templateUrl: './media-viewer.component.html',
  styleUrl: './media-viewer.component.css'
})
export class MediaViewerComponent extends ChildComponent {
  constructor(private fileService: FileService) { super(); }
  notifications: string[] = [];
  videoFileExtensions = ["mp4", "mov", "avi", "wmv", "webm", "flv"];
  selectedFileExtension = '';
  selectedFileSrc = '';
  selectedFile: FileEntry | undefined;
  fileType = '';
  showThumbnail = false;
  showComments = true;
  selectedFileName = '';
  abortFileRequestController: AbortController | null = null;
  debounceTimer: any;
  fS = '/';
  @ViewChild('mediaContainer', { static: false }) mediaContainer!: ElementRef;
  @ViewChild('fullscreenOverlay', { static: false }) fullscreenOverlay!: ElementRef;
  @ViewChild('fullscreenImage', { static: false }) fullscreenImage!: ElementRef;
  @ViewChild('fullscreenVideo', { static: false }) fullscreenVideo!: ElementRef;

  @Input() user?: User;

  copyLink(fileId: number) {
    const link = `https://maxhanna.ca/Files/${fileId}`;
    navigator.clipboard.writeText(link).then(() => {
      this.notifications.push('Link copied to clipboard!');
    }).catch(err => {
      this.notifications.push('Failed to copy link!');
    });
  }
  async setFileSrc(fileName: string, currentDirectory?: string) {
    this.startLoading();
    if (this.abortFileRequestController) {
      this.abortFileRequestController.abort();
    }

    this.abortFileRequestController = new AbortController();

    let target = (currentDirectory ?? '').replace(/\\/g, "/");
    target += (currentDirectory!.length > 0 && currentDirectory![currentDirectory!.length - 1] === this.fS) ? fileName : currentDirectory!.length > 0 ? this.fS + fileName : fileName;


    const response = await this.fileService.getFile(target, {
      signal: this.abortFileRequestController.signal
    });
    if (!response || response == null) return;
    const contentDisposition = response.headers["content-disposition"];
    this.selectedFileExtension = this.getFileExtensionFromContentDisposition(contentDisposition);
    const type = this.fileType = this.videoFileExtensions.includes(this.selectedFileExtension)
      ? `video/${this.selectedFileExtension}`
      : `image/${this.selectedFileExtension}`;

    const blob = new Blob([response.blob], { type });
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = () => {
      this.showThumbnail = true;
      setTimeout(() => { this.selectedFileSrc = (reader.result as string); }, 1);
      this.selectedFileName = fileName;
    };
    this.stopLoading();
  }
  expandFile(file: any) {
    (this.mediaContainer.nativeElement as HTMLMediaElement).src = '';
    const overlay = this.fullscreenOverlay.nativeElement;
    const image = this.fullscreenImage.nativeElement;
    const video = this.fullscreenVideo.nativeElement;

    if (this.videoFileExtensions.includes(file.extension)) {
      video.src = this.selectedFileSrc;
      video.style.display = 'block';
      image.style.display = 'none';
    } else {
      image.src = this.selectedFileSrc;
      image.style.display = 'block';
      video.style.display = 'none';
    }

    overlay.style.display = 'flex';
  }

  shrink() {
    const overlay = this.fullscreenOverlay.nativeElement;
    const image = this.fullscreenImage.nativeElement;
    const video = this.fullscreenVideo.nativeElement;
    image.src = undefined;
    video.src = undefined;
    (this.mediaContainer.nativeElement as HTMLMediaElement).src = this.selectedFileSrc;

    overlay.style.display = 'none';
  }
  getFileExtensionFromContentDisposition(contentDisposition: string | null): string {
    if (!contentDisposition) return '';

    // Match the filename pattern
    const filenameMatch = contentDisposition.match(/filename\*?=['"]?([^'";\s]+)['"]?/);
    if (filenameMatch && filenameMatch[1]) {
      const filename = filenameMatch[1];
      return filename.split('.').pop() || '';
    }
    return '';
  }

  async getComments(memeId: number) {
    try {
      const res = await this.fileService.getComments(memeId);
      if (res && res != '') {
        this.selectedFile!.fileComments = res as FileComment[];
      }
      else {
        this.selectedFile!.fileComments = [];
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("404")) {
        this.selectedFile!.fileComments = [];
      } else {
        console.error("Error fetching comments:", error);
      }
    }
  }

  async addComment(event: Event) {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => {
      if (!this.selectedFile) {
        return alert("You must select a file!");
      } else {
        const fileId = this.selectedFile.id;
        const comment = (document.getElementById("addCommentInput" + fileId)! as HTMLInputElement).value;
        try {
          if (fileId && comment && comment.trim() != '') {
            this.notifications.push(await this.fileService.commentFile(fileId, comment, this.user));
          }
          (event.target as HTMLInputElement).value = '';
        } catch (error) {
          console.error("Error adding comment:", error);
        }
        return await this.getComments(fileId);
      }
    }, 2000);
  }

  async upvoteComment(comment: FileComment) {
    if (!this.user) { return alert("You must be logged in to use this feature!"); }

    try {
      this.notifications.push(await this.fileService.upvoteComment(this.user, comment.id));
      await this.getComments(this.selectedFile!.id);
    } catch (error) {
      console.error("Error upvoting comment:", error);
    }
  }

  async downvoteComment(comment: FileComment) {
    if (!this.user) { return alert("You must be logged in to use this feature!"); }

    try {
      this.notifications.push(await this.fileService.downvoteComment(this.user, comment.id));
      await this.getComments(this.selectedFile!.id);
    } catch (error) {
      console.error("Error downvoting comment:", error);
    }
  }
}
