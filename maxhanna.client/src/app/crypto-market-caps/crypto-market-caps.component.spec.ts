import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CryptoMarketCapsComponent } from './crypto-market-caps.component';

describe('CryptoMarketCapsComponent', () => {
  let component: CryptoMarketCapsComponent;
  let fixture: ComponentFixture<CryptoMarketCapsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CryptoMarketCapsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CryptoMarketCapsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
