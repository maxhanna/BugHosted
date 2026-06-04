import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';

export interface CalendarCard {
  id: string;
  date: string;
  time?: string;
  text: string;
  priority?: string;
  cronExpression?: string;
  project?: string;
  createdAt?: string;
}

@Component({
  selector: 'app-mini-calendar',
  templateUrl: './mini-calendar.component.html',
  styleUrl: './mini-calendar.component.css',
  standalone: false
})
export class MiniCalendarComponent implements OnInit {
  @Input() cards: CalendarCard[] = [];
  @Input() token: string = '';
  @Input() selectedProject: string = '';
  @Output() addCommand = new EventEmitter<{ command: string; params: any }>();

  year: number = new Date().getFullYear();
  month: number = new Date().getMonth();
  monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  weeks: { num: number; date: string; inMonth: boolean; isToday: boolean; cards: CalendarCard[] }[][] = [];
  todayStr = '';

  editing = false;
  editCard: CalendarCard | null = null;

  ngOnInit() {
    this.buildGrid();
  }

  ngOnChanges() {
    this.buildGrid();
  }

  get monthName() { return this.monthNames[this.month]; }

  buildGrid() {
    const now = new Date();
    this.todayStr = now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0');

    const first = new Date(this.year, this.month, 1);
    const last = new Date(this.year, this.month + 1, 0);
    const startPad = first.getDay();
    const daysInMonth = last.getDate();

    const weeks: { num: number; date: string; inMonth: boolean; isToday: boolean; cards: CalendarCard[] }[][] = [];
    let cells: { num: number; date: string; inMonth: boolean; isToday: boolean; cards: CalendarCard[] }[] = [];

    function ds(y: number, m: number, d: number) {
      return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    }

    const prevMonthLast = new Date(this.year, this.month, 0).getDate();
    for (let p = startPad - 1; p >= 0; p--) {
      const d = prevMonthLast - p;
      const dateStr = ds(this.year, this.month - 1, d);
      cells.push({ num: d, date: dateStr, inMonth: false, isToday: dateStr === this.todayStr, cards: [] });
    }

    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = ds(this.year, this.month, i);
      cells.push({ num: i, date: dateStr, inMonth: true, isToday: dateStr === this.todayStr, cards: [] });
    }

    const remaining = 7 - (cells.length % 7);
    if (remaining < 7) {
      for (let j = 1; j <= remaining; j++) {
        const dateStr = ds(this.year, this.month + 1, j);
        cells.push({ num: j, date: dateStr, inMonth: false, isToday: dateStr === this.todayStr, cards: [] });
      }
    }

    for (let i = 0; i < cells.length; i += 7) {
      const week = cells.slice(i, i + 7);
      for (const cell of week) {
        cell.cards = (this.cards || []).filter(c => c.date === cell.date);
      }
      weeks.push(week);
    }

    this.weeks = weeks;
  }

  prevMonth() {
    this.month--;
    if (this.month < 0) { this.month = 11; this.year--; }
    this.buildGrid();
  }

  nextMonth() {
    this.month++;
    if (this.month > 11) { this.month = 0; this.year++; }
    this.buildGrid();
  }

  today() {
    const now = new Date();
    this.year = now.getFullYear();
    this.month = now.getMonth();
    this.buildGrid();
  }

  openAdd(date: string) {
    this.editCard = {
      id: '',
      date: date,
      time: '',
      text: '',
      priority: 'medium',
      cronExpression: '',
      project: this.selectedProject
    };
    this.editing = true;
  }

  openEdit(card: CalendarCard) {
    this.editCard = { ...card };
    this.editing = true;
  }

  closeEdit() {
    this.editing = false;
    this.editCard = null;
  }

  saveCard() {
    if (!this.editCard || !this.editCard.text || !this.editCard.date) return;

    if (this.editCard.id) {
      this.addCommand.emit({ command: 'updateCalendarCard', params: this.editCard });
    } else {
      this.addCommand.emit({ command: 'addCalendarCard', params: { ...this.editCard, id: undefined } });
    }
    this.closeEdit();
  }

  deleteCard(id: string) {
    if (id) {
      this.addCommand.emit({ command: 'deleteCalendarCard', params: { id } });
    }
    this.closeEdit();
  }

  get priorityClass() {
    const p = this.editCard?.priority;
    if (p === 'low') return 'priority-low';
    if (p === 'high') return 'priority-high';
    return 'priority-medium';
  }
}
