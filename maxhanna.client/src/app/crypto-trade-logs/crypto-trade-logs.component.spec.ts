import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CryptoTradeLogsComponent } from './crypto-trade-logs.component';

describe('CryptoTradeLogsComponent', () => {
  let component: CryptoTradeLogsComponent;
  let fixture: ComponentFixture<CryptoTradeLogsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CryptoTradeLogsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CryptoTradeLogsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
