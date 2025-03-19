import { Component, ElementRef, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
 import { FileService } from '../../services/file.service'; 
import { FileSearchComponent } from '../file-search/file-search.component';
import { User } from '../../services/datacontracts/user/user';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { TopicRank } from '../../services/datacontracts/topics/topic-rank';
import { TopicService } from '../../services/topic.service';
  
@Component({
  selector: 'app-file',
  templateUrl: './file.component.html',
  styleUrls: ['./file.component.css']
})
export class FileComponent extends ChildComponent implements OnInit, OnDestroy {
  constructor(private fileService: FileService, private topicService: TopicService) {
    super(); 
    this.topicService.getTopFileTopics().then(res => { if (res) { this.topTopics = res; } });
  }
  fS = "/"; 
  errorMessage: string | null = null;
  thumbnailSrc: string | null = null;
  thumbnailFileName: string | null = null;
  showThumbnail: boolean = false;
  showUpFolderRow: boolean = true;
  draggedFilename: string | undefined;
  destinationFilename: string | undefined; 
  showMakeDirectoryPrompt = false;
  currentDirectory = '';
  isUploadInitiate = false;
  isMenuPanelOpen = false;
  uploadFileList: Array<File> = []; 
  isSharePanelExpanded = false;
  fileBeingShared = 0;
  filter = {
    visibility: 'all',
    ownership: 'all'
  };
  createVisibility = 'public';
  searchHidden = 'unhidden';
  uploadProgress: number = 0;
  showUploadPrivacySelection = false;
  videoFileExtensions = ["mp4", "mov", "avi", "wmv", "webm", "flv"];
  loading = false;
  selectedThumbnailFileExtension = "";
  selectedThumbnail = "";
  selectedFileType = "";
  abortThumbnailRequestController: AbortController | null = null;
  topTopics: TopicRank[] = []; 

  @Input() user?: User;
  @Input() fileId: string | null = null;

  @ViewChild('directoryInput') directoryInput!: ElementRef<HTMLInputElement>;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('folderVisibility') folderVisibility!: ElementRef<HTMLSelectElement>;
  @ViewChild('hiddenVisibility') hiddenVisibility!: ElementRef<HTMLSelectElement>;
  @ViewChild('makeFolderName') makeFolderName!: ElementRef<HTMLInputElement>;
  @ViewChild('thumbnailContainer', { static: false }) thumbnailContainer!: ElementRef;
  @ViewChild(FileSearchComponent) fileSearchComponent!: FileSearchComponent;


  async ngOnInit() {
    this.draggedFilename = undefined;
    this.destinationFilename = undefined;
    this.showMakeDirectoryPrompt = false;
    this.isSharePanelExpanded = false;
    this.parentRef?.addResizeListener();
  }
  ngOnDestroy() {
    this.parentRef?.removeResizeListener();
  }
  uploadFinished(newFiles: FileEntry[]) { 
    this.fileSearchComponent.handleUploadedFiles(newFiles.flatMap(fileArray => fileArray));  
  }
  async shareFile(userToShareWith?: User) {
    if (!userToShareWith) return;
    try {
      await this.fileService.shareFile(this.parentRef?.user!, userToShareWith, this.fileBeingShared);
      this.fileBeingShared = 0;
      this.isSharePanelExpanded = false;
      this.parentRef?.showNotification("File sharing has succeeded."); 
    } catch {
      this.parentRef?.showNotification("File sharing has failed."); 
    }
  }

  shareFileOpenUser(fileId: number) {
    this.fileBeingShared = fileId;
  }
  changeDirectoryEvent(event: string) {
    this.currentDirectory = event; 
  } 
  uploadNotification(event: string) {
    if (event != '0' && this.parentRef) {
      this.parentRef.showNotification(event);
    }
  }
  uploadInitiate() { 
    this.showMakeDirectoryPrompt = false;
    this.isUploadInitiate = true;
    if (this.fileInput && this.fileInput.nativeElement && this.fileInput.nativeElement.files) {
      this.uploadFileList = Array.from(this.fileInput.nativeElement.files as FileList);
    }
  }
  cancelMakeDirectoryOrFile() {
    this.showMakeDirectoryPrompt = false;
    this.isUploadInitiate = false;
    if (this.fileInput)
      this.fileInput.nativeElement.value = '';
    this.uploadFileList = []; 
  }
  createVisibilityOnChange() {
    this.createVisibility = this.folderVisibility.nativeElement.value;
  } 

  getFileExtension(filePath: string) {
    return filePath.split('.').pop();
  }
   
  setThumbnailSrc(url: string) {
    if (this.thumbnailContainer && this.thumbnailContainer.nativeElement) {
      this.thumbnailContainer.nativeElement.src = url;
    }
  } 

  
  async makeDirectory() { 
    const choice = this.makeFolderName.nativeElement.value;
    if (!choice || choice == "") {
      return alert("Folder name cannot be empty!");
    }

    const isPublic = this.createVisibility.toLowerCase() == "public" ? true : false;

    const directoryValue = this.currentDirectory ?? "";
    let target = directoryValue.replace(/\\/g, "/");
    target += (directoryValue.length > 0 && directoryValue[directoryValue.length - 1] === this.fS) ? choice : directoryValue.length > 0 ? this.fS + choice : choice;

    if (confirm(`Create directory : ${target} ?`)) { 
      this.startLoading();
      try {
        const res = await this.fileService.createDirectory(this.parentRef?.user!, target, isPublic);
        this.parentRef?.showNotification("Created folder " + target);  

        if (!res?.toLowerCase().includes("already exists")) {
          this.cancelMakeDirectoryOrFile();
          let tmpFileEntry =
            new FileEntry(parseInt(res!), choice, directoryValue, this.createVisibility.toLowerCase(), "",
              this.parentRef?.user!, true, [], new Date(), 0, "", [], undefined);
          this.uploadFinished([tmpFileEntry]);
        }
      } catch (ex) {
        console.error(ex);
      }

      this.stopLoading();
    }
  } 
  canUploadToFolder() { 
    return !this.showMakeDirectoryPrompt && !(this.currentDirectory == '' && this.parentRef?.user?.id != 1) && !(this.currentDirectory == 'Users/');
  }
  showMenuPanel() {
    if (this.isMenuPanelOpen) {
      this.closeMenuPanel();
      return;
    }
    this.isMenuPanelOpen = true;
    if (this.parentRef) {
      this.parentRef.showOverlay();
    } 
  }
  closeMenuPanel() {
    this.isMenuPanelOpen = false;
    if (this.parentRef) {
      this.parentRef.closeOverlay();
    }
  }
  topTopicClicked(topic: TopicRank) {
    this.closeMenuPanel();
    this.fileSearchComponent.searchFiles(topic.topicName);
  }
}
