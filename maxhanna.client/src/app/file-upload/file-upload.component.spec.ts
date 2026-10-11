import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpEventType } from '@angular/common/http';
import { ChangeDetectorRef, ElementRef } from '@angular/core';
import { of, Subject } from 'rxjs';
import { FileService } from '../../services/file.service';
import { FileUploadComponent } from './file-upload.component';
import { UserEventService } from '../../services/user-event.service';

describe('FileUploadComponent', () => {
  let component: FileUploadComponent;
  let fixture: ComponentFixture<FileUploadComponent>;
  let fileService: jasmine.SpyObj<FileService>;
  let userEventService: jasmine.SpyObj<UserEventService>;

  beforeEach(async () => {
    fileService = jasmine.createSpyObj<FileService>('FileService', [
      'uploadFileWithProgress',
      'getFileEntryByNameAndDirectory',
      'notifyFollowersFileUploaded',
    ]);
    userEventService = jasmine.createSpyObj<UserEventService>('UserEventService', [
      'insertUserEvent',
    ]);
    userEventService.insertUserEvent.and.resolveTo(true);
    await TestBed.configureTestingModule({
      declarations: [FileUploadComponent],
      providers: [
        { provide: FileService, useValue: fileService },
        { provide: UserEventService, useValue: userEventService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FileUploadComponent);
    component = fixture.componentInstance;
    component.user = { id: 5 } as any;
    component.inputtedParentRef = { getSessionToken: async () => 'session' } as any;
    component.uploadFileList = [
      new File(['one'], 'one.txt', { type: 'text/plain' }),
      new File(['two'], 'two.txt', { type: 'text/plain' }),
      new File(['three'], 'three.txt', { type: 'text/plain' }),
    ];
    component.fileInput = { nativeElement: { value: '' } } as ElementRef<HTMLInputElement>;
    component.folderVisibility = { nativeElement: { value: 'true' } } as ElementRef<HTMLSelectElement>;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('starts the next upload only after the previous request completes', async () => {
    const requests: Subject<any>[] = [];
    fileService.uploadFileWithProgress.and.callFake(() => {
      const request = new Subject<any>();
      requests.push(request);
      return request.asObservable();
    });

    const uploadRun = (component as any).upload();
    await Promise.resolve();
    await Promise.resolve();
    expect(fileService.uploadFileWithProgress).toHaveBeenCalledTimes(1);

    requests[0].next({ type: HttpEventType.Response, body: '[]' });
    await Promise.resolve();
    await Promise.resolve();
    expect(fileService.uploadFileWithProgress).toHaveBeenCalledTimes(2);

    requests[1].next({ type: HttpEventType.Response, body: '[]' });
    await Promise.resolve();
    await Promise.resolve();
    expect(fileService.uploadFileWithProgress).toHaveBeenCalledTimes(3);

    requests[2].next({ type: HttpEventType.Response, body: '[]' });
    await uploadRun;
    expect(fileService.uploadFileWithProgress).toHaveBeenCalledTimes(3);
    expect(component.isUploading).toBeFalse();
  });

  it('continues the queue after a request fails', async () => {
    const requests: Subject<any>[] = [];
    fileService.uploadFileWithProgress.and.callFake(() => {
      const request = new Subject<any>();
      requests.push(request);
      return request.asObservable();
    });
    spyOn(console, 'error');

    const uploadRun = (component as any).upload();
    await Promise.resolve();
    await Promise.resolve();
    expect(fileService.uploadFileWithProgress).toHaveBeenCalledTimes(1);

    requests[0].error(new Error('network error'));
    await Promise.resolve();
    await Promise.resolve();
    expect(fileService.uploadFileWithProgress).toHaveBeenCalledTimes(2);
    expect(component.uploadErrors['one.txt']).toBe('network error');

    requests[1].next({ type: HttpEventType.Response, body: '[]' });
    await Promise.resolve();
    await Promise.resolve();
    expect(fileService.uploadFileWithProgress).toHaveBeenCalledTimes(3);
    requests[2].next({ type: HttpEventType.Response, body: '[]' });
    await uploadRun;
    expect(component.isUploading).toBeFalse();
  });
});
