import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { CalendarDate } from '../calendar-date';
import { HttpClient, HttpParams } from '@angular/common/http';
import { CalendarEntry } from '../calendar-entry';
import { lastValueFrom } from 'rxjs';


@Component({
  selector: 'app-calendar',
  templateUrl: './calendar.component.html',
  styleUrl: './calendar.component.css'
})
export class CalendarComponent extends ChildComponent implements OnInit {
  @ViewChild('monthBack') monthBack!: ElementRef<HTMLElement>;
  @ViewChild('monthForward') monthForward!: ElementRef<HTMLElement>;
  @ViewChild('yearBack') yearBack!: ElementRef<HTMLElement>;
  @ViewChild('yearForward') yearForward!: ElementRef<HTMLElement>;
  @ViewChild('month') month!: ElementRef<HTMLElement>;
  @ViewChild('year') year!: ElementRef<HTMLElement>;

  @ViewChild('calendarNoteEntry') calendarNoteEntry!: ElementRef<HTMLInputElement>;
  @ViewChild('calendarTypeEntry') calendarTypeEntry!: ElementRef<HTMLSelectElement>;
  @ViewChild('calendarTimeEntry') calendarTimeEntry!: ElementRef<HTMLInputElement>;

  getMonthName = new Intl.DateTimeFormat("en-US", { month: "long" }).format;
  dayCells = Array.from(Array(42).keys());
  calendarDays = new Array<CalendarDate>;
  now = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  monthBackFromNow = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
  monthForwardFromNow = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
  calendarEntries: CalendarEntry[] = [];
  selectedCalendarEntries?: CalendarEntry[] = undefined;
  currentDate: Date = new Date();
  selectedDate?: CalendarDate = undefined;
  eventSymbolMap: { [key: string]: string } = {
    'Event': '💥',
    'Birthday': '🎁',
    'Holiday': '🏖️',
    'Newyears': '🎉',
    'Christmas': '🎄',
    'Weekly': '📅',
    'Monthly': '📆',
    'Annually': '🎇',
    'Daily': '⏰',
    'Milestone': '🏆',
  };

  constructor(private http: HttpClient) {
    super();
  }

  async ngOnInit() {
    this.selectedDate = undefined;
    await this.setCalendarDates(this.now);
    this.currentDate = new Date();
    this.currentDate.setHours(0, 0, 0, 0);

    const tmpSelectedDate = this.calendarDays.find(x => {
      if (x.date)
        return x.date!.getTime() === this.currentDate.getTime();
      return false;
    });
    if (tmpSelectedDate?.symbols?.length! > 0) {
      this.selectedDate = tmpSelectedDate;
      this.getCalendarDetails(this.selectedDate!);
    }
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
    if (!(selectedDate && selectedDate.date)) {
      return;
    }
    this.selectedCalendarEntries = [];
    this.selectedDate = selectedDate;
    this.calendarEntries.forEach(ce => {
      if (selectedDate.date && this.calendarEntriesContainsDate(ce, selectedDate.date)) {
        this.selectedCalendarEntries?.push(ce);
      }
    });
    this.currentDate = new Date(selectedDate.date!);
  }
  async validateNoteEntry() {
    if (!this.selectedDate || !this.selectedDate.date) {
      alert("validation failed");
      return;
    }

    await this.promiseWrapper(await this.createCalendarEntry());
  }
  private async setDateHeaders(now: Date) {
    if (!(this.month && this.year && this.yearBack && this.monthBack && this.monthForward && this.yearForward)) {
      await this.getCalendarEntries();
      return;
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
    return (date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate() &&
      date1.getFullYear() === date2.getFullYear());
  }
  private isWeeklyEventOnSameDate = (type: string, date1: Date, date2: Date): boolean => {
    if (type.toLowerCase() !== "weekly") {
      return false;
    }
    const sameDayOfWeek = date1.getDay() === date2.getDay();
    return sameDayOfWeek;
  }
  private isMonthlyEventOnSameDate = (type: string, date1: Date, date2: Date): boolean => {
    return type.toLowerCase() == "monthly" && date1.getDate() === date2.getDate();
  }
  private isAnnualEventOnSameDate = (type: string, date1: Date, date2: Date): boolean => {
    return (type.toLowerCase() == "milestone" || type.toLowerCase() == "annually" || type.toLowerCase() == "birthday")
      && (date1.getMonth() === date2.getMonth() && date1.getDate() === date2.getDate());
  }
  private async setCalendarDates(now: Date) {
    await this.getCalendarEntries();
    this.calendarDays = [];
    var tmpNow = new Date(now);

    const numberOfDaysInMonth = this.daysInMonth(tmpNow.getMonth() + 1, tmpNow.getFullYear());
    let dayCount = 0;
    for (let x = 0; x < this.dayCells.length; x++) {
      if (now.getDay() <= x && ++dayCount <= numberOfDaysInMonth) {
        var symbols = new Array<string>();
        this.calendarEntries.forEach(ce => {
          if (this.calendarEntriesContainsDate(ce, tmpNow)
          ) {
            symbols.push(ce.type!);
          }
        });
        this.calendarDays.push(new CalendarDate(x, new Date(tmpNow), symbols));
        tmpNow.setDate(tmpNow.getDate() + 1);
      } else {
        this.calendarDays.push(new CalendarDate(x, undefined, undefined));
      }
    }
    this.setDateHeaders(now);
  }
  private calendarEntriesContainsDate(ce: CalendarEntry, tmpNow: Date) {
    return ce && ce.date && ce.type && (
      this.isSameDate(new Date(ce.date), tmpNow)
      || this.isWeeklyEventOnSameDate(ce.type, new Date(ce.date), tmpNow)
      || this.isMonthlyEventOnSameDate(ce.type, new Date(ce.date), tmpNow)
      || this.isAnnualEventOnSameDate(ce.type, new Date(ce.date), tmpNow)
    );
  }

  private daysInMonth(month: number, year: number) {
    return new Date(year, month, 0).getDate();
  }
  async getCalendarEntries() {
    const params = new HttpParams()
      .set('startDate', new Date(this.now.getFullYear(), this.now.getMonth(), 1).toISOString())
      .set('endDate', new Date(this.now.getFullYear(), this.now.getMonth() + 1, 0).toISOString());

    try {
      this.calendarEntries = await this.promiseWrapper(lastValueFrom(await this.http.get<CalendarEntry[]>('/calendar', { params })));
    } catch (error) {
      console.error("Error fetching calendar entries:", error);
    }
  }
  async deleteCalendarEntry(cal: CalendarEntry) {
    try {
      if (!cal.id) {
        console.error("No calendar id! : " + JSON.stringify(cal));
      }
      this.selectedCalendarEntries = this.selectedCalendarEntries!.filter((x) => x != cal);
      const id = cal!.id;
      await this.promiseWrapper(await lastValueFrom(await this.http.delete(`/calendar/${id}`)));
      this.setCalendarDates(this.now);
    } catch (error) {
      console.error("Error deleting calendar entry:", error);
      throw error; // Re-throw the error to handle it in the component
    }
  }
  async createCalendarEntry() {
    const tmpCalendarEntry = {
      date: new Date(this.selectedDate!.date!),
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
      this.startLoading();
      await lastValueFrom(await this.http.post("/calendar", body, { headers }));
      this.stopLoading();
      this.clearInputValues();
      //this.selectedCalendarEntries!.push(tmpCalendarEntry);
      await this.setCalendarDates(this.now);
      await this.getCalendarDetails(this.selectedDate!);
    }
    catch (error) {
      console.error(error);
    }
  }
  convertSymbols(symbols: string[] | undefined): string {
    return symbols ? symbols.map(symbol => this.eventSymbolMap[symbol] || symbol).join('') : '';
  }
  getEventTypes(): string[] {
    return Object.keys(this.eventSymbolMap);
  }
  private clearInputValues() {
    this.calendarTimeEntry.nativeElement.value = "00:00";
    this.calendarNoteEntry.nativeElement.value = "";
    this.calendarTypeEntry.nativeElement.value = this.calendarTypeEntry.nativeElement.options[0].value;
  }
}
