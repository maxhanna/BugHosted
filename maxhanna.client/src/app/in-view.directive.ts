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
  @Input() debug: boolean = false; // enable console logging for diagnostics
  @Input() zeroHeightFallback: boolean = true; // treat zero-height visible elements as visible (helps lazy shells)

  private observer: IntersectionObserver;
  private dwellTimer: any;
  private hasEmitted = false;
  private userScrolled = false;
  private scrollListener = () => { this.userScrolled = true; };
  private fallbackChecksScheduled = false; // avoid duplicate scheduling

  private isiOS(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1); // iPadOS masquerading as Mac
  }

  private manualVisibilityCheck() {
    const el: HTMLElement = this.el.nativeElement;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const withinVertical = rect.bottom > 0 && rect.top < window.innerHeight;
    const withinHorizontal = rect.right > 0 && rect.left < window.innerWidth;
    let isIntersecting = withinVertical && withinHorizontal;
    if (!isIntersecting && this.zeroHeightFallback) {
      if (withinVertical && (rect.height === 0 || rect.width === 0)) {
        isIntersecting = true;
        if (this.debug) console.log('[InViewDirective] manual zero-height fallback applied (iOS)', { rect });
      }
    }
    if (!isIntersecting) {
      if (this.debug) console.log('[InViewDirective] manual check: not visible');
      if (!(this.inViewOnce && this.hasEmitted)) {
        this.inView.emit(false);
      }
      return;
    }
    // apply gating rules similar to observer callback
    if (this.requireUserScroll && !this.userScrolled) return;
    if (this.minHeight && el.offsetHeight < this.minHeight) return;
    if (this.requireCenter) {
      const centerY = rect.top + rect.height / 2;
      const topBoundary = window.innerHeight * this.centerTopRatio;
      const bottomBoundary = window.innerHeight * this.centerBottomRatio;
      if (centerY < topBoundary || centerY > bottomBoundary) return;
    }
    if (this.debug) console.log('[InViewDirective] manual check emit true');
    this.inView.emit(true);
    this.hasEmitted = true;
    if (this.inViewOnce) this.cleanupObserver();
  }

  constructor(private el: ElementRef) {
    const options: IntersectionObserverInit = {
      threshold: [0, 0.01, 0.1, 0.25, 0.5, 0.75, 1],
      root: null,
      rootMargin: '64px 0px 64px 0px' // pre-trigger slightly before entering viewport
    };

    this.observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry) return;
        let isIntersecting = entry.isIntersecting;

        // Fallback: if element has zero height (placeholder) but its top is within viewport, optionally treat as intersecting
        if (!isIntersecting && this.zeroHeightFallback) {
          const hostEl: HTMLElement = this.el.nativeElement;
          const rect = hostEl.getBoundingClientRect();
            // visible vertically even if height 0 (e.g., will grow once data loads)
          const withinVertical = rect.top < window.innerHeight && rect.bottom >= 0;
          if (withinVertical && (rect.height === 0 || rect.width === 0)) {
            isIntersecting = true;
            if (this.debug) console.log('[InViewDirective] zero-height fallback applied', { rect });
          }
        }

        if (this.debug) {
          const hostEl: HTMLElement = this.el.nativeElement;
          console.log('[InViewDirective] observe', {
            time: Date.now(),
            isIntersecting,
            ratio: entry.intersectionRatio,
            elSize: { w: hostEl.offsetWidth, h: hostEl.offsetHeight },
            bounding: entry.boundingClientRect,
            rootBounds: entry.rootBounds,
            requireUserScroll: this.requireUserScroll,
            userScrolled: this.userScrolled
          });
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
            if (this.debug) console.log('[InViewDirective] emit true (delayed)');
            this.inView.emit(true);
            this.hasEmitted = true;
            if (this.inViewOnce) {
              this.cleanupObserver();
            }
          }, delay);
        } else {
          if (this.debug) console.log('[InViewDirective] emit true (immediate)');
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
    // Immediate manual check in case IntersectionObserver doesn't fire initially (not uncommon on iOS Safari)
    this.manualVisibilityCheck();
    if (this.isiOS() && !this.fallbackChecksScheduled) {
      this.fallbackChecksScheduled = true;
      // staggered retries to catch layout shifts / image loads
      [100, 300, 600].forEach(delay => setTimeout(() => this.manualVisibilityCheck(), delay));
      // orientation / resize triggers
      const recheck = () => this.manualVisibilityCheck();
      window.addEventListener('orientationchange', recheck, { passive: true });
      window.addEventListener('resize', recheck, { passive: true });
    }
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
  if (this.debug) console.log('[InViewDirective] cleanup');
  }
}
