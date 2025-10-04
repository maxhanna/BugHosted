import { Directive, ElementRef, EventEmitter, Output, AfterViewInit, OnDestroy, Input } from '@angular/core';

@Directive({
    selector: '[appInView]',
    standalone: false
})
export class InViewDirective implements AfterViewInit, OnDestroy {
  @Output() inView = new EventEmitter<boolean>();
  @Input() inViewDelayMs: number = 0; // dwell time before confirming
  @Input() inViewOnce: boolean = false; // emit only first true
  @Input() minHeight: number = 0; // require element height before considering
  @Input() requireUserScroll: boolean = false; // don't emit until user scrolls
  @Input() requireCenter: boolean = false; // require element center within viewport band
  @Input() centerTopRatio: number = 0.0; // top boundary ratio (0-1)
  @Input() centerBottomRatio: number = 1.0; // bottom boundary ratio (0-1)

  private observer: IntersectionObserver;
  private dwellTimer: any;
  private hasEmitted = false;
  private userScrolled = false;
  private scrollListener = () => { this.userScrolled = true; };

  constructor(private el: ElementRef) {
    const options: IntersectionObserverInit = {
      threshold: [0, 0.1, 0.25, 0.5, 0.75, 1]
    };

    this.observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry) return;
        const isIntersecting = entry.isIntersecting;

        if (this.dwellTimer) {
          clearTimeout(this.dwellTimer);
          this.dwellTimer = null;
        }

        if (!isIntersecting) {
          // Immediate false emit (unless once mode already emitted true)
          if (!(this.inViewOnce && this.hasEmitted)) {
            this.inView.emit(false);
          }
          return;
        }

        if (this.inViewOnce && this.hasEmitted) {
          return; // already done
        }

        // Gate: user scroll
        if (this.requireUserScroll && !this.userScrolled) {
          return;
        }

        // Gate: min height
        const el: HTMLElement = this.el.nativeElement;
        if (this.minHeight && el.offsetHeight < this.minHeight) {
          return;
        }

        // Gate: center band
        if (this.requireCenter) {
          const rect = el.getBoundingClientRect();
          const centerY = rect.top + rect.height / 2;
          const topBoundary = window.innerHeight * this.centerTopRatio;
          const bottomBoundary = window.innerHeight * this.centerBottomRatio;
          if (centerY < topBoundary || centerY > bottomBoundary) {
            return;
          }
        }

        // Dwell timer
        const delay = this.inViewDelayMs;
        if (delay > 0) {
          this.dwellTimer = setTimeout(() => {
            // Re-validate still intersecting & gates
            const rect2 = this.el.nativeElement.getBoundingClientRect();
            const stillVisible = rect2.bottom > 0 && rect2.top < window.innerHeight;
            if (!stillVisible) return;
            if (this.requireCenter) {
              const centerY2 = rect2.top + rect2.height / 2;
              const topB = window.innerHeight * this.centerTopRatio;
              const bottomB = window.innerHeight * this.centerBottomRatio;
              if (centerY2 < topB || centerY2 > bottomB) return;
            }
            this.inView.emit(true);
            this.hasEmitted = true;
            if (this.inViewOnce) {
              this.cleanupObserver();
            }
          }, delay);
        } else {
          this.inView.emit(true);
          this.hasEmitted = true;
          if (this.inViewOnce) {
            this.cleanupObserver();
          }
        }
      });
    }, options);
  }

  ngAfterViewInit() {
    window.addEventListener('scroll', this.scrollListener, { passive: true });
    this.observer.observe(this.el.nativeElement);
  }

  ngOnDestroy() {
    this.cleanupObserver();
  }

  private cleanupObserver() {
    if (this.dwellTimer) {
      clearTimeout(this.dwellTimer);
      this.dwellTimer = null;
    }
    if (this.observer) {
      this.observer.disconnect();
    }
    window.removeEventListener('scroll', this.scrollListener);
  }
}
