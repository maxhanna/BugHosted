import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { TopicService } from '../../services/topic.service';
import { Topic } from '../../services/datacontracts/topic';
import { User } from '../../services/datacontracts/user';
import { AppComponent } from '../app.component';

@Component({
  selector: 'app-topics',
  templateUrl: './topics.component.html',
  styleUrl: './topics.component.css'
})
export class TopicsComponent {
  @Input() user: User | undefined;
  @Input() parent: AppComponent | undefined;
  @Output() topicAdded = new EventEmitter<Topic[]>();
  @ViewChild('newTopic') newTopic!: ElementRef<HTMLInputElement>;
  @ViewChild('addTopicButton') addTopicButton!: ElementRef<HTMLButtonElement>;

  
  topics: Topic[] = [];
  matchingTopics: Topic[] = [];

  constructor(private topicService: TopicService) { }

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
  async searchTopics(enteredValue: string) {
    this.addTopicButton.nativeElement.style.visibility = "hidden";

    const debouncedSearch = this.debounce(this.topicService.getTopics, 500);
    if (enteredValue.trim() != '') {
      const res = await debouncedSearch(enteredValue);
      this.matchingTopics = res;

      if (this.matchingTopics.length == 0) {
        this.addTopicButton.nativeElement.style.visibility = "visible";
      }
      else {
        if (this.matchingTopics.filter(x => x.topicText.toLowerCase() == enteredValue.toLowerCase()).length > 0) {
          this.addTopicButton.nativeElement.style.visibility = "hidden";
        }
        else {
          this.addTopicButton.nativeElement.style.visibility = "visible";
        }
      }
    }
    else
    {
      this.matchingTopics = []; // Clear the list if input is empty 
    } 
  }

  debounce(func: Function, delay: number): (...args: any[]) => Promise<Topic[]> {
    let timeoutId: NodeJS.Timeout;
    return (...args: any[]) => {
      return new Promise(resolve => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(async () => {
          const result = await func.apply(this, args);
          resolve(result);
        }, delay);
      });
    };
  }

  selectTopic(topic: Topic) {
    if (this.topics.filter(x => x.topicText.toLowerCase() == topic.topicText.toLowerCase()).length > 0) return; //if the topics selected already contain the topic selected, skip.
    this.topics.push(topic);
    console.log(this.topics);
    this.topicAdded.emit(this.topics);
    this.newTopic.nativeElement.value = '';
    this.matchingTopics = [];
    this.addTopicButton.nativeElement.style.visibility = "hidden";
  }
}
