import { Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild } from '@angular/core';
import { FileService } from '../../services/file.service';
import { HttpEvent, HttpEventType } from '@angular/common/http';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { User } from '../../services/datacontracts/user/user';
import { AppComponent } from '../app.component';
import { Topic } from '../../services/datacontracts/topics/topic';

@Component({
    selector: 'app-file-upload',
    templateUrl: './file-upload.component.html',
    styleUrl: './file-upload.component.css',
    standalone: false
})
export class FileUploadComponent implements OnDestroy {
  @Input() currentDirectory = '';
  @Input() user?: User;
  @Input() inputtedParentRef?: AppComponent;
  @Input() uploadButtonText: string = '';
  @Input() showPrivatePublicOption: boolean = true;
  @Input() allowedFileTypes: string = ''; 
  @Input() maxSelectedFiles: number = 5;

  @Output() userUploadEvent = new EventEmitter<Array<File>>();
  @Output() userUploadFinishedEvent = new EventEmitter<FileEntry[]>();
  @Output() userNotificationEvent = new EventEmitter<string>();
  @Output() userCancelEvent = new EventEmitter<boolean>();

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('compressCheckbox') compressCheckbox!: ElementRef<HTMLInputElement>;
  @ViewChild('fileListContainer') fileListContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('folderVisibility') folderVisibility!: ElementRef<HTMLSelectElement>;

  showMakeDirectoryPrompt = false;
  uploadFileList: Array<File> = [];
  uploadedFileList: FileEntry[] = [];
  duplicateFileNames: string[] = [];
  uploadProgress: { [key: string]: number } = {};
  isUploading: boolean = false;
  displayListContainer = false;
  displayFileUploadOptions = false;
  displayFileUploadTopics = false;
  totalProgress? = 0;

  fileUploadTopics: Topic[] = [];

  preventDisplayClose = false;
  constructor(private fileService: FileService) {
    this.inputtedParentRef?.addResizeListener();
  }

  ngOnDestroy() {
    this.inputtedParentRef?.removeResizeListener();
  }

  uploadInitiate() {
    if (this.fileInput && this.fileInput.nativeElement && this.fileInput.nativeElement.files) {
      this.displayListContainer = true;
      if (this.inputtedParentRef) {
        this.inputtedParentRef.showOverlay();
      }

      const selectedFiles = Array.from(this.fileInput.nativeElement.files as FileList);

      const considerFileTypes = this.allowedFileTypes.trim() !== '';
      let validFiles: File[];

      if (!considerFileTypes) {
        validFiles = selectedFiles;
      } else {
        const allowedTypes = this.allowedFileTypes
          .split(',')
          .map(t => t.trim().toLowerCase())
          .filter(t => t.length > 0);

        validFiles = selectedFiles.filter(file => {
          const mimeType = file.type.toLowerCase();
          const ext = '.' + file.name.split('.').pop()?.toLowerCase();
          return allowedTypes.includes(mimeType) || allowedTypes.includes(ext);
        });

        if (validFiles.length === 0) {
          alert('None of the selected files match the allowed file types.');
          return;
        }
      }

      // If there are already files selected, append new ones, enforcing maxSelectedFiles
      const currentNames = new Set(this.uploadFileList.map(f => f.name));
      const newFiles = validFiles.filter(f => !currentNames.has(f.name));
      const combined = this.uploadFileList.concat(newFiles);
      if (combined.length > this.maxSelectedFiles) {
        alert(`Cannot add more than ${this.maxSelectedFiles} files! Took the first ${this.maxSelectedFiles} valid files for upload.`);
      }
      this.uploadFileList = combined.slice(0, this.maxSelectedFiles);
      // reset the file input so the same file can be selected again if desired
      try { this.fileInput.nativeElement.value = ''; } catch { }
      this.userUploadEvent.emit(this.uploadFileList);
    }
  }
  cancelFileUpload() { 
    this.uploadProgress = {};
    this.isUploading = false;
    this.uploadFileList = [];
    this.fileInput.nativeElement.value = '';
    this.userCancelEvent.emit(true);
    this.displayListContainer = false;
     
    if (this.inputtedParentRef) {
      this.inputtedParentRef.closeOverlay();
    }
  }
  async uploadSubmitClicked() {
    if (this.uploadFileList.length > this.maxSelectedFiles) {
      alert(`Cannot add more then ${this.maxSelectedFiles} files! Took the first ${this.maxSelectedFiles} files for upload.`);
      this.uploadFileList = this.uploadFileList.slice(0, this.maxSelectedFiles); 
    }
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
  private async upload() {
    if (!this.uploadFileList) { return alert("weird bug, cant find fileInput"); }

    const files = this.uploadFileList;
    if (!files || !files.length || this.uploadFileList.length == 0) {
      return alert("No file to upload!");
    }
    this.isUploading = true;
    this.displayFileUploadOptions = false;
    this.displayFileUploadTopics = false;

    this.inputtedParentRef?.updateLastSeen();
    const filesArray = Array.from(files);

    const isPublic = (this.showPrivatePublicOption ? this.folderVisibility?.nativeElement.value : true) as boolean;

    const directoryInput = (this.currentDirectory || '').replace(/\/+$/, '');
    const fileNames = Array.from(files).map(file => file.name);

    try {
      filesArray.forEach((file, index) => {
        const formData = new FormData();
        formData.append('files', file);
        const compress = this.compressCheckbox?.nativeElement?.checked ?? true;
        const uploadReq = this.fileService.uploadFileWithProgress(formData, directoryInput || undefined, isPublic, this.user?.id, compress);
        if (uploadReq) {
          uploadReq.subscribe({
            next: async (event) => {
              if (event.type === HttpEventType.UploadProgress) {
                this.uploadProgress[file.name] = Math.round(100 * (event.loaded / event.total!));
              }
              else if (event.type === HttpEventType.Response) {
                this.handleUploadedFile(event, filesArray);
              }
            },
            error: (error) => {
              console.error(`Error uploading ${file.name}:`, error);
              this.lastFileUploadedCheck(filesArray, this.uploadedFileList.length);
            }
          });
        }
      });
    } catch (ex) {
      console.log(ex);
      this.userNotificationEvent.emit((ex as Error).message);
    }
  }

  private handleUploadedFile(event: any, filesArray: File[]) {
    const parsedFiles = (JSON.parse(event.body) as FileEntry[]);
    // API returns an array but we subscribe per original file; take first match for progress association
    if (parsedFiles && parsedFiles.length > 0) {
      const first = parsedFiles[0];
      this.uploadedFileList.push(first);
      if (first.isDuplicate) {
        this.duplicateFileNames.push(first.fileName || first.givenFileName || '');
      }
    }
    if (this.fileUploadTopics.length > 0) {
      const id = parsedFiles && parsedFiles.length > 0 ? parsedFiles[0].id : 0;
      const tmpFileEntry = new FileEntry(id);
      this.fileService.editTopics(this.inputtedParentRef?.user ?? new User(0, "Anonymous"), tmpFileEntry, this.fileUploadTopics);
    }
    this.lastFileUploadedCheck(filesArray, this.uploadedFileList.length);
  }

  private lastFileUploadedCheck(filesArray: File[], index: number) {
    if (filesArray.length == index) {
      if (this.fileUploadTopics.length > 0) { 
        this.uploadedFileList.forEach(x => {
          x.topics = this.fileUploadTopics;
        });
      }

      if (this.user?.id && this.currentDirectory.toLowerCase().includes("meme")) {
        this.fileService.notifyFollowersFileUploaded(this.user.id, this.uploadedFileList[0].id, this.uploadedFileList.length); 
      }
      this.userUploadFinishedEvent.emit(this.uploadedFileList);
      this.userNotificationEvent.emit(`Finished uploading ${this.uploadedFileList.length} files.`);

      if (this.duplicateFileNames.length > 0) {
        this.userNotificationEvent.emit(`Skipped duplicates: ${this.duplicateFileNames.join(', ')}`);
      }

      this.uploadProgress = {};
      this.isUploading = false;
      this.uploadFileList = [];
      this.uploadedFileList = [];
      this.fileInput.nativeElement.value = '';
      this.displayListContainer = false;

      this.fileUploadTopics = [];
  this.duplicateFileNames = [];
      if (this.inputtedParentRef) {
        this.inputtedParentRef.closeOverlay();
      }
    }
  }

  getOverallProgress(): number {
    if (this.uploadFileList.length === 0) return 0;
    this.totalProgress = Object.values(this.uploadProgress).reduce((sum, progress) => sum + progress, 0);
    return this.totalProgress = Math.round(this.totalProgress / this.uploadFileList.length);
  }
  onTopicAdded(topics: Topic[]) { 
    this.fileUploadTopics = topics;
    this.preventDisplayClose = true;
    setTimeout(() => {
      if (this.inputtedParentRef) {
        this.inputtedParentRef.showOverlay();
      }
      setTimeout(() => { this.preventDisplayClose = false }, 1000);
    }, 50);
  }
  manualFinalizeClose() {
    // Close overlay without cancelling; final completion logic will still run
    this.displayListContainer = false;
    if (this.inputtedParentRef) {
      this.inputtedParentRef.closeOverlay();
    }
  }
}
