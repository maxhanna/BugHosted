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
  @Input() attachedTopics?: Topic[] | undefined;
  @Input() isDropdown: boolean = false;
  @Output() topicAdded = new EventEmitter<Topic[]>();
  @ViewChild('newTopic') newTopic!: ElementRef<HTMLInputElement>;
  @ViewChild('addTopicButton') addTopicButton!: ElementRef<HTMLButtonElement>;

  showAddTopicButton = false;
  topics: Topic[] = [];
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
      this.topics.push(tmpTopic);
      this.topicAdded.emit(this.topics);
      this.addTopicButton.nativeElement.style.visibility = "hidden"; 
    }
  }
  removeTopic(topic: Topic) {
    this.topics = this.topics.filter(x => x.id != topic.id); 
    const tmpTopics = this.attachedTopics ? this.topics.concat(this.attachedTopics) : this.topics;
    this.topicAdded.emit(tmpTopics);
  }
  removeAllTopics() {
    this.topics = [];
    this.topicAdded.emit(this.topics);
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
        this.matchingTopics = await this.topicService.getTopics(enteredValue);
        
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
    if (this.topics.some(x => x.topicText.toLowerCase() == topic.topicText.toLowerCase())) return; //if the topics selected already contain the topic selected, skip.
    this.topics.push(topic);
    const tmpTopics = this.attachedTopics ? this.topics.concat(this.attachedTopics) : this.topics;

    this.topicAdded.emit(tmpTopics);
    this.newTopic.nativeElement.value = '';
    this.matchingTopics = [];
    if (this.addTopicButton) {
      this.addTopicButton.nativeElement.style.visibility = "hidden"; 
    }
    if (this.parent?.showOverlay) {
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
  cancelSearch() { 
    this.clearSearch();
    this.isDropdownShowing = false;
  }
}
