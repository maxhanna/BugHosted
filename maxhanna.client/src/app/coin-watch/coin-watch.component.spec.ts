import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CoinWatchComponent } from './coin-watch.component';

describe('CoinWatchComponent', () => {
  let component: CoinWatchComponent;
  let fixture: ComponentFixture<CoinWatchComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CoinWatchComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(CoinWatchComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
