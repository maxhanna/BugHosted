import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { FileService } from '../../services/file.service';
import { HttpErrorResponse, HttpEventType, HttpResponse } from '@angular/common/http';
import { User } from '../../services/datacontracts/user';

@Component({
  selector: 'app-file-upload',
  templateUrl: './file-upload.component.html',
  styleUrl: './file-upload.component.css'
})
export class FileUploadComponent {
  constructor(private fileService: FileService) { }
  @Input() currentDirectory = '';
  @Input() user!: User;
  @Input() visibility!: boolean;
  @Input() allowedFileTypes: string = '';

  @Output() userUploadEvent = new EventEmitter<Array<File>>();
  @Output() userNotificationEvent = new EventEmitter<string>();
  @Output() userCancelEvent = new EventEmitter<boolean>();

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('folderVisibility') folderVisibility!: ElementRef<HTMLSelectElement>;

  showMakeDirectoryPrompt = false;
  uploadFileList: Array<File> = [];
  uploadProgress: number = 0;

  uploadInitiate() {
    if (this.fileInput && this.fileInput.nativeElement && this.fileInput.nativeElement.files) {
      this.uploadFileList = Array.from(this.fileInput.nativeElement.files as FileList);
      this.userUploadEvent.emit(this.uploadFileList);
    }
  }
  cancelFileUpload() {
    this.uploadProgress = 0;
    this.uploadFileList = [];
    this.fileInput.nativeElement.value = '';
    this.userCancelEvent.emit(true);
  }
  async uploadSubmitClicked() {
    if (this.uploadFileList.length > 0) {
      this.upload();
    } else {
      this.fileInput.nativeElement.click();
    }
  }
  removeFile(file: File) {
    this.uploadFileList = this.uploadFileList.filter(f => f !== file);
    if (this.uploadFileList.length == 0) {
      this.userCancelEvent.emit(true);
    }
  }
  async upload() {
    if (!this.uploadFileList) { return alert("weird bug, cant find fileInput"); }

    const files = this.uploadFileList;
    if (!files || !files.length || this.uploadFileList.length == 0) {
      return alert("No file to upload!");
    }

    const filesArray = Array.from(files);
    const isPublic = this.visibility ? (Boolean)(this.folderVisibility?.nativeElement.value) : true;

    const directoryInput = this.currentDirectory || '';
    const fileNames = Array.from(files).map(file => file.name);

    if (confirm(`✅ Upload : ${directoryInput}/${fileNames.join(',')} ?`)) {
      try {
        const formData = new FormData();
        filesArray.forEach(file => formData.append('files', file));

        // Use HttpClient to track the upload progress
        const uploadReq = this.fileService.uploadFileWithProgress(this.user, formData, directoryInput || undefined, isPublic);
        uploadReq.subscribe((event) => {
          if (typeof event !== 'number') {
            if (event.type === HttpEventType.UploadProgress) {
              this.uploadProgress = Math.round(100 * (event.loaded / event.total!));
            }
            else if (event.type === HttpEventType.Response) {
              this.uploadProgress = 0;
              if (event.body && event.body.partialText) {
                this.userNotificationEvent.emit(event.body.partialText);
              }
            }
            else if (event.type === HttpEventType.DownloadProgress) {
              this.cancelFileUpload();
            }
            else if (event.type == HttpEventType.ResponseHeader) {
              if (event.statusText) {
                this.userNotificationEvent.emit(event.statusText);
              }
            }
          }
        });
      } catch (ex) {
        this.uploadProgress = 0;
      }
    }
  }
}
