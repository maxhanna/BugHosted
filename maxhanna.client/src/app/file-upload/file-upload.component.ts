import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { FileService } from '../../services/file.service';
import { HttpEventType } from '@angular/common/http'; 
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { User } from '../../services/datacontracts/user/user';
import { AppComponent } from '../app.component';

@Component({
  selector: 'app-file-upload',
  templateUrl: './file-upload.component.html',
  styleUrl: './file-upload.component.css'
})
export class FileUploadComponent {
  @Input() currentDirectory = '';
  @Input() user?: User;
  @Input() inputtedParentRef?: AppComponent;
  @Input() uploadButtonText: string = '';
  @Input() showPrivatePublicOption: boolean = true;
  @Input() allowedFileTypes: string = '';

  @Output() userUploadEvent = new EventEmitter<Array<File>>();
  @Output() userUploadFinishedEvent = new EventEmitter<FileEntry[]>();
  @Output() userNotificationEvent = new EventEmitter<string>();
  @Output() userCancelEvent = new EventEmitter<boolean>();

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('fileListContainer') fileListContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('folderVisibility') folderVisibility!: ElementRef<HTMLSelectElement>;

  showMakeDirectoryPrompt = false;
  uploadFileList: Array<File> = [];
  uploadedFileList: FileEntry[] = [];
  uploadProgress: { [key: string]: number } = {};
  isUploading: boolean = false;
  displayListContainer = false;
  constructor(private fileService: FileService) { }

  uploadInitiate() {
    if (this.fileInput && this.fileInput.nativeElement && this.fileInput.nativeElement.files) {
      this.displayListContainer = true;
      if (this.inputtedParentRef) { 
        this.inputtedParentRef.showOverlay = true;
      }
      this.uploadFileList = Array.from(this.fileInput.nativeElement.files as FileList);
      this.userUploadEvent.emit(this.uploadFileList);
    }
  }
  cancelFileUpload() {
    console.log("cancel file upload");
    this.uploadProgress = {};
    this.isUploading = false;
    this.uploadFileList = [];
    this.fileInput.nativeElement.value = '';
    this.userCancelEvent.emit(true);
    this.displayListContainer = false;
    if (this.inputtedParentRef && this.inputtedParentRef.showOverlay) {
      this.inputtedParentRef.closeOverlay();
    }
  }
  async uploadSubmitClicked() {
    if (this.getOverallProgress() > 0) {
      return;
    }
    if (this.uploadFileList.length > 0) {
      this.upload();
    } else {
      this.fileInput.nativeElement.click();
    }
  }
  removeFile(file: File) {
    if (this.uploadProgress[file.name]) { return; }
    this.uploadFileList = this.uploadFileList.filter(f => f !== file);
    if (this.uploadFileList.length == 0) {
      this.cancelFileUpload();
    }
  }
  async upload() {
    if (!this.uploadFileList) { return alert("weird bug, cant find fileInput"); }

    const files = this.uploadFileList;
    if (!files || !files.length || this.uploadFileList.length == 0) {
      return alert("No file to upload!");
    }
    this.isUploading = true;
    const filesArray = Array.from(files);

    const isPublic = (this.showPrivatePublicOption ? this.folderVisibility?.nativeElement.value : true) as boolean;

    const directoryInput = (this.currentDirectory || '').replace(/\/+$/, '');
    const fileNames = Array.from(files).map(file => file.name);
     
    try {
      filesArray.forEach((file, index) => {
        const formData = new FormData();
        formData.append('files', file);

        const uploadReq = this.fileService.uploadFileWithProgress(formData, directoryInput || undefined, isPublic, this.user);
        if (uploadReq) {
          uploadReq.subscribe({
            next: (event) => {
              if (event.type === HttpEventType.UploadProgress) {
                this.uploadProgress[file.name] = Math.round(100 * (event.loaded / event.total!));
              }
              else if (event.type === HttpEventType.Response) {
                // Handle completion
                const files = JSON.parse(event.body) as FileEntry;
                this.uploadedFileList.push(files);
                this.checkIfLastFileUploaded(filesArray, this.uploadedFileList.length);
              }
            },
            error: (error) => {
              console.error(`Error uploading ${file.name}:`, error);
              this.checkIfLastFileUploaded(filesArray, this.uploadedFileList.length);
            }
          });
        } 
      }); 
    } catch (ex) {
      console.log(ex);
      this.userNotificationEvent.emit((ex as Error).message);
    } 
  }

  private checkIfLastFileUploaded(filesArray: File[], index: number) { 
    if (filesArray.length == index) {
      this.userUploadFinishedEvent.emit(this.uploadedFileList);
      this.userNotificationEvent.emit(`Finished uploading ${this.uploadedFileList.length} files.`); 

      this.uploadProgress = {};
      this.isUploading = false;
      this.uploadFileList = [];
      this.uploadedFileList = [];
      this.fileInput.nativeElement.value = ''; 
      this.displayListContainer = false; 
      if (this.inputtedParentRef) {
        this.inputtedParentRef.closeOverlay();
      }
    }
  }

  getOverallProgress(): number {
    if (this.uploadFileList.length === 0) return 0;
    const totalProgress = Object.values(this.uploadProgress).reduce((sum, progress) => sum + progress, 0);
    return Math.round(totalProgress / this.uploadFileList.length);
  }
}
