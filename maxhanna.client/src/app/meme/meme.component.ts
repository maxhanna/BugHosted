import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { FileService } from '../../services/file.service';
import { HttpEventType } from '@angular/common/http';
import { FileEntry } from '../../services/datacontracts/file-entry';
import { FileComment } from '../../services/datacontracts/file-comment';
import { MemeService } from '../../services/meme.service';

@Component({
  selector: 'app-meme',
  templateUrl: './meme.component.html',
  styleUrls: ['./meme.component.css']
})
export class MemeComponent extends ChildComponent implements OnInit {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('commentInput') commentInput!: ElementRef<HTMLInputElement>;
  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;
  @ViewChild('memeContainer', { static: false }) memeContainer!: ElementRef;
  
  uploadProgress = 0;
  notifications: string[] = [];
  directoryContents: Array<FileEntry> = [];
  selectedMemeFileExtension: string | null = null;
  loading: boolean = false;
  isEditing: Array<number> = [];
  openedMemes: Array<number> = [];
  selectedMeme = "";
  videoFileExtensions = ["mp4", "mov", "avi", "wmv", "webm", "flv"];
  comments: FileComment[] = [];
  fileType = "";
  showComments = true;
  isUploadingInProcess = false;
  constructor(private fileService: FileService, private memeService: MemeService) { super(); }

  async ngOnInit() {
    this.isEditing = [];
    this.selectedMeme = "";
    this.removeMeme();
    await this.getFiles();
  }

  async getFiles() {
    this.startLoading();
    try {
      this.directoryContents = await this.memeService.getMemes(this.parentRef?.user!);
    } catch (error) {
      this.notifications.push("Error fetching memes");
    }
    this.stopLoading();
  }

  async upload() {
    if (!this.fileInput) { return alert("weird bug, cant find fileInput"); }

    const files = this.fileInput.nativeElement.files;
    if (!files || !files.length) {
      return alert("No file to upload!");
    }

    const filesArray = Array.from(files);
    const isPublic = true;

    const directoryInput = "Meme";
    const fileNames = Array.from(files).map(file => file.name);

    if (confirm(`Upload : ${directoryInput}/${fileNames.join(',')} ?`)) {
      this.startLoading();
      try {
        const formData = new FormData();
        filesArray.forEach(file => formData.append('files', file));

        // Use HttpClient to track the upload progress
        const uploadReq = this.fileService.uploadFileWithProgress(this.parentRef?.user!, formData, directoryInput, isPublic);
        uploadReq.subscribe((event) => {
          if (event.type === HttpEventType.UploadProgress) {
            this.uploadProgress = Math.round(100 * (event.loaded / event.total!));
          } else if (event.type === HttpEventType.Response) {
            this.uploadProgress = 0;
            this.notifications.push(`${directoryInput}/${fileNames.join(',')} uploaded successfully`);
            this.ngOnInit();
          }
        });
      } catch (ex) {
        this.uploadProgress = 0;
        this.notifications.push(`${directoryInput}/${fileNames.join(',')} failed to upload!`);
        this.ngOnInit();
      }
      this.stopLoading();
    }
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
   

  async loadMeme(memeId: number, memeName: string, index: number) {
    if (this.openedMemes.includes(index)) {
      this.removeMeme();
      this.openedMemes = [];
      return;
    } if (this.openedMemes.length > 0) {
      this.removeMeme();
      this.openedMemes = [];
    }
    this.openedMemes.push(index);
    this.loading = true;
    try {
      const response = await this.memeService.getMeme(memeId);
      const contentDisposition = response.headers["content-disposition"];
      this.selectedMemeFileExtension = this.getFileExtensionFromContentDisposition(contentDisposition);
      this.selectedMeme = memeName; 
      const type = this.fileType = this.videoFileExtensions.includes(this.selectedMemeFileExtension)
        ? `video/${this.selectedMemeFileExtension}`
        : `image/${this.selectedMemeFileExtension}`;

      const blob = new Blob([response.blob], { type });
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = () => {
        this.setMemeSrc(reader.result as string);
      };
    } catch {

    }
    
    this.loading = false;
  }

  getFileExtension(filePath: string) {
    return filePath.split('.').pop();
  }

  setMemeSrc(url: string) {
    if (this.memeContainer && this.memeContainer.nativeElement) {
      this.memeContainer.nativeElement.src = url;
      console.log("setMemeSrc");
    }
  }

  removeMeme() {
    this.openedMemes = [];
  }
  uploadNotification(event: string) {
    console.log("got upload notif!");
    this.notifications.push(event);
  }
  editMemeKeyUp(event: KeyboardEvent, memeId: number) {
    const text = (event.target as HTMLInputElement).value;
    if (event.key === 'Enter') {
      this.editMeme(memeId, text);
    } else {
      event.stopPropagation();
    }
  }
  async search() {
    if (this.searchInput.nativeElement && this.searchInput.nativeElement.value && this.searchInput.nativeElement.value != '') {
      const keywords = this.searchInput.nativeElement.value.trim();
      if (keywords && keywords.trim() != '')
        this.directoryContents = await this.memeService.searchForMemes(this.parentRef?.user!, keywords.trim());
    } else {
      await this.getFiles(); 
    }
  }
  async upvoteMeme(meme: FileEntry) {
    this.notifications.push(await this.fileService.upvoteFile(this.parentRef?.user!, meme.id));
    meme.upvotes++;
  }
  async downvoteMeme(meme: FileEntry) {
    this.notifications.push(await this.fileService.downvoteFile(this.parentRef?.user!, meme.id));
    meme.downvotes++;
  }

  async editMeme(memeId: number, text: string) {
    if (!text || text.trim() == '') { return; }
    const res = await this.memeService.updateMemeName(this.parentRef?.user!, memeId, text);
    if (document.getElementById("memeIdTd" + memeId) != null) {
      document.getElementById("memeIdTd" + memeId)!.innerText = text;
    }
    this.notifications.push(res);
    this.isEditing = this.isEditing.filter(x => x != memeId);
  }

  async startEditing(memeId: number, event: MouseEvent) {
    event.stopPropagation();
    const parent = document.getElementById("memeIdTd" + memeId)!;
    const text = parent.getElementsByTagName("input")[0].value!;

    if (this.isEditing.includes(memeId) && text.trim() == '') {
      this.isEditing = this.isEditing.filter(x => x != memeId);
      return;
    }

    if (!this.isEditing.includes(memeId)) {
      this.isEditing.push(memeId); 
      setTimeout(() => { (document.getElementById("editMemeNameInput" + memeId) as HTMLInputElement).focus() }, 1);  
    } else { 
      parent.innerText = text;
      await this.editMeme(memeId, text);
    }
  }

  getCanEdit(userid: string) {
    return parseInt(userid) == this.parentRef?.user!.id;
  }

  async getComments(memeId: number) {
    try {
      const res = await this.fileService.getComments(memeId);
      if (res && res != '') {
        this.comments = res as FileComment[];
      }
      else { 
        this.comments = []; 
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("404")) {
        this.comments = [];
      } else {
        console.error("Error fetching comments:", error);
      }
    } 
  }


  async addComment(meme: FileEntry, event: Event) {
    const fileId = meme.id;
    const comment = (document.getElementById("addCommentInput" + meme.id)! as HTMLInputElement).value;
    try {
      if (fileId && comment && comment.trim() != '') {
        await this.fileService.commentFile(this.parentRef?.user!, fileId, comment);
      }
      (document.getElementById("addCommentInput" + meme.id)! as HTMLInputElement).value = '';
    } catch (error) {
      console.error("Error adding comment:", error);
    }
    return await this.getComments(fileId);
  }

  async upvoteComment(comment: FileComment, meme: FileEntry) {
    try {
      await this.fileService.upvoteComment(this.parentRef?.user!, comment.id);
      await this.getComments(meme.id); // Refresh comments after upvoting
    } catch (error) {
      console.error("Error upvoting comment:", error);
    }
  }

  async downvoteComment(comment: FileComment, meme: FileEntry) {
    try {
      await this.fileService.downvoteComment(this.parentRef?.user!, comment.id);
      await this.getComments(meme.id); // Refresh comments after downvoting
    } catch (error) {
      console.error("Error downvoting comment:", error);
    }
  }

  uploadFileListEvent(event: File[]) {
    this.isUploadingInProcess = event && event.length > 0;
  }
  uploadCancelEvent(isCancelled: boolean) {
    if (isCancelled) {
      this.isUploadingInProcess = false;
    }
  }


  onSortChange(event: any) {
    const sortBy = event.target.value;
    this.sortMemes(sortBy);
  }

  sortMemes(sortBy: string) {
    if (sortBy === 'recent') {
      this.directoryContents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } else if (sortBy === 'upvotes') {
      this.directoryContents.sort((a, b) => b.upvotes - a.upvotes);
    } else if (sortBy === 'downvotes') {
      this.directoryContents.sort((a, b) => b.downvotes - a.downvotes);
    }
  }
  clickOnUpload() {
    document.getElementById('fileUploader')!.getElementsByTagName('input')[0].click();
  }
}
