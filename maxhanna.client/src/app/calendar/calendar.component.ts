import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { HttpClient, HttpParams } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { CalendarEntry } from '../../services/datacontracts/calendar-entry';
import { CalendarDate } from '../../services/datacontracts/calendar-date';
import { CalendarService } from '../../services/calendar.service';


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
    'Anniversary': '🌹',
  };

  constructor(private calendarService: CalendarService) {
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
    const tmpNow = new Date(this.now);
    this.now = new Date(tmpNow.setMonth(tmpNow.getMonth() + 1));
    this.monthBackFromNow = new Date(tmpNow.setMonth(tmpNow.getMonth() - 1));
    this.monthForwardFromNow = new Date(tmpNow.setMonth(tmpNow.getMonth() + 2));
    this.setCalendarDates(this.now);
  }
  monthBackClick() {
    const tmpNow = new Date(this.now);
    this.now = new Date(tmpNow.setMonth(tmpNow.getMonth() - 1));
    this.monthBackFromNow = new Date(tmpNow.setMonth(tmpNow.getMonth() - 1));
    this.monthForwardFromNow = new Date(tmpNow.setMonth(tmpNow.getMonth() + 2));
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
    try {
      this.calendarEntries =
        await this.calendarService.getCalendarEntries(
          this.parentRef?.user!,
          new Date(this.now.getFullYear(), this.now.getMonth(), 1),
          new Date(this.now.getFullYear(), this.now.getMonth() + 1, 0)
        );
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
      await this.calendarService.deleteCalendarEntry(this.parentRef?.user!, cal);
      this.setCalendarDates(this.now);
    } catch (error) {
      console.error("Error deleting calendar entry:", error);
      throw error;
    }
  }
  async createCalendarEntry() {
    try {
      const tmpCalendarEntry = this.prepareNewCalendarEntry();

      this.startLoading();
      await this.calendarService.createCalendarEntries(this.parentRef?.user!, tmpCalendarEntry);

      this.updateCalendarDaysWithNewEntry(tmpCalendarEntry);

      await this.refreshCalendar();

      this.clearInputValues();
      this.stopLoading();
    } catch (error) {
      console.error(error);
    }
  }

  private prepareNewCalendarEntry(): CalendarEntry {
    const tmpCalendarEntry = new CalendarEntry();
    tmpCalendarEntry.date = this.selectedDate!.date!;

    const timeString = this.calendarTimeEntry.nativeElement.value;
    const [hours, minutes] = timeString.split(":").map(Number);
    tmpCalendarEntry.date.setHours(hours, minutes);

    const utcDate = new Date(tmpCalendarEntry.date.getTime() - (tmpCalendarEntry.date.getTimezoneOffset() * 60000));
    tmpCalendarEntry.date = utcDate;

    tmpCalendarEntry.type = this.calendarTypeEntry.nativeElement.value;
    tmpCalendarEntry.note = this.calendarNoteEntry.nativeElement.value;

    return tmpCalendarEntry;
  }

  private updateCalendarDaysWithNewEntry(tmpCalendarEntry: CalendarEntry) {
    const tmpCD = this.calendarDays.find(x => x.date && x.date!.getDate() === this.selectedDate!.date!.getDate());
    if (tmpCD) {
      tmpCD.symbols!.push(this.eventSymbolMap[tmpCalendarEntry.type!]);
    }
  }

  private async refreshCalendar() {
    await this.getCalendarEntries();
    await this.setCalendarDates(this.now);
    await this.getCalendarDetails(this.selectedDate!);
  }

  private clearInputValues() {
    this.calendarTimeEntry.nativeElement.value = "00:00";
    this.calendarNoteEntry.nativeElement.value = "";
    this.calendarTypeEntry.nativeElement.value = this.calendarTypeEntry.nativeElement.options[0].value;
  }

  convertSymbols(symbols: string[] | undefined): string {
    return symbols ? symbols.map(symbol => this.eventSymbolMap[symbol] || symbol).join('') : '';
  }
  getEventTypes(): string[] {
    return Object.keys(this.eventSymbolMap);
  }
}
