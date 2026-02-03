import { OnInit, Component, ElementRef, Input, ViewChild, OnDestroy } from '@angular/core';
import { ChildComponent } from '../child.component'; 
import { ActivatedRoute } from '@angular/router'; 
import { FileSearchComponent } from '../file-search/file-search.component';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { TopicRank } from '../../services/datacontracts/topics/topic-rank'; 
import { TopicService } from '../../services/topic.service';
import { Topic } from '../../services/datacontracts/topics/topic';
import { UserService } from '../../services/user.service';

@Component({
    selector: 'app-meme',
    templateUrl: './meme.component.html',
    styleUrl: './meme.component.css',
    standalone: false
})
export class MemeComponent extends ChildComponent implements OnInit, OnDestroy  { 
  notifications: string[] = [];
  topTopics: TopicRank[] = [];  
  isMenuPanelOpen = false;
  currentMemePage = 1;
  searchTerms = "";
  // NSFW setting now delegated to fileSearchComponent.isDisplayingNSFW
  iPhone = /iPad|iPhone|iPod/.test(navigator.userAgent);

  @ViewChild(FileSearchComponent) fileSearchComponent!: FileSearchComponent;
  @ViewChild('nsfwCheckmark') nsfwCheckmark!: ElementRef<HTMLInputElement>;

  @Input() memeId?: number | undefined = undefined;
  
  constructor(private route: ActivatedRoute, private topicService: TopicService, private userService: UserService) {
    super();
    this.route.paramMap.subscribe((params: any) => {
      this.memeId = +params.get('memeId');
    });
    this.topicService.getTopFileTopics().then(res => { if (res) { this.topTopics = res; } }); 
  }

  ngOnInit() {
    this.parentRef?.addResizeListener();
  }
  ngOnDestroy() {
    this.parentRef?.removeResizeListener();
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
  }
  closeMenuPanel() {
    this.isMenuPanelOpen = false;
    if (this.parentRef) {
      this.parentRef.closeOverlay();
    }
  } 
  topTopicClicked(topic: TopicRank) {
    this.closeMenuPanel();
    this.fileSearchComponent.searchTerms = "";
    this.fileSearchComponent.searchFiles(topic.topicName);
  } 
  onLoadMoreInView(isInView: boolean) {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      if (isInView && this.fileSearchComponent.currentPage < this.fileSearchComponent.totalPages) {
        this.fileSearchComponent.appendNextPage();
      }
    }, 500); 
    
  }
}
