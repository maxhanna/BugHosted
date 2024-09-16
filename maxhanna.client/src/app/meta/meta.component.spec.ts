import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MetaComponent } from './meta.component';

describe('MetaComponent', () => {
  let component: MetaComponent;
  let fixture: ComponentFixture<MetaComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [MetaComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MetaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
