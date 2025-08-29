import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CryptoTradeHistoryComponent } from './crypto-trade-history.component';

describe('CryptoTradeHistoryComponent', () => {
  let component: CryptoTradeHistoryComponent;
  let fixture: ComponentFixture<CryptoTradeHistoryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CryptoTradeHistoryComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CryptoTradeHistoryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
