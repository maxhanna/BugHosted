import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CryptoWalletsComponent } from './crypto-wallets.component';

describe('CryptoWalletsComponent', () => {
  let component: CryptoWalletsComponent;
  let fixture: ComponentFixture<CryptoWalletsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CryptoWalletsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CryptoWalletsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
