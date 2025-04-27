import { Component, ElementRef, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { Topic } from '../../services/datacontracts/topics/topic';

@Component({
  selector: 'app-top',
  standalone: false,
  templateUrl: './top.component.html',
  styleUrl: './top.component.css'
})
export class TopComponent extends ChildComponent { 
  @ViewChild('categoryInput') categoryInput!: ElementRef<HTMLInputElement>;
  topicInputted?: Topic;
  
  onTopicAdded(topic: Topic[]) {
    this.topicInputted = topic[0];
  }
}
