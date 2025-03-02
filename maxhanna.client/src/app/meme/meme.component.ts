import { Component, Input, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component'; 
import { ActivatedRoute } from '@angular/router'; 
import { FileSearchComponent } from '../file-search/file-search.component';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { TopicRank } from '../../services/datacontracts/topics/topic-rank'; 
import { TopicService } from '../../services/topic.service';
import { Topic } from '../../services/datacontracts/topics/topic';

@Component({
  selector: 'app-meme',
  templateUrl: './meme.component.html',
  styleUrls: ['./meme.component.css']
})
export class MemeComponent extends ChildComponent  { 
  notifications: string[] = [];
  topTopics: TopicRank[] = [];  
  isMenuPanelOpen = false;
  currentMemePage = 1;
  searchTerms = "";
  iPhone = /iPad|iPhone|iPod/.test(navigator.userAgent);

  @ViewChild(FileSearchComponent) fileSearchComponent!: FileSearchComponent;

  @Input() memeId: string | null = null;
  constructor(private route: ActivatedRoute, private topicService: TopicService) {
    super();
    this.route.paramMap.subscribe(params => {
      this.memeId = params.get('memeId');
    });
    this.topicService.getTopFileTopics().then(res => { if (res) { this.topTopics = res; } });
  } 
   
  uploadFinished(files: FileEntry[]) { 
    this.fileSearchComponent.handleUploadedFiles(files); 
  }
  uploadNotification(event: string) {
    this.parentRef?.showNotification(event);   
  }
        
  uploadFileListEvent(event: File[]) { 
  }
  uploadCancelEvent(isCancelled: boolean) { 
  } 
  clickOnUpload() {
    document.getElementById('fileUploader')!.getElementsByTagName('input')[0].click();
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
    console.log(this.isMenuPanelOpen);
  }
  closeMenuPanel() {
    this.isMenuPanelOpen = false;
    if (this.parentRef) {
      this.parentRef.closeOverlay();
    }
  } 
  topTopicClicked(topic: TopicRank) {
    this.fileSearchComponent.searchFiles(topic.topicName);
  }
}
