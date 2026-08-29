import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnInit } from '@angular/core';
import { Todo } from '../../services/datacontracts/todo';
import { TodoService } from '../../services/todo.service';
import { AppComponent } from '../app.component';

@Component({
  selector: 'app-movies-added-today',
  templateUrl: './movies-added-today.component.html',
  styleUrl: './movies-added-today.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class MoviesAddedTodayComponent implements OnInit {
  @Input() inputtedParentRef?: AppComponent;
  movies: Todo[] = [];
  isLoading = true;

  constructor(private todoService: TodoService, private cdr: ChangeDetectorRef) {}

  async ngOnInit(): Promise<void> {
    try {
      this.movies = (await this.todoService.getTodayMovies()) ?? [];
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  trackByMovie(_index: number, movie: Todo): number | string {
    return movie.id ?? movie.url ?? _index;
  }
}
