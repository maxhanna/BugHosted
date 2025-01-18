import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CryptoHubComponent } from './crypto-hub.component';

describe('CryptoHubComponent', () => {
  let component: CryptoHubComponent;
  let fixture: ComponentFixture<CryptoHubComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CryptoHubComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(CryptoHubComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
