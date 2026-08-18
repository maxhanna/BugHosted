import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { FileService } from '../../services/file.service';
import { HttpEventType } from '@angular/common/http';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { User } from '../../services/datacontracts/user/user';
import { AppComponent } from '../app.component';
import { Topic } from '../../services/datacontracts/topics/topic';
import { UserEventService } from '../../services/user-event.service';

@Component({
  selector: 'app-file-upload',
  templateUrl: './file-upload.component.html',
  styleUrl: './file-upload.component.css',
  standalone: false
})
export class FileUploadComponent implements AfterViewInit {
  constructor(private fileService: FileService, private userEventService: UserEventService, private cdr: ChangeDetectorRef) { }
  @Input() currentDirectory = '';
  @Input() user?: User;
  @Input() inputtedParentRef?: AppComponent;
  @Input() uploadButtonText: string = '';
  @Input() displayPrivatePublicOption: boolean = true;
  @Input() allowedFileTypes: string = '';
  @Input() maxSelectedFiles: number = 5;
  @Input() displayOptionsAndTopicsButtons: boolean = true;
  @Input() disableFileCompression: boolean = false;

  @Output() userUploadEvent = new EventEmitter<Array<File>>();
  @Output() userUploadFinishedEvent = new EventEmitter<FileEntry[]>();
  @Output() userNotificationEvent = new EventEmitter<string>();
  @Output() userCancelEvent = new EventEmitter<boolean>();

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('compressCheckbox') compressCheckbox!: ElementRef<HTMLInputElement>;
  @ViewChild('fileListContainer') fileListContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('folderVisibility') folderVisibility!: ElementRef<HTMLSelectElement>;

  /** Unique id linking the always-rendered hidden file input to its label,
   *  so multiple uploaders on one page never collide. */
  fileInputId = 'file-input-' + Math.random().toString(36).slice(2, 9);

  showMakeDirectoryPrompt = false;
  uploadFileList: Array<File> = [];
  uploadedFileList: FileEntry[] = [];
  duplicateFileNames: string[] = [];
  duplicatesFound: { [key: string]: boolean; } = {};
  maxFileAttachments: number = this.maxSelectedFiles;
  uploadProgress: { [key: string]: number } = {};
  uploadErrors: { [key: string]: string } = {};
  isUploading: boolean = false;
  nonDupUploadedCount = 0;
  displayListContainer = false;
  displayFileUploadOptions = false;
  displayFileUploadTopics = false;
  totalProgress? = 0;
  fileUploadTopics: Topic[] = [];
  preventDisplayClose = false;
  compressMediaFiles = true;

  /** Effective logged-in user id — from the component input or the parent app.
   *  Anonymous visitors have no id (0/undefined) and must not be offered uploads. */
  get userId(): number {
    const u = this.user ?? this.inputtedParentRef?.user;
    return u?.id ?? 0;
  }

  /** Uploads require a real logged-in user (no more userId 0/undefined). */
  canUpload(): boolean {
    return this.userId > 0;
  }

  ngAfterViewInit() {

    setTimeout(() => {
      if (this.currentDirectory.toLowerCase().includes('art/')) {
        this.displayFileUploadOptions = true;
        if (this.compressCheckbox) {
          this.compressMediaFiles = false;
          this.compressCheckbox.nativeElement.checked = false;
        }
      }
    }, 110);
  }

  async uploadInitiate() {
    if (!this.canUpload()) {
      this.userNotificationEvent.emit('You must be logged in to upload files.');
      return;
    }
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
      // Remove duplicates from the combined list to ensure no duplicate files in uploadFileList
      const uniqueFiles = Array.from(new Set(combined.map(f => f.name))).map(name => combined.find(f => f.name === name)!);
      this.uploadFileList = uniqueFiles.slice(0, this.maxSelectedFiles);
      // Pre-mark duplicates before upload
      this.duplicateFileNames = [];
      await this.checkNames();
      // Track duplicate files

      const tmpDupFilenames = this.duplicatesFound;
      const trueDuplicateNames = Object
        .entries(tmpDupFilenames)
        .filter(([_, isDup]) => isDup)
        .map(([name]) => name);

      const duplicateNames = validFiles
        .filter(f => currentNames.has(f.name))
        .map(f => f.name);
      this.duplicateFileNames = [...trueDuplicateNames, ...duplicateNames];
      // reset the file input so the same file can be selected again if desired
      try { this.fileInput.nativeElement.value = ''; } catch { }
      this.userUploadEvent.emit(this.uploadFileList);
    }
    //console.log("Upload initiated with files:", this.uploadFileList);
    this.cdr.detectChanges();
  }

  cancelFileUpload() {
    this.uploadProgress = {};
    this.uploadErrors = {};
    this.isUploading = false;
    this.uploadFileList = [];
    this.fileInput.nativeElement.value = '';
    this.userCancelEvent.emit(true);
    this.displayListContainer = false;

    if (this.inputtedParentRef) {
      this.inputtedParentRef.closeOverlay();
    }
  }
  /** Opens the native file picker (used by the label's keyboard path). */
  openFilePicker() {
    if (this.canUpload()) {
      this.fileInput?.nativeElement?.click();
    }
  }

  async uploadSubmitClicked() {
    if (!this.canUpload()) {
      this.userNotificationEvent.emit('You must be logged in to upload files.');
      return;
    }
    if (this.uploadFileList.length > this.maxSelectedFiles) {
      alert(`Cannot add more then ${this.maxSelectedFiles} files! Took the first ${this.maxSelectedFiles} files for upload.`);
      this.uploadFileList = this.uploadFileList.slice(0, this.maxSelectedFiles);
    }
    if (this.getOverallProgress() > 0) {
      return;
    }
    if (this.areAllFilesDuplicates()) {
      this.userNotificationEvent.emit('All files are duplicates. No files to upload.');
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

    // Require a real logged-in user AND a valid session token (the encrypted
    // user id) before anything leaves the client.
    const userId = this.userId;
    if (userId <= 0) {
      this.userNotificationEvent.emit('You must be logged in to upload files.');
      return;
    }
    const sessionToken = await this.inputtedParentRef?.getSessionToken() ?? '';
    if (!sessionToken) {
      this.userNotificationEvent.emit('Your session has expired. Please sign in again to upload files.');
      return;
    }

    this.nonDupUploadedCount = 0;
    this.isUploading = true;
    this.displayFileUploadOptions = false;
    this.displayFileUploadTopics = false;

    if (this.inputtedParentRef) {
      this.inputtedParentRef.preventShowSecurityPopup = true;
      this.inputtedParentRef.isUploadingFile = true;
    }

    // Process duplicates first so their FileEntries are ready before upload completes
    for (const dupFile of files.filter(f => this.duplicatesFound[f.name])) {
      this.duplicateFileNames.push(dupFile.name);
      try {
        const isRomFolder = this.currentDirectory.toLowerCase().includes("rom/");
        const tmpFileEntry = await this.fileService.getFileEntryByNameAndDirectory(
          dupFile.name,
          this.currentDirectory.replace(/\\/g, "/"),
          this.inputtedParentRef?.fileCache,
          isRomFolder
        );
        if (tmpFileEntry) {
          this.uploadedFileList.push(tmpFileEntry);
        }
      } catch { }
    }

    const nonDupFiles = files.filter(f => !this.duplicatesFound[f.name]);
    const filesArray = Array.from(nonDupFiles);

    if (filesArray.length === 0) {
      this.lastFileUploadedCheck(filesArray, this.uploadedFileList.length);
      return;
    }

    const isPublic = (this.displayPrivatePublicOption ? this.folderVisibility?.nativeElement.value : true) as boolean;

    const directoryInput = (this.currentDirectory || '').replace(/\/+$/, '');

    try {
      filesArray.forEach((file) => {
        const formData = new FormData();
        formData.append('files', file);
        const compress = (!this.disableFileCompression && this.compressCheckbox?.nativeElement?.checked) ?? true;
        const uploadReq = this.fileService.uploadFileWithProgress(formData, directoryInput || undefined, isPublic, userId, compress, sessionToken);
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
              const msg = error?.error?.message || error?.message || 'Upload failed';
              this.uploadErrors[file.name] = msg;
              this.uploadProgress[file.name] = -1;
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

  private async checkNames() {
    try {
      const fileNames = this.uploadFileList.map(f => f.name);
      const result = await this.fileService.checkNames(this.currentDirectory, fileNames);
      this.duplicatesFound = result || {};
    } catch (error) {
      console.error('Error checking filenames:', error);
      this.duplicatesFound = {};
    }
  }
  isFileLimitReached(): boolean {
    return this.uploadFileList.length >= this.maxFileAttachments;
  }
  areAllFilesDuplicates(): boolean {
    return this.uploadFileList.length > 0 && this.uploadFileList.every(f => this.duplicatesFound[f.name]);
  }

  private async handleUploadedFile(event: any, filesArray: File[]) {
    const parsedFiles = (JSON.parse(event.body) as FileEntry[]);
    // API returns an array but we subscribe per original file; take first match for progress association
    if (parsedFiles && parsedFiles.length > 0) {
      const first = parsedFiles[0];
      this.uploadedFileList.push(first);
      this.nonDupUploadedCount++;
      if (first.isDuplicate) {
        this.duplicateFileNames.push(first.fileName || first.givenFileName || '');
      }
    }
    if (this.fileUploadTopics.length > 0) {
      const id = parsedFiles && parsedFiles.length > 0 ? parsedFiles[0].id : 0;
      const tmpFileEntry = new FileEntry(id);
      await this.fileService.editTopics(this.inputtedParentRef?.user ?? new User(0, "Anonymous"), tmpFileEntry, this.fileUploadTopics);
    }
    await this.lastFileUploadedCheck(filesArray, this.uploadedFileList.length);
  }

  private async lastFileUploadedCheck(filesArray: File[], index: number) {
    const failedCount = Object.keys(this.uploadErrors).length;
    if (filesArray.length == this.nonDupUploadedCount + failedCount) {
      const fileUploadCount = this.uploadedFileList.length;
      if (this.fileUploadTopics.length > 0) {
        this.uploadedFileList.forEach(x => {
          x.topics = this.fileUploadTopics;
        });
      }

      if (this.userId > 0 && this.currentDirectory.toLowerCase().includes("meme")) {
        this.fileService.notifyFollowersFileUploaded(this.userId, this.user?.username ?? this.inputtedParentRef?.user?.username ?? "Anonymous", this.uploadedFileList[0].id, this.uploadedFileList.length);
      }
      this.userUploadFinishedEvent.emit(this.uploadedFileList);
      const msg = `Uploaded ${fileUploadCount} file${fileUploadCount > 1 ? 's' : ''} to ${this.currentDirectory}.`;
      this.userNotificationEvent.emit(msg);
      await this.userEventService.insertUserEvent(this.userId, "file_upload", msg, this.uploadedFileList[0].id);
      if (this.duplicateFileNames.length > 0) {
        this.userNotificationEvent.emit(`Skipped duplicates: ${this.duplicateFileNames.join(', ')}`);
      }

      this.uploadProgress = {};
      this.uploadErrors = {};
      this.isUploading = false;
      this.uploadFileList = [];
      this.uploadedFileList = [];
      this.fileInput.nativeElement.value = '';
      this.displayListContainer = false;
      this.fileUploadTopics = [];
      this.duplicateFileNames = [];
      if (this.inputtedParentRef) {
        this.inputtedParentRef.preventShowSecurityPopup = false;
        this.inputtedParentRef.isUploadingFile = false;
        this.inputtedParentRef.closeOverlay();
      }
    }
  }
  getFileNameClass(file: File): string | undefined {
    let classes = undefined;
    if (this.duplicatesFound[file.name]) {
      classes = "warnText";
    } else {
      const upFile = this.uploadedFileList.find(f => f.fileName === file.name);
      if (upFile?.isDuplicate) {
        classes = "warnText";
      } else if (!upFile?.isDuplicate && this.uploadErrors[file.name]) {
        classes = "redText";
      }
    }
    return classes;
  }
  getOverallProgress(): number {
    if (this.uploadFileList.length === 0) return 0;
    const filesToUpload = this.uploadFileList.filter(f => !this.duplicatesFound[f.name]);
    if (filesToUpload.length === 0) return 0;
    const activeFiles = filesToUpload.filter(f => !this.uploadErrors[f.name]);
    if (activeFiles.length === 0) return 100; // all failed → treat as "done"
    this.totalProgress = activeFiles.reduce((sum, f) => sum + (this.uploadProgress[f.name] || 0), 0);
    return this.totalProgress = Math.round(this.totalProgress / activeFiles.length);
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