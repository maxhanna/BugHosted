import { Directive, ElementRef, EventEmitter, Output, AfterViewInit, OnDestroy, Input } from '@angular/core';

@Directive({
  selector: '[appInView]',
  standalone: false
})
export class InViewDirective implements AfterViewInit, OnDestroy {
  @Output() inView = new EventEmitter<boolean>();
  @Input() inViewOnce: boolean = false; // emit only first true
  @Input() zeroHeightFallback: boolean = true; // treat zero-height visible elements as visible (helps lazy shells)

  private observer: IntersectionObserver;
  private dwellTimer: any;
  private hasEmitted = false;

  constructor(private el: ElementRef) {
    const options: IntersectionObserverInit = {
      threshold: [0], // coarser + much faster on mobile/Safari
      root: null,
      rootMargin: '64px 0px 64px 0px'
    };

    this.observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry) return;
        let isIntersecting = entry.isIntersecting;

        // Fallback: if element has zero height (placeholder) but its top is within viewport, optionally treat as intersecting
        if (!isIntersecting && this.zeroHeightFallback) {
          const hostEl: HTMLElement = this.el.nativeElement;
          const rect = hostEl.getBoundingClientRect();
          const withinVertical = rect.top < window.innerHeight && rect.bottom >= 0;
          if (withinVertical && (rect.height === 0 || rect.width === 0)) {
            isIntersecting = true;
          }
        }

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

        this.inView.emit(true);
        this.hasEmitted = true;
        if (this.inViewOnce) {
          this.cleanupObserver();
        }
      });
    }, options);
  }

  ngAfterViewInit() {
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
  }
}
