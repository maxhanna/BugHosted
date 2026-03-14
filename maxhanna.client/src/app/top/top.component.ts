import { ChangeDetectorRef, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { Topic } from '../../services/datacontracts/topics/topic';
import { TopService } from '../../services/top.service';
import { MetaData } from '../../services/datacontracts/social/story';
import { TopicService } from '../../services/topic.service';
import { TopicsComponent } from '../topics/topics.component';
import { MediaSelectorComponent } from '../media-selector/media-selector.component';

@Component({
  selector: 'app-top',
  standalone: false,
  templateUrl: './top.component.html',
  styleUrl: './top.component.css'
})
export class TopComponent extends ChildComponent implements OnInit {
  @ViewChild('topicComponent') topicComponent!: TopicsComponent;
  @ViewChild('editFileSelector') editFileSelector!: MediaSelectorComponent;
  @ViewChild('fileSelector') fileSelector!: MediaSelectorComponent;
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
  topCategories?: any = undefined;
  expandedFileId?: number;
  expandedImageUrl?: string;
  isPictureOverlayOpen = false;

  constructor(private topService: TopService, private topicService: TopicService, private cd: ChangeDetectorRef) {
    super();
  }

  async ngOnInit() { 
    this.startLoading();
    const topicsFromUrl = this.getTopicsFromUrl(); 
    if (topicsFromUrl.length > 0) {
      setTimeout(async () => {
        await this.processUrlTopics(topicsFromUrl);
      }, 50);
    } else {
      this.loadTopEntries();
    }
    await this.topService.getTopCategories().then((res: any) => {
      if (res) {
        this.topCategories = res;
      }
    }); 
    this.stopLoading();
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

  async loadTopEntries() {
    this.startLoading();
    this.errorMessage = null;

    await this.topService.getTop(this.topicInputted).then(
      (res) => {
        this.topEntries = res || [];
        setTimeout(() => {
          document.getElementsByClassName("componentMain")[0].scrollTo({
            top: 0,
            behavior: 'smooth'
          });
        }, 50);
        this.stopLoading();
      },
      (err) => {
        this.errorMessage = 'Failed to load top entries';
        this.stopLoading();
        console.error(err);
      }
    );
  }

  async onTopicAdded(topics: Topic[]) {
    this.topicInputted = topics;  
    console.log(topics, this.topicInputted);
    setTimeout(async () => { await this.loadTopEntries(); }, 50);
  }

  async addToTop() {
    if (!this.topicInputted) return alert("You must select a topic!");
    if (!this.titleInput.nativeElement.value.trim()) return alert("Title is required!");
    this.startLoading();
    await this.topService.addEntryToCategory(
      this.topicInputted,
      this.titleInput.nativeElement.value,
      this.urlInput.nativeElement.value,
      this.textInput.nativeElement.value,
      this.fileSelector?.selectedFiles[0]?.id,
      this.parentRef?.user?.id ?? 0
    ).then(
      async (res) => {
        this.parentRef?.showNotification(res.message);
        this.titleInput.nativeElement.value = '';
        this.urlInput.nativeElement.value = '';
        this.textInput.nativeElement.value = '';
        this.fileSelector?.removeAllFiles();
        await this.loadTopEntries(); // Refresh the list after adding
      },
      (err) => {
        this.parentRef?.showNotification('Failed to add entry');
        console.error(err);
      }
    );
    this.stopLoading();
  }

  async upvote(entry: any) {
    this.startLoading();
    await this.topService.vote(entry.id, this.parentRef?.user?.id ?? 0, true).then(async res => {
      if (res.success) {
        this.parentRef?.showNotification("Voted successfully");
        await this.loadTopEntries();
      } else {
        this.parentRef?.showNotification("Error, please try again");
      }
    });
    this.stopLoading();
  }
  async downvote(entry: any) {
    this.startLoading();
    await this.topService.vote(entry.id, this.parentRef?.user?.id ?? 0, false).then(async res => {
      if (res.success) {
        this.parentRef?.showNotification("Voted successfully");
        await this.loadTopEntries();
      } else {
        this.parentRef?.showNotification("Error, please try again");
      }
    });
    this.stopLoading();
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
    this.isSearchingUrlForEdit = false;
  }
  async editTop() {
    this.startLoading();
    await this.topService.editTop(
      this.editingEntry.id,
      this.titleEditInput.nativeElement.value,
      this.urlEditInput.nativeElement.value,
      this.textEditInput.nativeElement.value,
      this.editFileSelector.selectedFiles[0]?.id
    ).then(async res => {
      if (res.message) {
        this.parentRef?.showNotification(res.message);
      }
      if (res.success) {
        await this.loadTopEntries();
        this.closeEditPanel();
        this.editFileSelector.removeAllFiles();
        this.titleEditInput.nativeElement.value = '';
        this.urlEditInput.nativeElement.value = '';
        this.textEditInput.nativeElement.value = '';
      }
    })
    this.stopLoading();
  }
  searchUrl() {
    if (this.urlInput.nativeElement.value) {
      this.isSearchingUrl = true;
      this.parentRef?.showOverlay();
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
      this.parentRef?.closeOverlay();
    }
  }
  closeSearchPanel() {
    if (this.isSearchingUrlForEdit) {
      this.isSearchingUrlForEdit = false;
    } else {
      this.isSearchingUrl = false;
      this.parentRef?.closeOverlay();
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
  async addClickedTopic(category: string) {
    this.startLoading();
    const trimmedCategory = category.trim();
    if (!this.topicComponent.attachedTopics?.find(x => x.topicText == trimmedCategory)) {
      await this.topicService.getTopics(trimmedCategory, this.parentRef?.user).then(async res => {
        if (res) {
          await this.onTopicAdded(res);
        }
      })
    }
    this.stopLoading();
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
  expandPictureEvent(event: any) {
    if (event?.id) {
      this.expandedFileId = event.id;
      this.expandedImageUrl = undefined;
    } else if (event?.imgUrl) {
      this.expandedImageUrl = event.imgUrl;
      this.expandedFileId = undefined;
    } else if (typeof event === 'string') {
      this.expandedImageUrl = event;
      this.expandedFileId = undefined;
    }
    this.isPictureOverlayOpen = true;
    this.parentRef?.showOverlay(); // Optional
  }
  closePictureOverlay() {
    this.isPictureOverlayOpen = false;
    this.expandedFileId = undefined;
    this.expandedImageUrl = undefined;
    this.parentRef?.closeOverlay(); // Optional
  }
  onUrlInputChange(event: Event) {
    this.cd.detectChanges();
  }
}