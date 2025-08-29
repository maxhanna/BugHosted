import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CryptoCoinVolumeGraphViewerComponent } from './crypto-coin-volume-graph-viewer.component';

describe('CryptoCoinVolumeGraphViewerComponent', () => {
  let component: CryptoCoinVolumeGraphViewerComponent;
  let fixture: ComponentFixture<CryptoCoinVolumeGraphViewerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CryptoCoinVolumeGraphViewerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CryptoCoinVolumeGraphViewerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
