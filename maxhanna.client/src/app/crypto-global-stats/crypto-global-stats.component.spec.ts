import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CryptoGlobalStatsComponent } from './crypto-global-stats.component';

describe('CryptoGlobalStatsComponent', () => {
  let component: CryptoGlobalStatsComponent;
  let fixture: ComponentFixture<CryptoGlobalStatsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CryptoGlobalStatsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CryptoGlobalStatsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
