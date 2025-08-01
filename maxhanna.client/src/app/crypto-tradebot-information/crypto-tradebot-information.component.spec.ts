import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CryptoTradebotInformationComponent } from './crypto-tradebot-information.component';

describe('CryptoTradebotInformationComponent', () => {
  let component: CryptoTradebotInformationComponent;
  let fixture: ComponentFixture<CryptoTradebotInformationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CryptoTradebotInformationComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CryptoTradebotInformationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
