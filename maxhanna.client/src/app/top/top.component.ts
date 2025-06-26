import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { Topic } from '../../services/datacontracts/topics/topic';
import { TopService } from '../../services/top.service';
import { MetaData } from '../../services/datacontracts/social/story';
import { TopicService } from '../../services/topic.service';
import { TopicsComponent } from '../topics/topics.component'; 

@Component({
  selector: 'app-top',
  standalone: false,
  templateUrl: './top.component.html',
  styleUrl: './top.component.css'
})
export class TopComponent extends ChildComponent implements OnInit {
  @ViewChild('topicComponent') topicComponent!: TopicsComponent;
  @ViewChild('categoryInput') categoryInput!: ElementRef<HTMLInputElement>;
  @ViewChild('titleInput') titleInput!: ElementRef<HTMLInputElement>;
  @ViewChild('urlInput') urlInput!: ElementRef<HTMLInputElement>;
  @ViewChild('textInput') textInput!: ElementRef<HTMLInputElement>; 
  @ViewChild('titleEditInput') titleEditInput!: ElementRef<HTMLInputElement>;
  @ViewChild('urlEditInput') urlEditInput!: ElementRef<HTMLInputElement>;
  @ViewChild('textEditInput') textEditInput!: ElementRef<HTMLInputElement>; 

  topicInputted?: Topic[];
  topEntries: any[] = []; // Changed to array for better typing
  errorMessage: string | null = null;
  editingEntry?: any;
  isEditPanelOpen = false;
  isSearchingUrl = false; 
  isSearchingUrlForEdit = false;
  isMenuPanelOpen = false;
  isVoterPanelOpen = false;
  selectedTopEntry?: any = undefined;
  topCategories?:any = undefined;

  constructor(private topService: TopService, private topicService: TopicService) {
    super();
  } 

  ngOnInit() {
    console.log("init");
    const topicsFromUrl = this.getTopicsFromUrl();

    if (topicsFromUrl.length > 0) {
      console.log("Processing topics from URL:", topicsFromUrl);
      setTimeout(() => {
        this.processUrlTopics(topicsFromUrl).then(() => {
          console.log("Topics processed from URL");
        });
      }, 50); 
    } else {
      console.log("No topics in URL, loading default entries");
      this.loadTopEntries();
    }
    this.topService.getTopCategories().then((res: any) => {
      if (res) {
        this.topCategories = res;
      }
    });

  }

  private getTopicsFromUrl(): string[] {
    try {
      // Get the full URL
      const url = window.location.href;

      // Extract the query string part
      const queryString = url.split('?')[1];
      if (!queryString) return [];

      // Parse the query parameters
      const urlParams = new URLSearchParams(queryString);
      const topicsParam = urlParams.get('topics');

      if (topicsParam) {
        return topicsParam.split(',').map(topic => topic.trim()).filter(topic => topic.length > 0);
      }
      return [];
    } catch (error) {
      console.error("Error parsing URL:", error);
      return [];
    }
  }

  private async processUrlTopics(topics: string[]): Promise<void> {
    if (!this.topicComponent) {
      console.warn("Topic component not available yet");
      return;
    }

    for (const topic of topics) {
      if (!this.topicComponent.attachedTopics?.find(x => x.topicText === topic)) {
        try {
          const res = await this.topicService.getTopics(topic, this.parentRef?.user);
          if (res && res.length > 0) {
            this.topicComponent.selectTopic(res[0]);
          }
        } catch (error) {
          console.error(`Error loading topic ${topic}:`, error);
        }
      }
    }

    // After processing all topics, load the entries
    this.loadTopEntries();
  }

  loadTopEntries() {
    this.startLoading();
    this.errorMessage = null;

    this.topService.getTop(this.topicInputted).then(
      (res) => {
        this.topEntries = res || [];
        this.stopLoading();
      },
      (err) => {
        this.errorMessage = 'Failed to load top entries';
        this.stopLoading();
        console.error(err);
      }
    );
  }

  onTopicAdded(topic: Topic[]) {
    console.log(topic);
    this.topicInputted = topic;
    this.loadTopEntries();
  }
  addToTop() {
    if (!this.topicInputted) return alert("You must select a topic!");
    if (!this.titleInput.nativeElement.value.trim()) return alert("Title is required!");

    this.topService.addEntryToCategory(
      this.topicInputted,
      this.titleInput.nativeElement.value,
      this.urlInput.nativeElement.value,
      this.textInput.nativeElement.value,
      this.parentRef?.user?.id ?? 0
    ).then(
      (res) => {
        this.parentRef?.showNotification(res.message);
        this.titleInput.nativeElement.value = '';
        this.urlInput.nativeElement.value = '';
        this.textInput.nativeElement.value = '';
        this.loadTopEntries(); // Refresh the list after adding
      },
      (err) => {
        this.parentRef?.showNotification('Failed to add entry');
        console.error(err);
      }
    );
  }

  upvote(entry: any) {
    this.topService.vote(entry.id, this.parentRef?.user?.id ?? 0, true).then(res => {
      if (res.success) {
        this.parentRef?.showNotification("Voted successfully"); 
        this.loadTopEntries();
      } else {
        this.parentRef?.showNotification("Error, please try again");
      }
    });
  }
  downvote(entry: any){
    this.topService.vote(entry.id, this.parentRef?.user?.id ?? 0, false).then(res => {
      if (res.success) {
        this.parentRef?.showNotification("Voted successfully");
        this.loadTopEntries();
      } else {
        this.parentRef?.showNotification("Error, please try again");
      }
    });
  }
  edit(entry: any) {
    this.isEditPanelOpen = true;
    this.editingEntry = entry;
    this.parentRef?.showOverlay();
  }
  closeEditPanel() {
    this.isEditPanelOpen = false;
    this.editingEntry = undefined;
    this.parentRef?.closeOverlay();
  }
  editTop() {
    this.topService.editTop(
      this.editingEntry.id,
      this.titleEditInput.nativeElement.value,
      this.urlEditInput.nativeElement.value,
      this.textEditInput.nativeElement.value,
    ).then(res => {
      if (res.message) {
        this.parentRef?.showNotification(res.message);
      }
      if (res.success) {
        this.loadTopEntries();
        this.closeEditPanel();
      }
    })
  }
  searchUrl(){
    if (this.urlInput.nativeElement.value) { 
      this.isSearchingUrl = true;
    }
  }
  searchUrlForEdit() { 
    if (this.urlEditInput.nativeElement.value) { 
      this.isSearchingUrlForEdit = true;
    }
  }
  
  urlSelectedEvent(meta: MetaData) { 
    if (this.isSearchingUrlForEdit) { 
      this.urlEditInput.nativeElement.value = meta.url ?? "";
      this.isSearchingUrlForEdit = false;
    } else { 
      this.urlInput.nativeElement.value = meta.url ?? "";
      this.isSearchingUrl = false; 
    }
  }
  closeSearchPanel() {
    if (this.isSearchingUrlForEdit) {
      this.isSearchingUrlForEdit = false;
    } else {
      this.isSearchingUrl = false;
    }
  }
  closeSearchEvent() {
    if (this.isSearchingUrlForEdit) {
      this.isSearchingUrlForEdit = false;
    } else {
      this.isSearchingUrl = false;
    }
  } 
  
  getCategories(categoryString: string): string[] {
    if (!categoryString) return [];
    return categoryString.split(',');
  }
  addClickedTopic(category: string) {
    // Remove any existing topic input
    const trimmedCategory = category.trim();
    console.log('Category clicked:', trimmedCategory); 
    if (!this.topicComponent.attachedTopics?.find(x => x.topicText == trimmedCategory)) {
      this.topicService.getTopics(trimmedCategory, this.parentRef?.user).then(res => {
        if (res) { 
          this.topicComponent.selectTopic(res[0]); 
          setTimeout(() => {
            document.getElementsByClassName("componentMain")[0].scrollTo({
              top: 0,
              behavior: 'smooth'
            });
          }, 50);
        }
      })
    }
  }
  closeMenuPanel() {
    this.parentRef?.closeOverlay();
    this.isMenuPanelOpen = false;
  }
  openMenuPanel() {
    this.parentRef?.showOverlay();
    this.isMenuPanelOpen = true;
  }

  closeVoterPanel() {
    this.parentRef?.closeOverlay();
    this.isVoterPanelOpen = false;
    this.selectedTopEntry = undefined;
  }
  openVoterPanel(topEntry: any) {
    this.selectedTopEntry = topEntry;
    this.parentRef?.showOverlay();
    this.isVoterPanelOpen = true;
  }

  copyLink() {
    const topics = this.topicComponent.attachedTopics;
    const encodedTopics = topics?.map(topic => encodeURIComponent(topic.topicText)).join(','); 
    const link = `https://bughosted.com/Top` + (encodedTopics ? `?topics=${encodedTopics}` : '');

    try {
      navigator.clipboard.writeText(link);
      this.parentRef?.showNotification("Link copied to clipboard!");
    } catch {
      this.parentRef?.showNotification("Error: Unable to share link!");
    }
  }
}