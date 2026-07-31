import { Component, ElementRef, Input, OnInit, ViewChild, AfterViewInit, OnDestroy } from '@angular/core'; 
import { CoinValueService } from '../../services/coin-value.service';
import { AppComponent } from '../app.component';

interface CryptoEvent {
  eventId: string;
  slug?: string;
  title: string;
  coinSymbol: string;
  coinName: string;
  eventDate: string;
  dateEnd?: string;
  dateType?: string;
  isEstimated: boolean;
  createdDate: string;
  source?: string;
  description?: string;
  isHot: boolean;
  impact?: number;
  impactSummary?: string;
  proofUrl?: string;
  snapshotUrl?: string;
  lastVerifiedAt?: string;
  updatedAt?: string;
  categories?: string;
}

@Component({
  selector: 'app-crypto-calendar',
  templateUrl: './crypto-calendar.component.html',
  styleUrl: './crypto-calendar.component.css',
  standalone: false
})
export class CryptoCalendarComponent implements OnInit, AfterViewInit, OnDestroy {
  allEvents: any[] = [];
  filteredEvents: any[] = [];
  currentDate = new Date(); 
  uniqueCoinSymbols: string[] = []; 
  collapsed = true;

  @ViewChild('selectedCoinSymbol') selectedCoinSymbol!: ElementRef<HTMLSelectElement>;
  @ViewChild('ignoreDateFilter') ignoreDateFilter!: ElementRef<HTMLInputElement>;
  @ViewChild('eventContainer') eventContainer!: ElementRef<HTMLDivElement>;
  @Input() inputtedParentRef?: AppComponent;
  showTopButton: boolean = false;
  private _eventContainerScrollHandler: any;
  
  constructor(private coinValueService: CoinValueService) { }

  ngOnInit(): void {
    this.fetchEvents();
  }

  ngAfterViewInit(): void {
    // attach scroll listener when container becomes available
    this._eventContainerScrollHandler = () => {
      try {
        const el = this.eventContainer?.nativeElement;
        this.showTopButton = !!el && el.scrollTop > 0;
      } catch { this.showTopButton = false; }
    };
    try { this.eventContainer?.nativeElement.addEventListener('scroll', this._eventContainerScrollHandler); } catch { }
  }

  fetchEvents(): void {
    this.coinValueService.fetchCryptoCalendarEvents().then(res => {
      if (res?.success) {
        this.allEvents = res.events.map((e: any) => ({
          ...e,
          eventDate: new Date(e.eventDate),
          dateEnd: e.dateEnd ? new Date(e.dateEnd) : undefined
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

  formatEventDate(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    const diffDays = Math.round(diffMs / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';
    if (diffDays > 0 && diffDays <= 7) return `In ${diffDays} days`;
    if (diffDays < 0 && diffDays >= -7) return `${Math.abs(diffDays)} days ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  splitCategories(categories: string): string[] {
    if (!categories) return [];
    return categories.split(',').map(c => c.trim()).filter(c => c.length > 0);
  }

  toggleCollapsed() { 
    this.collapsed = !this.collapsed; 
    try {
      const el = this.eventContainer?.nativeElement;
      this.showTopButton = !!el && el.scrollTop > 0;
    } catch { this.showTopButton = false; }
  }

  scrollTop() {
    try {
      if (this.eventContainer && this.eventContainer.nativeElement) {
        this.eventContainer.nativeElement.scrollTop = 0;
      }
    } catch { }
  }

  ngOnDestroy(): void {
    try { if (this.eventContainer?.nativeElement && this._eventContainerScrollHandler) this.eventContainer.nativeElement.removeEventListener('scroll', this._eventContainerScrollHandler); } catch { }
  }
}
