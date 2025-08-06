import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CryptoBitcoinPerformanceComponent } from './crypto-bitcoin-performance.component';

describe('CryptoBitcoinPerformanceComponent', () => {
  let component: CryptoBitcoinPerformanceComponent;
  let fixture: ComponentFixture<CryptoBitcoinPerformanceComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CryptoBitcoinPerformanceComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CryptoBitcoinPerformanceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
