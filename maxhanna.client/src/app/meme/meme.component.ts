import { Component, Input, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component'; 
import { ActivatedRoute } from '@angular/router'; 
import { FileSearchComponent } from '../file-search/file-search.component';
import { FileEntry } from '../../services/datacontracts/file/file-entry';

@Component({
  selector: 'app-meme',
  templateUrl: './meme.component.html',
  styleUrls: ['./meme.component.css']
})
export class MemeComponent extends ChildComponent  { 
  notifications: string[] = [];
  isUploadingInProcess = false;
  currentMemePage = 1;
  iPhone = /iPad|iPhone|iPod/.test(navigator.userAgent);

  @ViewChild(FileSearchComponent) fileSearchComponent!: FileSearchComponent;

  @Input() memeId: string | null = null;
  constructor(private route: ActivatedRoute) {
    super();
    this.route.paramMap.subscribe(params => {
      this.memeId = params.get('memeId');
    }); 
  } 
   
  uploadFinished(files: FileEntry[]) { 
    this.fileSearchComponent.handleUploadedFiles(files); 
  }
  uploadNotification(event: string) {
    this.notifications.push(event); 
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
