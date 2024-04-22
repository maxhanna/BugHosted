import { Component, ElementRef, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { CalendarDate } from '../calendar-date';
import { HttpClient, HttpParams } from '@angular/common/http';
import { CalendarEntry } from '../calendar-entry';
import { lastValueFrom } from 'rxjs';

@Component({
  selector: 'app-task',
  templateUrl: './task.component.html',
  styleUrl: './task.component.css'
})
export class TaskComponent extends ChildComponent {
  @ViewChild('monthBack') monthBack!: ElementRef<HTMLElement>;
  @ViewChild('monthForward') monthForward!: ElementRef<HTMLElement>;
  @ViewChild('yearBack') yearBack!: ElementRef<HTMLElement>;
  @ViewChild('yearForward') yearForward!: ElementRef<HTMLElement>;
  @ViewChild('month') month!: ElementRef<HTMLElement>;
  @ViewChild('year') year!: ElementRef<HTMLElement>;

  @ViewChild('calendarNoteEntry') calendarNoteEntry!: ElementRef<HTMLInputElement>;
  @ViewChild('calendarTypeEntry') calendarTypeEntry!: ElementRef<HTMLInputElement>;
  @ViewChild('calendarTimeEntry') calendarTimeEntry!: ElementRef<HTMLInputElement>;

  getMonthName = new Intl.DateTimeFormat("en-US", { month: "long" }).format;
  dayCells = Array.from(Array(42).keys());
  calendarDays = new Array<CalendarDate>;
  now = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  monthBackFromNow = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
  monthForwardFromNow = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
  calendarEntries: CalendarEntry[] = [];
  selectedDate?: CalendarDate = undefined;
  selectedCalendarEntries?: CalendarEntry[] = undefined;

  constructor(private http: HttpClient) {
    super();
    this.setCalendarDates(this.now);
  }

  monthForwardClick() {
    let tmpNow = new Date(1 + " " + this.month.nativeElement.innerText + " " + this.year.nativeElement.innerText);
    this.now = new Date(tmpNow.setMonth(tmpNow.getMonth() + 1));
     
    this.setCalendarDates(this.now);
  }
  monthBackClick() {
    let tmpNow = new Date(1 + " " + this.month.nativeElement.innerText + " " + this.year.nativeElement.innerText);
    this.now = new Date(tmpNow.setMonth(tmpNow.getMonth() - 1));
     
    this.setCalendarDates(this.now);
  }
  getCalendarDetails(selectedDate: CalendarDate) {
    this.selectedCalendarEntries = [];
    this.selectedDate = selectedDate;
    this.calendarEntries.forEach(ce => {
      if (ce.date && selectedDate.date && this.isSameDate(new Date(ce.date), selectedDate.date)) {
        this.selectedCalendarEntries?.push(ce);
      }
    });
  }
  async validateNoteEntry() {
    await this.createCalendarEntry();
    this.setCalendarDates(this.now);
  }
  private async setDateHeaders(now: Date) {
    if (!(this.month && this.year && this.yearBack && this.monthBack && this.monthForward && this.yearForward))
    {
      await this.getCalendar();
    }
    this.month.nativeElement.innerText = this.getMonthName(now);
    this.year.nativeElement.innerText = now.getFullYear() + "";

    var tmpMonth = new Date(now);
    var nextMonth = new Date(tmpMonth.setMonth(tmpMonth.getMonth() + 1));
    var monthNameNextMonth = this.getMonthName(nextMonth);
    var yearNextMonth = nextMonth.getFullYear();
    this.yearForward.nativeElement.innerText = yearNextMonth + "";
    this.monthForward.nativeElement.innerText = monthNameNextMonth;

    tmpMonth = new Date(now);
    var lastMonth = new Date(tmpMonth.setMonth(tmpMonth.getMonth() - 2));
    this.yearBack.nativeElement.innerText = lastMonth.getFullYear() + "";
    this.monthBack.nativeElement.innerText = this.getMonthName(lastMonth);
  }
  private isSameDate = (date1: Date, date2: Date): boolean => {
    return date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate();
  }
  private async setCalendarDates(now: Date)
  {
    await this.getCalendar();
    this.calendarDays = [];
    var tmpNow = new Date(now);

    const numberOfDaysInMonth = this.daysInMonth(tmpNow.getMonth() + 1, tmpNow.getFullYear());
    let dayCount = 0; 
    for (let x = 0; x < this.dayCells.length; x++) {
      if (now.getDay() <= x && ++dayCount <= numberOfDaysInMonth) {
        var symbols = new Array<string>();
        this.calendarEntries.forEach(ce => {
          if (ce && ce.date) {
            if (this.isSameDate(new Date(ce.date), tmpNow) && ce.type) {
              symbols.push(ce.type);
            }
          } 
        });
        this.calendarDays.push(new CalendarDate(x, new Date(tmpNow), symbols));
        tmpNow.setDate(tmpNow.getDate() + 1);
      } else {
        this.calendarDays.push(new CalendarDate(x, undefined, undefined));
      }
    }
    this.setDateHeaders(now);
    this.calendarDays
  }
  private daysInMonth(month: number, year: number) {
    return new Date(year, month, 0).getDate();
  }
  async getCalendar() {
    const startOfMonth = new Date(this.now.getFullYear(), this.now.getMonth(), 1);
    const endOfMonth = new Date(this.now.getFullYear(), this.now.getMonth() + 1, 0);

    const params = new HttpParams()
      .set('startDate', startOfMonth.toISOString())
      .set('endDate', endOfMonth.toISOString());

    try {
      const result = await this.http.get<CalendarEntry[]>('/calendar', { params }).toPromise();
      if (result) {
        this.calendarEntries = result;
        console.log(this.calendarEntries);
      }
    } catch (error) {
      console.error("Error fetching calendar entries:", error);
    }
  }
  async deleteCalendarEntry(cal: CalendarEntry) {
    try {
      this.selectedCalendarEntries = this.selectedCalendarEntries!.filter((x) => x != cal);
      const id = cal!.id
      console.log("Deleting calendar entry with ID:", id);
      const response = lastValueFrom(await this.http.delete(`/calendar/${id}`));
      console.log("Calendar entry deleted successfully:", response);
      this.setCalendarDates(this.now);
      return response;
    } catch (error) {
      console.error("Error deleting calendar entry:", error);
      throw error; // Re-throw the error to handle it in the component
    }
  }
  async createCalendarEntry() {
    if (!this.selectedDate || !this.selectedDate.date) {
      console.error("Selected date is undefined or null.");
      return null;
    }

    const tmpCalendarEntry = {
      date: new Date(this.selectedDate.date),
      type: this.calendarTypeEntry.nativeElement.value,
      note: this.calendarNoteEntry.nativeElement.value
    };

    const timeValue = this.calendarTimeEntry.nativeElement.value;
    const [hours, minutes] = timeValue.split(':');
    const timeZoneOffset = tmpCalendarEntry.date.getTimezoneOffset();
    tmpCalendarEntry.date.setHours(parseInt(hours, 10));
    tmpCalendarEntry.date.setMinutes(parseInt(minutes, 10));

    const headers = { 'Content-Type': 'application/json' };
    const utcDate = new Date(tmpCalendarEntry.date.getTime() - (tmpCalendarEntry.date.getTimezoneOffset() * 60000));
    const body = JSON.stringify({ ...tmpCalendarEntry, date: utcDate });


    try {
      const response = await lastValueFrom(this.http.post("/calendar", body, { headers }));
      this.clearInputValues();
      this.selectedCalendarEntries!.push(tmpCalendarEntry);
      return response;
    }
    catch (error) {
      return null;
    }
  }
  private clearInputValues() {
    this.calendarTimeEntry.nativeElement.value = "";
    this.calendarNoteEntry.nativeElement.value = "";
    this.calendarTypeEntry.nativeElement.value = "";
  }
}
