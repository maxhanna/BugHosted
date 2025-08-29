import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CryptoLiveTradeViewComponent } from './crypto-live-trade-view.component';

describe('CryptoLiveTradeViewComponent', () => {
  let component: CryptoLiveTradeViewComponent;
  let fixture: ComponentFixture<CryptoLiveTradeViewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CryptoLiveTradeViewComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CryptoLiveTradeViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
