import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { CalendarComponent } from './calendar.component';
import { CalendarService } from '../../services/calendar.service';
import { CalendarEntry } from '../../services/datacontracts/calendar/calendar-entry';

describe('CalendarComponent', () => {
  let component: CalendarComponent;
  let fixture: ComponentFixture<CalendarComponent>;
  let calendarService: jasmine.SpyObj<CalendarService>;

  beforeEach(async () => {
    calendarService = jasmine.createSpyObj('CalendarService', [
      'getCalendarEntries',
      'searchCalendarEntries',
      'getNotificationsSent',
    ]);
    calendarService.getCalendarEntries.and.resolveTo([]);
    calendarService.searchCalendarEntries.and.resolveTo([]);

    await TestBed.configureTestingModule({
      declarations: [CalendarComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: CalendarService, useValue: calendarService },
      ],
      schemas: [NO_ERRORS_SCHEMA]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(CalendarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('starts on the search tab and switches sections', () => {
    expect(component.calendarMenuTab).toBe('search');

    component.selectCalendarMenuTab('notifications');

    expect(component.calendarMenuTab).toBe('notifications');
  });

  it('searches every note with trimmed text, optional type and date limits', async () => {
    const older = new CalendarEntry();
    older.id = 1;
    older.date = new Date(2026, 0, 2, 9);
    older.type = 'Event';
    older.note = 'Older bill';
    const newer = new CalendarEntry();
    newer.id = 2;
    newer.date = new Date(2026, 0, 20, 9);
    newer.type = 'Event';
    newer.note = 'Newer bill';
    calendarService.searchCalendarEntries.and.resolveTo([older, newer]);

    component.searchQuery = '  bill  ';
    component.searchType = 'Event';
    component.searchFromDate = '2026-01-01';
    component.searchToDate = '2026-01-31';
    await component.searchCalendarEvents();

    const args = calendarService.searchCalendarEntries.calls.mostRecent().args;
    expect(args[1]).toBe('bill');
    expect(args[2]).toBe('Event');
    expect((args[3] as Date).getHours()).toBe(0);
    expect((args[4] as Date).getHours()).toBe(23);
    expect(component.searchResults.map((entry) => entry.note)).toEqual(['Newer bill', 'Older bill']);
  });

  it('opens the calendar month and selects the day of a search result', async () => {
    const result = new CalendarEntry();
    result.id = 42;
    result.date = new Date(2026, 4, 17, 9, 30);
    result.type = 'Birthday';
    result.note = 'Mom';

    await component.openCalendarSearchResult(result);

    expect(component.now.getFullYear()).toBe(2026);
    expect(component.now.getMonth()).toBe(4);
    expect(component.selectedMonth).toBe('May');
    expect(component.selectedDate?.date?.getDate()).toBe(17);
    expect(component.selectedCalendarEntries?.some((entry) => entry.id === 42)).toBeTrue();
  });
});
