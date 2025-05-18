import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { Topic } from '../../services/datacontracts/topics/topic';
import { TopService } from '../../services/top.service';

@Component({
  selector: 'app-top',
  standalone: false,
  templateUrl: './top.component.html',
  styleUrl: './top.component.css'
})
export class TopComponent extends ChildComponent implements OnInit {
  @ViewChild('categoryInput') categoryInput!: ElementRef<HTMLInputElement>;
  @ViewChild('titleInput') titleInput!: ElementRef<HTMLInputElement>;
  @ViewChild('urlInput') urlInput!: ElementRef<HTMLInputElement>;
  topicInputted?: Topic[];
  topEntries: any[] = []; // Changed to array for better typing
  errorMessage: string | null = null;

  constructor(private topService: TopService) {
    super();
  }

  ngOnInit() {
    this.loadTopEntries();
  }

  loadTopEntries() {
    this.startLoading();
    this.errorMessage = null;

    this.topService.getTop().then(
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
    this.topicInputted = topic;
  }

  addToTop() {
    if (!this.topicInputted) return alert("You must select a topic!");
    if (!this.titleInput.nativeElement.value.trim()) return alert("Title is required!");

    this.topService.addEntryToCategory(
      this.topicInputted,
      this.titleInput.nativeElement.value,
      this.urlInput.nativeElement.value,
      this.parentRef?.user?.id ?? 0
    ).then(
      (res) => {
        this.parentRef?.showNotification(res.message);
        this.titleInput.nativeElement.value = '';
        this.urlInput.nativeElement.value = '';
        this.loadTopEntries(); // Refresh the list after adding
      },
      (err) => {
        this.parentRef?.showNotification('Failed to add entry');
        console.error(err);
      }
    );
  }
}