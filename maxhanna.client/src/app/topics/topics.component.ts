import { Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { TopicService } from '../../services/topic.service';
import { Topic } from '../../services/datacontracts/topics/topic'; 
import { AppComponent } from '../app.component';
import { User } from '../../services/datacontracts/user/user';
import { ChildComponent } from '../child.component';

@Component({
  selector: 'app-topics',
  templateUrl: './topics.component.html',
  styleUrl: './topics.component.css'
})
export class TopicsComponent extends ChildComponent {
  @Input() user: User | undefined;
  @Input() parent: AppComponent | undefined;
  @Input() attachedTopics: Topic[] | undefined;
  @Input() isDropdown: boolean = false;
  @Input() preventClosingOverlay: boolean = false;
  @Output() topicAdded = new EventEmitter<Topic[]>();
  @ViewChild('newTopic') newTopic!: ElementRef<HTMLInputElement>;
  @ViewChild('addTopicButton') addTopicButton!: ElementRef<HTMLButtonElement>;

  showAddTopicButton = false; 
  matchingTopics: Topic[] = [];
  isDropdownShowing = false;
  private searchTimer: any;

  constructor(private topicService: TopicService) {
    super(); 
  }
   
  async addTopic() {
    if (!this.user || !parent) { return alert("Must be logged in to add a topic!"); }

    const addedTopic = this.newTopic.nativeElement.value.trim();

    if (addedTopic !== '') {
      this.newTopic.nativeElement.value = ''; 
      const tmpTopic = await this.topicService.addTopic(this.user ?? this.parent?.user, new Topic(0, addedTopic));
      if (!this.attachedTopics) {
        this.attachedTopics = []; // Create array if it doesn't exist
      }
      this.attachedTopics.push(tmpTopic);
      this.topicAdded.emit(this.attachedTopics);
      this.addTopicButton.nativeElement.style.visibility = "hidden"; 
    }
  }
  removeTopic(topic: Topic) {
    this.attachedTopics = this.attachedTopics?.filter(x => x.id != topic.id); 
    this.topicAdded.emit(this.attachedTopics);
  }
  removeAllTopics() {
    this.attachedTopics = [];
    this.topicAdded.emit(this.attachedTopics);
  }


  async searchTopics(enteredValue: string, force: boolean = false) {  
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
     
    this.searchTimer = setTimeout(async () => {
      if (this.addTopicButton) {
        this.addTopicButton.nativeElement.style.visibility = "hidden"; 
      } 
      if (enteredValue.trim() != '' || force) { 
        await this.topicService.getTopics(enteredValue).then(matchingTopics => {
          this.matchingTopics = matchingTopics;
          if (enteredValue.trim() == '') {
            this.showAddTopicButton = false;
          }
          if (this.matchingTopics.length == 0 && enteredValue.trim() != '') {
            this.showAddTopicButton = (this.user || this.parent?.user) ? true : false;
            if (this.showAddTopicButton) {
              setTimeout(() => { this.addTopicButton.nativeElement.style.visibility = "visible"; }, 10)
            }
          } else {
            if (this.matchingTopics.some(x => x.topicText != '' && x.topicText.toLowerCase() == enteredValue.toLowerCase())) {
              this.addTopicButton.nativeElement.style.visibility = "hidden";
            } else if (enteredValue.trim() != '') {
              this.showAddTopicButton = (this.user || this.parent?.user) ? true : false;
              if (this.showAddTopicButton) {
                setTimeout(() => { this.addTopicButton.nativeElement.style.visibility = "visible"; }, 10)
              }
            }
          }
        }); 
      } else {
        this.matchingTopics = [];
        this.showAddTopicButton = false;
      }
      setTimeout(() => {
        if (document.getElementById('dropdownMenu') && document.getElementById('chooseTopicInput')) {
          (document.getElementById('dropdownMenu') as HTMLDivElement).style.top = (document.getElementById('chooseTopicInput') as HTMLInputElement).offsetTop + (document.getElementById('chooseTopicInput') as HTMLInputElement).offsetHeight + "px";

          if (this.parent) {
            this.parent.showOverlay = true;
            this.isDropdownShowing = true;
          }
          
        }
       
      }, 10); 
    }, 100);
  } 

  selectTopic(topic: Topic) {
    console.log(topic);
    if (this.attachedTopics?.some(x => x.topicText.toLowerCase() == topic.topicText.toLowerCase())) return;
    if (!this.attachedTopics) {
      this.attachedTopics = [];
    }

    if (!this.attachedTopics.includes(topic)) { 
      this.attachedTopics.push(topic);
    }
     
    console.log("emitting ", this.attachedTopics);
    this.topicAdded.emit(this.attachedTopics);
    this.newTopic.nativeElement.value = '';
    this.matchingTopics = [];
    if (this.addTopicButton) {
      this.addTopicButton.nativeElement.style.visibility = "hidden"; 
    }
    if (this.parent?.showOverlay && !this.preventClosingOverlay) {
      this.parent.closeOverlay();
      this.isDropdownShowing = false;
    }
  }
  searchInputClick() {
    if (this.isDropdown) {
      if (this.newTopic && this.newTopic.nativeElement.value.trim() != '') { 
        this.searchTopics(this.newTopic.nativeElement.value.trim(), true);
      } else {
        this.searchTopics('', true);
        this.showAddTopicButton = false;
      }
    }
  }
  clearSearch() { 
    this.newTopic.nativeElement.value = "";
    this.matchingTopics = [];
    this.showAddTopicButton = false;
  }
  cancelSearch(timeout?: number) {
    setTimeout(() => {
      this.clearSearch();
      this.isDropdownShowing = false;
}, timeout ?? 0);
  }
}
