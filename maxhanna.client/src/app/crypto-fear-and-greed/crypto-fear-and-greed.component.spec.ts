import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CryptoFearAndGreedComponent } from './crypto-fear-and-greed.component';

describe('CryptoFearAndGreedComponent', () => {
  let component: CryptoFearAndGreedComponent;
  let fixture: ComponentFixture<CryptoFearAndGreedComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CryptoFearAndGreedComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CryptoFearAndGreedComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
