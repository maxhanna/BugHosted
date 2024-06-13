import { Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { FileService } from '../../services/file.service';
import { HttpEventType } from '@angular/common/http';
import { FileEntry } from '../../services/datacontracts/file-entry';
import { FileComment } from '../../services/datacontracts/file-comment';
import { MemeService } from '../../services/meme.service';
import { ActivatedRoute } from '@angular/router'; 
import { User } from '../../services/datacontracts/user';
import { DirectoryResults } from '../../services/datacontracts/directory-results';
import { FileSearchComponent } from '../file-search/file-search.component';

@Component({
  selector: 'app-meme',
  templateUrl: './meme.component.html',
  styleUrls: ['./meme.component.css']
})
export class MemeComponent extends ChildComponent implements OnInit { 

  uploadProgress = 0;
  notifications: string[] = [];
  directoryContents: Array<FileEntry> = [];
  selectedMemeFileExtension: string | null = null;
  selectedMemeSrc: any;
  loading: boolean = false;
  isEditing: Array<number> = [];
  openedMemes: Array<number> = [];
  selectedMeme = "";
  videoFileExtensions = ["mp4", "mov", "avi", "wmv", "webm", "flv"];
  comments: FileComment[] = [];
  fileType = "";
  showComments = true;
  isUploadingInProcess = false; 
  @ViewChild(FileSearchComponent) fileSearchComponent!: FileSearchComponent;

  @Input() memeId: string | null = null;
  constructor(private route: ActivatedRoute) { super(); }

  async ngOnInit() {
    this.route.paramMap.subscribe(params => {
      this.memeId = params.get('memeId');
      console.log("memeId: "+ this.memeId);
      if (this.memeId) {
        setTimeout(() => { this.fileSearchComponent.scrollToFile(this.memeId!); }, 2500);
      }
    }); 
  }
   
    
  uploadNotification(event: string) {
    this.notifications.push(event);
    this.ngOnInit();
  }
        
  uploadFileListEvent(event: File[]) {
    this.isUploadingInProcess = event && event.length > 0;
  }
  uploadCancelEvent(isCancelled: boolean) {
    if (isCancelled) {
      this.isUploadingInProcess = false;
    }
  }

   
  clickOnUpload() {
    document.getElementById('fileUploader')!.getElementsByTagName('input')[0].click();
  } 
}
