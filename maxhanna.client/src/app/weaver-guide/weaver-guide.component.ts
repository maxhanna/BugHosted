import { AfterViewInit, Component, ElementRef, OnDestroy } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ChildComponent } from '../child.component';

@Component({
  selector: 'app-weaver-guide',
  templateUrl: './weaver-guide.component.html',
  styleUrl: './weaver-guide.component.css',
  standalone: false,
})
export class WeaverGuideComponent extends ChildComponent implements AfterViewInit, OnDestroy {
  private cleanupFns: Array<() => void> = [];

  constructor(private elementRef: ElementRef, private titleService: Title) { super(); }

  ngAfterViewInit() {
    this.titleService.setTitle('Weaver Help — Documentation');
    const host = this.elementRef.nativeElement as HTMLElement;

    // Scroll-spy: highlight the sidebar entry for the section in view.
    const links = Array.prototype.slice.call(host.querySelectorAll('.wg-nav a')) as HTMLAnchorElement[];
    const sections = links.map(a => {
      const id = (a.getAttribute('href') || '').slice(1);
      return id ? host.querySelector('#' + id) : null;
    });
    const topBtn = host.querySelector('.wg-top') as HTMLElement | null;

    const onScroll = () => {
      // Viewport-relative check — offsetTop would be fragile inside the app
      // shell (offsetParent chain differs from the standalone page).
      let current: HTMLAnchorElement | null = null;
      for (let i = 0; i < sections.length; i++) {
        const s = sections[i] as HTMLElement | null;
        if (s && s.getBoundingClientRect().top <= 120) current = links[i];
      }
      links.forEach(l => l.classList.remove('active'));
      if (current) current.classList.add('active');
      if (topBtn) topBtn.classList.toggle('show', window.scrollY > 600);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    this.cleanupFns.push(() => window.removeEventListener('scroll', onScroll));
    onScroll();

    // Section filter box (hides non-matching nav entries + their groups).
    const search = host.querySelector('.wg-search') as HTMLInputElement | null;
    if (search) {
      const onInput = () => {
        const q = search.value.trim().toLowerCase();
        links.forEach(a => {
          const hit = !q || (a.textContent || '').toLowerCase().indexOf(q) !== -1;
          a.style.display = hit ? '' : 'none';
        });
        host.querySelectorAll('.wg-nav-group').forEach(g => {
          let visible = false;
          let sibling = g.nextElementSibling;
          while (sibling && sibling.tagName === 'A') {
            if ((sibling as HTMLElement).style.display !== 'none') visible = true;
            sibling = sibling.nextElementSibling;
          }
          (g as HTMLElement).style.display = visible ? '' : 'none';
        });
      };
      search.addEventListener('input', onInput);
      this.cleanupFns.push(() => search.removeEventListener('input', onInput));
    }

    // Mobile nav toggle (sidebar collapses to a "Contents" button < 900px).
    const navToggle = host.querySelector('.wg-mobile-toggle') as HTMLElement | null;
    const docsNav = host.querySelector('.wg-nav') as HTMLElement | null;
    if (navToggle && docsNav) {
      const setNav = (open: boolean) => {
        docsNav.classList.toggle('open', open);
        navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        navToggle.textContent = open ? '✕ Close contents' : '☰ Contents';
      };
      const onToggle = () => setNav(!docsNav.classList.contains('open'));
      const onNavClick = (e: Event) => {
        if ((e.target as HTMLElement).tagName === 'A') setNav(false);
      };
      navToggle.addEventListener('click', onToggle);
      docsNav.addEventListener('click', onNavClick);
      this.cleanupFns.push(() => navToggle.removeEventListener('click', onToggle));
      this.cleanupFns.push(() => docsNav.removeEventListener('click', onNavClick));
    }

    // Back to top.
    if (topBtn) {
      const onTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
      topBtn.addEventListener('click', onTop);
      this.cleanupFns.push(() => topBtn.removeEventListener('click', onTop));
    }
  }

  scrollToSection(event: Event, id: string) {
    event.preventDefault();
    const host = this.elementRef.nativeElement as HTMLElement;
    const el = host.querySelector('#' + id) as HTMLElement | null;
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // On mobile, picking a section closes the nav so it never covers the target.
    const docsNav = host.querySelector('.wg-nav') as HTMLElement | null;
    const navToggle = host.querySelector('.wg-mobile-toggle') as HTMLElement | null;
    if (docsNav && navToggle && docsNav.classList.contains('open')) {
      docsNav.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
      navToggle.textContent = '☰ Contents';
    }
  }

  ngOnDestroy() {
    this.cleanupFns.forEach(fn => { try { fn(); } catch { } });
    this.cleanupFns = [];
  }
}
