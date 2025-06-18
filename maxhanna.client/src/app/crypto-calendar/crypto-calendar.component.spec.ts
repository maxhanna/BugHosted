import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CryptoCalendarComponent } from './crypto-calendar.component';

describe('CryptoCalendarComponent', () => {
  let component: CryptoCalendarComponent;
  let fixture: ComponentFixture<CryptoCalendarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CryptoCalendarComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CryptoCalendarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
