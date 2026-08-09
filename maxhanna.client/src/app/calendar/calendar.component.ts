import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { CalendarService } from '../../services/calendar.service';
import { CalendarDate } from '../../services/datacontracts/calendar/calendar-date';
import { CalendarEntry } from '../../services/datacontracts/calendar/calendar-entry';
import { CalendarNotificationSent } from '../../services/datacontracts/calendar/calendar-notification-sent';
import { UserService, UserSettingName } from '../../services/user.service';
import { UserSettings } from '../../services/datacontracts/user/user-settings';


@Component({
  selector: 'app-calendar',
  templateUrl: './calendar.component.html',
  styleUrl: './calendar.component.css',
  standalone: false
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
  @ViewChild('calendarReminderEntry') calendarReminderEntry!: ElementRef<HTMLInputElement>;
  @ViewChild('selectedYearDropdown') selectedYearDropdown!: ElementRef<HTMLSelectElement>;
  @ViewChild('selectedMonthDropdown') selectedMonthDropdown!: ElementRef<HTMLSelectElement>;

  getMonthName = new Intl.DateTimeFormat("en-US", { month: "long" }).format;
  dayCells = Array.from(Array(42).keys());
  calendarDays = new Array<CalendarDate>;
  now = new Date();
  monthBackFromNow = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
  monthForwardFromNow = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
  calendarEntries: CalendarEntry[] = [];
  selectedCalendarEntries?: CalendarEntry[] = undefined;
  isEditingEntry: CalendarEntry[] = [];
  hasEditedCalendarEntry = false;
  currentDate: Date = new Date();
  selectedDate?: CalendarDate = undefined;
  selectedMonth?: string;
  selectedYear?: number;
  calendarNotificationsEnabled = false;
  sentNotifications: CalendarNotificationSent[] = [];
  sentNotificationsLoading = false;
  isMenuPanelOpen: boolean = false;
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
    'Milestone': '📀',
    'Anniversary': '🌹',
    'BiWeekly': '🔁',
    'BiMonthly': '🔂',
  };
  monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  years: number[] = [];

  constructor(private calendarService: CalendarService, private userService: UserService) {
    super();
    const currentYear = new Date().getFullYear();
    for (let i = currentYear - 10; i <= currentYear + 10; i++) {
      this.years.push(i);
    }
  }
  private formatError(err: any): string {
    if (!err) return 'Unknown error';
    if (typeof err === 'string') return err;
    if (err.message) return err.message;
    if (err.status && err.message) return `${err.status}: ${err.message}`;
    try { return JSON.stringify(err); } catch { return String(err); }
  }

  async ngOnInit() {
    this.now = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    await this.initilizeCalendarWithDate();
    if (this.parentRef?.user?.id) {
      const userSettings = await this.userService.getUserSettings(this.parentRef?.user?.id) as UserSettings | undefined;
      if (userSettings) {
        this.calendarNotificationsEnabled = userSettings.calendarNotificationsEnabled ?? false;
        // Seed the timezone from the browser when unset so calendar
        // notifications fire relative to the user's local clock (15 min / 1 hr
        // before), not the server's. Only auto-writes when the user hasn't
        // deliberately set one (e.g. planning events for another zone).
        const browserTz = this.getBrowserTimezone();
        if (browserTz && !userSettings.timezone) {
          this.userService.updateUserSettings(this.parentRef.user.id, [{ settingName: 'timezone', value: browserTz }]);
        }
      }
    }
  }

  private getBrowserTimezone(): string {
    try {
      return (Intl.DateTimeFormat().resolvedOptions() as any).timeZone ?? '';
    } catch {
      return '';
    }
  }

  private async initilizeCalendarWithDate() {
    this.startLoading();
    this.selectedDate = undefined;
    await this.setCalendarDates(this.now);
    this.currentDate = new Date();
    this.currentDate.setHours(0, 0, 0, 0);
    this.selectedYear = this.now.getFullYear();
    this.selectedMonth = this.monthNames[this.now.getMonth()];

    const tmpSelectedDate = this.calendarDays.find(x => {
      if (x.date)
        return x.date!.getTime() === this.currentDate.getTime();
      return false;
    });
    if (tmpSelectedDate?.symbols?.length! > 0) {
      this.selectedDate = tmpSelectedDate;
      this.getCalendarDetails(this.selectedDate!);
    }
    this.stopLoading();
  }

  monthForwardClick() {
    const tmpNow = new Date(this.now);
    this.now = new Date(tmpNow.setMonth(tmpNow.getMonth() + 1));
    this.monthBackFromNow = new Date(tmpNow.setMonth(tmpNow.getMonth() - 1));
    this.monthForwardFromNow = new Date(tmpNow.setMonth(tmpNow.getMonth() + 2));
    this.refreshCalendar();
  }
  monthBackClick() {
    const tmpNow = new Date(this.now);
    this.now = new Date(tmpNow.setMonth(tmpNow.getMonth() - 1));
    this.monthBackFromNow = new Date(tmpNow.setMonth(tmpNow.getMonth() - 1));
    this.monthForwardFromNow = new Date(tmpNow.setMonth(tmpNow.getMonth() + 2));
    this.refreshCalendar();
  }
  
  compareDatesWithoutTime(date1?: Date, date2?: Date) {
    if (!date1 || !date2) return false;
    return date1.getDate() === date2.getDate() && date1.getMonth() === date2.getMonth() && date1.getFullYear() === date2.getFullYear()
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
    this.selectedCalendarEntries = [...(this.selectedCalendarEntries ?? [])].sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : null;
      const dateB = b.date ? new Date(b.date).getTime() : null;

      if (dateA !== null && dateB !== null) {
        return dateA - dateB; // Ascending order
      } else if (dateA !== null) {
        return -1;
      } else if (dateB !== null) {
        return 1;
      }
      return 0;
    });
    this.currentDate = new Date(selectedDate.date!);
  }

  getCurrentDate() {
    return new Date();
  }
  
  async editCalendarEntry(entry?: CalendarEntry) {
    if (!entry || !entry.id) return;
    this.hasEditedCalendarEntry = false;
    const id = entry.id;
    if (!this.isEditingEntry.find(x => x.id == entry.id)) {
      this.parentRef?.showOverlay();
      this.isEditingEntry.push(entry);
      return;
    } else {
      // read values from the entry (kept in sync via [(ngModel)]) with the
      // DOM inputs as a fallback, then send the update
      const timeElem = document.getElementById('calendarEditingTime') as HTMLInputElement;
      const noteElem = document.getElementById('calendarEditingNote') as HTMLInputElement;
      const typeElem = document.getElementById('calendarEditingType') as HTMLSelectElement;
      const reminderElem = document.getElementById('calendarEditingReminder') as HTMLInputElement;
      const entryDate = entry.date ? new Date(entry.date) : null;
      const time = timeElem?.value
        ?? (entryDate ? `${String(entryDate.getHours()).padStart(2, '0')}:${String(entryDate.getMinutes()).padStart(2, '0')}` : '00:00');
      const note = entry.note ?? noteElem?.value ?? '';
      const type = entry.type ?? typeElem?.value ?? 'Event';
      const reminder = reminderElem?.value !== undefined && reminderElem.value !== '' ? Math.max(0, parseInt(reminderElem.value, 10) || 0) : undefined;

      // build updated CalendarEntry
      const updated = new (entry as any).constructor() as CalendarEntry;
      updated.id = entry.id;
      const currentDate = new Date(entry.date!);
      const [hours, minutes] = time.split(':').map(Number);
      // The user's local wall-clock time (the input is in their local zone) —
      // the Date encodes the correct instant; JSON sends it as UTC. The old
      // `- getTimezoneOffset()` shift double-converted on top of that.
      currentDate.setHours(hours, minutes);
      updated.date = currentDate;
      updated.note = note;
      updated.type = type;
      updated.reminder = reminder;

      try {
        await this.calendarService.editCalendarEntry(this.parentRef?.user?.id, updated).then(res => {
          if (res) {
            this.parentRef?.showNotification('Calendar entry updated');
            this.parentRef?.closeOverlay(false);
          }
        });

        // update local copy
        const idx = this.calendarEntries.findIndex(c => c.id === id);
        if (idx !== -1) {
          this.calendarEntries[idx].note = updated.note;
          this.calendarEntries[idx].type = updated.type;
          this.calendarEntries[idx].date = updated.date;
          this.calendarEntries[idx].reminder = updated.reminder;
        }
        this.isEditingEntry = this.isEditingEntry.filter(x => x.id !== id);
        await this.refreshCalendar();
      } catch (error) {
        const msg = this.formatError(error);
        console.error('Error updating calendar entry:', msg);
        this.parentRef?.showNotification('Failed to update calendar entry: ' + msg);
      } finally {
        this.closeEditPopupCalendar();
      }
    }
  }
  closeEditPopupCalendar(shouldEdit = true) {
    setTimeout(async () => {
      if (this.parentRef) {
        this.parentRef.closeOverlay(false);
      }
      if (this.hasEditedCalendarEntry && shouldEdit) {
        this.editCalendarEntry(this.isEditingEntry[0]);
      } else {
        this.isEditingEntry = [];
      }
    }, 50);
  }
  async validateNoteEntry() {
    if (!this.selectedDate || !this.selectedDate.date) {
      alert("validation failed");
      return;
    }
    await this.createCalendarEntry();
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
    const t = type.toLowerCase();
    if (t !== "weekly") {
      return false;
    }
    const sameDayOfWeek = date1.getDay() === date2.getDay();
    if (!sameDayOfWeek) return false;
    return true;
  }

  private isBiWeeklyEventOnSameDate = (type: string, date1: Date, date2: Date): boolean => {
    const t = type.toLowerCase();
    if (t !== "biweekly") {
      return false;
    }
    const sameDayOfWeek = date1.getDay() === date2.getDay();
    if (!sameDayOfWeek) return false;
    // biweekly: difference in weeks between the two dates should be even
    const diffWeeks = Math.floor((date2.getTime() - date1.getTime()) / (7 * 24 * 60 * 60 * 1000));
    return diffWeeks % 2 === 0;
  }
  private isMonthlyEventOnSameDate = (type: string, date1: Date, date2: Date): boolean => {
    const t = type.toLowerCase();
    if (t !== "monthly") return false;
    const sameDay = date1.getDate() === date2.getDate();
    const fallback = this.isLastDayFallback(date1, date2);
    if (!sameDay && !fallback) return false;
    if (t === "monthly") return true;
    // bimonthly: difference in months should be even
    const yearsDiff = date2.getFullYear() - date1.getFullYear();
    const monthsDiff = yearsDiff * 12 + (date2.getMonth() - date1.getMonth());
    return monthsDiff % 2 === 0;
  }
  private isBiMonthlyEventOnSameDate = (type: string, date1: Date, date2: Date): boolean => {
    const t = type.toLowerCase();
    if (t !== "bimonthly") return false;
    const sameDay = date1.getDate() === date2.getDate();
    const fallback = this.isLastDayFallback(date1, date2);
    if (!sameDay && !fallback) return false;
    return true;
  }

  private isLastDayFallback(original: Date, target: Date): boolean {
    // If original day is greater than last day of target month and target is the last day of its month,
    // treat as a match for last-day-of-month fallback
    const lastDayTarget = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    return original.getDate() > lastDayTarget && target.getDate() === lastDayTarget;
  }
  private isAnnualEventOnSameDate = (type: string, date1: Date, date2: Date): boolean => {
    return (type.toLowerCase() == "milestone"
      || type.toLowerCase() == "annually"
      || type.toLowerCase() == "birthday"
      || type.toLowerCase() == "newyears"
      || type.toLowerCase() == "anniversary"
      || type.toLowerCase() == "christmas")
      && (date1.getMonth() === date2.getMonth() && date1.getDate() === date2.getDate());
  }
  private isDaily = (type: string): boolean => {
    return (type.toLowerCase() == "daily");
  }
  private async setCalendarDates(now: Date) {
    await this.getCalendarEntries();
    this.calendarDays = [];
    let tmpNow = new Date(now);

    const numberOfDaysInMonth = this.daysInMonth(tmpNow.getMonth() + 1, tmpNow.getFullYear());
    let dayCount = 0;
    for (let x = 0; x < this.dayCells.length; x++) {
      if (now.getDay() <= x && ++dayCount <= numberOfDaysInMonth) {
        let symbols = new Array<string>();
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
      || this.isBiWeeklyEventOnSameDate(ce.type, new Date(ce.date), tmpNow)
      || this.isMonthlyEventOnSameDate(ce.type, new Date(ce.date), tmpNow)
      || this.isBiMonthlyEventOnSameDate(ce.type, new Date(ce.date), tmpNow)
      || this.isAnnualEventOnSameDate(ce.type, new Date(ce.date), tmpNow)
      || this.isDaily(ce.type)
    );
  }

  private daysInMonth(month: number, year: number) {
    return new Date(year, month, 0).getDate();
  }
  async getCalendarEntries() {
    try {
      const from = new Date(Date.UTC(this.now.getUTCFullYear(), this.now.getUTCMonth(), 1, 0, 0, 0, 0));
      const to = new Date(Date.UTC(this.now.getUTCFullYear(), this.now.getUTCMonth() + 1, 0, 0, 0, 0, 0));
      // Null-coalesce: a failed/skipped fetch returns null from the service and
      // setCalendarDates() calls calendarEntries.forEach — that would throw.
      this.calendarEntries = (await this.calendarService.getCalendarEntries(this.parentRef?.user?.id, from, to)) ?? [];
    } catch (error) {
      const msg = this.formatError(error);
      console.error("Error fetching calendar entries:", msg);
      this.parentRef?.showNotification('Failed to fetch calendar entries: ' + msg);
    }
  }
  async deleteCalendarEntry(cal: CalendarEntry) {
    try {
      if (!cal.id) {
        console.error("No calendar id! : " + JSON.stringify(cal));
      }
      this.selectedCalendarEntries = this.selectedCalendarEntries!.filter((x) => x != cal);
      await this.calendarService.deleteCalendarEntry(this.parentRef?.user?.id, cal);
      this.setCalendarDates(this.now);
      this.closeEditPopupCalendar();
    } catch (error) {
      const msg = this.formatError(error);
      console.error("Error deleting calendar entry:", msg);
      this.parentRef?.showNotification('Failed to delete calendar entry: ' + msg);
      throw error;
    }
  }
  async createCalendarEntry() {
    try {
      const tmpCalendarEntry = this.prepareNewCalendarEntry();

      this.startLoading();
      await this.calendarService.createCalendarEntries(this.parentRef?.user?.id, tmpCalendarEntry);
      this.updateCalendarDaysWithNewEntry(tmpCalendarEntry);
      await this.refreshCalendar();
      this.clearInputValues();
      this.stopLoading();

    } catch (error) {
      const msg = this.formatError(error);
      console.error(msg);
      this.parentRef?.showNotification('Failed to create calendar entry: ' + msg);
      this.stopLoading();
    }
  }

  private prepareNewCalendarEntry(): CalendarEntry {
    const tmpCalendarEntry = new CalendarEntry();
    tmpCalendarEntry.date = this.selectedDate!.date!;

    const timeString = this.calendarTimeEntry.nativeElement.value;
    const [hours, minutes] = timeString.split(":").map(Number);
    // The Date is the user's LOCAL wall-clock here, which already encodes the
    // correct instant — JSON serializes it as its UTC equivalent, so no manual
    // offset math (the old `- getTimezoneOffset()` shift double-converted and
    // stored times wrong by the user's UTC offset).
    tmpCalendarEntry.date.setHours(hours, minutes);

    tmpCalendarEntry.type = this.calendarTypeEntry.nativeElement.value;
    tmpCalendarEntry.note = this.calendarNoteEntry.nativeElement.value;

    const reminderValue = this.calendarReminderEntry?.nativeElement?.value;
    tmpCalendarEntry.reminder = reminderValue !== undefined && reminderValue !== '' ? Math.max(0, parseInt(reminderValue, 10) || 0) : undefined;

    return tmpCalendarEntry;
  }

  private updateCalendarDaysWithNewEntry(tmpCalendarEntry: CalendarEntry) {
    const tmpCD = this.calendarDays.find(x => x.date && x.date!.getDate() === this.selectedDate!.date!.getDate());
    if (tmpCD) {
      tmpCD.symbols!.push(this.eventSymbolMap[tmpCalendarEntry.type!]);
    }
  }

  private async refreshCalendar() {
    this.startLoading();
    await this.getCalendarEntries();
    await this.setCalendarDates(this.now);
    await this.getCalendarDetails(this.selectedDate!);
    this.stopLoading();

  }

  private clearInputValues() {
    this.calendarTimeEntry.nativeElement.value = "00:00";
    this.calendarNoteEntry.nativeElement.value = "";
    this.calendarTypeEntry.nativeElement.value = this.calendarTypeEntry.nativeElement.options[0].value;
    if (this.calendarReminderEntry?.nativeElement) this.calendarReminderEntry.nativeElement.value = "60";
  }

  convertSymbols(symbols: string[] | undefined): string {
    if (!symbols) return '';

    // Process anniversary symbols to show years since creation
    const processedSymbols = symbols.map(symbol => {
      return this.eventSymbolMap[symbol] || symbol;
    }).join('');

    return processedSymbols;
  }

  getAnniversaryYears(date: Date | string): number {
    if (!date) return 0;

    const eventDate = new Date(date);
    const currentDate = new Date();

    // Handle invalid dates
    if (isNaN(eventDate.getTime())) return 0;

    // Calculate difference in years
    let years = currentDate.getFullYear() - eventDate.getFullYear();

    // Adjust if the birthday hasn't occurred this year yet
    if (currentDate.getMonth() < eventDate.getMonth() ||
      (currentDate.getMonth() === eventDate.getMonth() && currentDate.getDate() < eventDate.getDate())) {
      years--;
    }

    // Make sure we don't return negative years
    return Math.max(0, years);
  }

  formatAnniversaryDisplay(entry: CalendarEntry): string {
    if (!entry || !entry.type || !entry.date) return entry.note || '';

    const type = entry.type.toLowerCase();

    if (type === 'anniversary') {
      const years = this.getAnniversaryYears(entry.date);
      return `${entry.note} (${years} year Anniversary)`;
    }

    return entry.note || '';
  }

  // Human timezone label for a calendar date, e.g. 'UTC+2', 'UTC-5',
  // 'UTC+5:30' or 'UTC' at zero offset. Computed for THAT date (not today) so
  // DST transitions don't label an event with the current offset.
  // NOTE: server dates arrive as ISO strings (raw response.json()), so this
  // must normalize before calling any Date method — it runs inside the edit
  // panel's template, where a throw would abort change detection and leave the
  // note/type inputs empty (the time input rendered, everything after failed).
  tzOffsetLabel(date?: Date | string | number | null): string {
    if (date === null || date === undefined || date === '') return '';
    const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '';
    const m = -d.getTimezoneOffset();
    if (m === 0) return 'UTC';
    const sign = m > 0 ? '+' : '-';
    const abs = Math.abs(m);
    const h = Math.floor(abs / 60);
    const mm = abs % 60;
    return `UTC${sign}${h}${mm ? ':' + String(mm).padStart(2, '0') : ''}`;
  }

  // Safe HH:mm for the edit panel's <input type="time">. The raw `| date` pipe
  // throws InvalidPipeArgument on unparseable dates, which aborts change
  // detection and blanks everything below the time row (the note + type
  // inputs) — so format here where any date shape (ISO string, Date, epoch
  // number, null, malformed) degrades to '' instead of throwing.
  editTimeValue(date?: Date | string | number | null): string {
    if (date === null || date === undefined || date === '') return '';
    const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  getEventTypes(): string[] {
    return Object.keys(this.eventSymbolMap);
  }
  showMenuPanel() {
    if (this.isMenuPanelOpen) {
      this.closeMenuPanel();
      return;
    }
    this.isMenuPanelOpen = true;
    if (this.parentRef) {
      this.parentRef.showOverlay();
    }
    this.loadSentNotifications();
  }
  closeMenuPanel() {
    this.isMenuPanelOpen = false;
    if (this.parentRef) {
      this.parentRef.closeOverlay();
    }
  }
  async onMonthChange() {
    this.selectedMonth = this.selectedMonthDropdown.nativeElement.value;
    const monthIndex = this.selectedMonth ? this.monthNames.indexOf(this.selectedMonth) : new Date().getMonth();
    this.now = new Date((this.selectedYear ?? new Date().getFullYear()), monthIndex, 1);
    setTimeout(() => {
      const tmpNow = new Date(this.now);
      this.now = new Date(tmpNow.setMonth(tmpNow.getMonth()));
      this.monthBackFromNow = new Date(tmpNow.setMonth(tmpNow.getMonth() - 1));
      this.monthForwardFromNow = new Date(tmpNow.setMonth(tmpNow.getMonth() + 2));
      this.refreshCalendar();
    }, 100)
  }
  async onYearChange() {
    this.selectedYear = parseInt(this.selectedYearDropdown.nativeElement.value);
    const selectMonth = (this.selectedMonth ? this.monthNames.indexOf(this.selectedMonth) : new Date().getMonth());
    this.now = new Date((this.selectedYear ?? new Date().getFullYear()), selectMonth, 1);
    const tmpNow = new Date(this.now);
    this.now = new Date(tmpNow.setMonth(tmpNow.getMonth() - 1));
    this.monthBackFromNow = new Date(tmpNow.setMonth(tmpNow.getMonth() - 1));
    this.monthForwardFromNow = new Date(tmpNow.setMonth(tmpNow.getMonth() + 2));
    this.refreshCalendar();
  }
  async toggleCalendarNotifications() {
    this.calendarNotificationsEnabled = !this.calendarNotificationsEnabled;
    if (this.parentRef?.user?.id) {
      await this.userService.updateUserSettings(this.parentRef.user.id, [{ settingName: "calendar_notifications_enabled", value: this.calendarNotificationsEnabled }]);
    }
  }

  async loadSentNotifications() {
    if (!this.parentRef?.user?.id) return;
    this.sentNotificationsLoading = true;
    try {
      this.sentNotifications = (await this.calendarService.getNotificationsSent(this.parentRef.user.id)) ?? [];
    } catch (error) {
      const msg = this.formatError(error);
      console.error("Error fetching sent calendar notifications:", msg);
      this.sentNotifications = [];
    } finally {
      this.sentNotificationsLoading = false;
    }
  }

  formatNotificationSent(sent: CalendarNotificationSent): string {
    const when = sent.notificationSent ? new Date(sent.notificationSent) : null;
    const whenStr = when && !isNaN(when.getTime()) ? when.toLocaleString() : '';
    if (sent.calendarText) return sent.calendarText + (whenStr ? ` — ${whenStr}` : '');
    return whenStr || 'Notification'; 
  }
}
