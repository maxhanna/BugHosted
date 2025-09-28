import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CryptoTopTradersComponent } from './crypto-top-traders.component';

describe('CryptoTopTradersComponent', () => {
  let component: CryptoTopTradersComponent;
  let fixture: ComponentFixture<CryptoTopTradersComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CryptoTopTradersComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CryptoTopTradersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
