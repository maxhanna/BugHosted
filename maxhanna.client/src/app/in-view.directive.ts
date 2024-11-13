import { Directive, ElementRef, EventEmitter, Output, AfterViewInit, OnDestroy } from '@angular/core';

@Directive({
  selector: '[appInView]'
})
export class InViewDirective implements AfterViewInit, OnDestroy {
  @Output() inView = new EventEmitter<boolean>();

  private observer: IntersectionObserver;
  private timeoutId: any;

  constructor(private el: ElementRef) {
    const options: IntersectionObserverInit = {
      threshold: 1.0
    };

    this.observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (this.timeoutId) {
          clearTimeout(this.timeoutId);
        }
        if (entry.isIntersecting) {
          // Set a timer before emitting the inView event
          this.timeoutId = setTimeout(() => {
            this.inView.emit(true);
          }, 10);  
        } else {
          this.inView.emit(false);
        }
      });
    }, options);
  }

  ngAfterViewInit() {
    this.observer.observe(this.el.nativeElement);
  }

  ngOnDestroy() {
    // Clean up the observer and timeout
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
    this.observer.disconnect();
  }
}
