import { Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core'; 
import { CoinValueService } from '../../services/coin-value.service';
import { AppComponent } from '../app.component';

interface CryptoEvent {
  eventId: string;
  title: string;
  coinSymbol: string;
  coinName: string;
  eventDate: string;
  createdDate: string;
  source?: string;
  description?: string;
  isHot: boolean;
  proofUrl?: string;
}

@Component({
  selector: 'app-crypto-calendar',
  templateUrl: './crypto-calendar.component.html',
  styleUrls: ['./crypto-calendar.component.css'],
  standalone: false
})
export class CryptoCalendarComponent implements OnInit {
  allEvents: any[] = [];
  filteredEvents: any[] = [];
  currentDate = new Date(); 
  uniqueCoinSymbols: string[] = []; 
  collapsed = true;

  @ViewChild('selectedCoinSymbol') selectedCoinSymbol!: ElementRef<HTMLSelectElement>;
  @ViewChild('ignoreDateFilter') ignoreDateFilter!: ElementRef<HTMLInputElement>;
  @ViewChild('eventContainer') eventContainer!: ElementRef<HTMLDivElement>;
  @Input() inputtedParentRef?: AppComponent;
  
  constructor(private coinValueService: CoinValueService) { }

  ngOnInit(): void {
    this.fetchEvents();
  }

  fetchEvents(): void {
    this.coinValueService.fetchCryptoCalendarEvents().then(res => {
      if (res?.success) {
        this.allEvents = res.events.map((e: any) => ({
          ...e,
          eventDate: new Date(e.eventDate)
        }));
        this.uniqueCoinSymbols = [
          ...new Set(this.allEvents.map(e => e.coinSymbol).sort())
        ]; 
        this.filterEventsForDate();
      }
    });
  }

  dateKey(d: Date): string {
    return d.toISOString().slice(0, 10);
  }
  filterEventsForDate(): void {
    const search = this.selectedCoinSymbol.nativeElement.value.trim().toLowerCase();

    if (search !== '') { 
      this.filteredEvents = this.allEvents.filter(e =>
        (e.coinSymbol.toLowerCase().includes(search) ||
          e.coinName.toLowerCase().includes(search)) &&
        (!this.ignoreDateFilter.nativeElement.checked ? this.dateKey(e.eventDate) === this.dateKey(this.currentDate) : true)
      );
    } else { 
      const key = this.dateKey(this.currentDate);
      this.filteredEvents = this.allEvents.filter(e => this.dateKey(e.eventDate) === key);
    }
  }

  nextDay(): void {
    this.currentDate.setDate(this.currentDate.getDate() + 1);
    this.currentDate = new Date(this.currentDate); // trigger change detection
    this.filterEventsForDate();
  }

  prevDay(): void {
    this.currentDate.setDate(this.currentDate.getDate() - 1);
    this.currentDate = new Date(this.currentDate); // trigger change detection
    this.filterEventsForDate();
  }

  formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  toggleCollapsed() { this.collapsed = !this.collapsed; }

  scrollTop() {
    try {
      if (this.eventContainer && this.eventContainer.nativeElement) {
        this.eventContainer.nativeElement.scrollTop = 0;
      }
    } catch { }
  }
}
