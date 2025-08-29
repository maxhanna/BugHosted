import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CryptoCoinGraphViewerComponent } from './crypto-coin-graph-viewer.component';

describe('CryptoCoinGraphViewerComponent', () => {
  let component: CryptoCoinGraphViewerComponent;
  let fixture: ComponentFixture<CryptoCoinGraphViewerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CryptoCoinGraphViewerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CryptoCoinGraphViewerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
