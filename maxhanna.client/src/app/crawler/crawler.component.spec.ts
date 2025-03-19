import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CrawlerComponent } from './crawler.component';

describe('CrawlerComponent', () => {
  let component: CrawlerComponent;
  let fixture: ComponentFixture<CrawlerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CrawlerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CrawlerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
