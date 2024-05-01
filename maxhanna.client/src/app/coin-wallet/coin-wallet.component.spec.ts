import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CoinWalletComponent } from './coin-wallet.component';

describe('CoinWalletComponent', () => {
  let component: CoinWalletComponent;
  let fixture: ComponentFixture<CoinWalletComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CoinWalletComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(CoinWalletComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
