import { AfterViewInit, Component, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ChildComponent } from '../child.component';
import { AppComponent } from '../app.component';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { BookEntry } from '../../services/datacontracts/books/book-entry';
import { BooksService } from '../../services/books.service';
import { MediaSelectorComponent } from '../media-selector/media-selector.component';

type BooksTab = 'library' | 'catalog';

@Component({
  selector: 'app-ebooks',
  templateUrl: './ebooks.component.html',
  styleUrl: './ebooks.component.css',
  standalone: false
})
export class EbooksComponent extends ChildComponent implements AfterViewInit {
  @Input() inputtedParentRef?: AppComponent;
  @Input() showTitleBar = true;
  @Input() preloadBookId?: number;
  @Output() hasData = new EventEmitter<boolean>();

  @ViewChild(MediaSelectorComponent) mediaSelector?: MediaSelectorComponent;

  books: BookEntry[] = [];
  filteredBooks: BookEntry[] = [];
  activeTab: BooksTab = 'library';
  isMenuPanelOpen = false;

  // ---- add-book flow ----
  isAddPanelOpen = false;
  selectedBookFile?: FileEntry;
  selectedCoverFile?: FileEntry;
  newTitle = '';
  newAuthor = '';
  newDescription = '';
  isSubmittingBook = false;

  // ---- sharing ----
  shareBook?: BookEntry;
  shareUsername = '';
  shareMessage = '';

  // ---- editing ----
  editBook?: BookEntry;
  editTitle = '';
  editAuthor = '';
  editDescription = '';

  // ---- reader ----
  readingBook?: BookEntry;
  readerObjectUrl?: string;
  readerBlobType = '';
  isLoadingReader = false;
  readerError = '';
  textContent = '';
  pdfPage = 1;
  zoom = 1.0;

  searchQuery = '';
  formatFilter = '';

  public readonly allowedBookTypes = '.pdf,.txt,.doc,.docx,.docm,.dot,.dotx,.dotm,.rtf,.odt';

  constructor(public booksService: BooksService, private sanitizer: DomSanitizer) { super(); }

  async ngOnInit() {
    if (this.inputtedParentRef) this.parentRef = this.inputtedParentRef;
    await this.loadBooks();
    if (this.preloadBookId) {
      const pre = this.books.find(b => b.bookId === this.preloadBookId);
      if (pre) await this.openReader(pre);
    }
  }
  ngAfterViewInit() { }
  ngOnDestroy(): void {
    this.revokeReaderUrl();
  }
  safeDestroy() { this.ngOnDestroy(); }

  get isLoggedIn(): boolean { return !!this.parentRef?.user?.id; }
  get userId(): number { return this.parentRef?.user?.id ?? 0; }

  async showMenuPanel() {
    this.isMenuPanelOpen = true;
    this.parentRef?.showOverlay();
  }
  hideMenuPanel() {
    this.isMenuPanelOpen = false;
    this.parentRef?.closeOverlay();
  }
  hideLoginPopup() {
    this.parentRef?.closeOverlay();
  }
  onLoginClick() {
    this.parentRef?.showOverlay();
  }

  async loadBooks() {
    this.isLoading = true;
    try {
      if (this.isLoggedIn) {
        const token = await this.parentRef?.getSessionToken();
        if (this.activeTab === 'library') {
          this.books = await this.booksService.getMyLibrary(this.userId, token);
        } else {
          this.books = await this.booksService.getCatalog(this.userId);
        }
      } else {
        this.books = await this.booksService.getCatalog();
      }
      this.applyFilter();
      this.hasData.emit(this.books.length > 0);
      // Keep an open share dialog in sync with the freshly loaded data —
      // otherwise its visibility chips/status lag one reload behind.
      if (this.shareBook) {
        this.shareBook = this.books.find(b => b.bookId === this.shareBook!.bookId) ?? this.shareBook;
      }
    } finally {
      this.isLoading = false;
    }
  }

  async switchTab(tab: BooksTab) {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    await this.loadBooks();
  }

  applyFilter() {
    const q = this.searchQuery.trim().toLowerCase();
    const fmt = this.formatFilter.trim().toLowerCase();
    this.filteredBooks = this.books.filter(b => {
      if (fmt && (b.fileType || '').toLowerCase() !== fmt) return false;
      if (!q) return true;
      return (b.title || '').toLowerCase().includes(q)
        || (b.author || '').toLowerCase().includes(q)
        || (b.description || '').toLowerCase().includes(q)
        || (b.ownerName || '').toLowerCase().includes(q);
    });
  }

  get availableFormats(): string[] {
    const set = new Set<string>();
    for (const b of this.books) if (b.fileType) set.add(b.fileType.toLowerCase());
    return Array.from(set).sort();
  }

  // ================= Add book flow =================

  openAddPanel() {
    if (!this.isLoggedIn) { this.onLoginClick(); return; }
    this.isAddPanelOpen = true;
  }
  closeAddPanel() {
    this.isAddPanelOpen = false;
    this.selectedBookFile = undefined;
    this.selectedCoverFile = undefined;
    this.newTitle = '';
    this.newAuthor = '';
    this.newDescription = '';
  }

  onBookFileSelected(files: FileEntry[]) {
    const first = files && files.length > 0 ? files[0] : undefined;
    this.selectedBookFile = first;
    if (first && !this.newTitle.trim()) {
      this.newTitle = this.titleFromFile(first);
    }
  }
  onCoverFileSelected(files: FileEntry[]) {
    const first = files && files.length > 0 ? files[0] : undefined;
    this.selectedCoverFile = first;
  }

  private titleFromFile(f: FileEntry): string {
    const name = f.givenFileName || f.fileName || '';
    const dot = name.lastIndexOf('.');
    return dot > 0 ? name.slice(0, dot) : name;
  }

  async submitBook() {
    if (!this.isLoggedIn || this.isSubmittingBook) return;
    if (!this.selectedBookFile?.id) {
      this.parentRef?.showNotification('Pick a book file (PDF, TXT or Word) first.');
      return;
    }
    if (!this.newTitle.trim()) {
      this.parentRef?.showNotification('Give your book a title.');
      return;
    }
    this.isSubmittingBook = true;
    try {
      const token = await this.parentRef?.getSessionToken();
      const result = await this.booksService.registerBook({
        userId: this.userId,
        fileId: this.selectedBookFile.id,
        title: this.newTitle.trim(),
        author: this.newAuthor.trim() || undefined,
        description: this.newDescription.trim() || undefined,
        coverFileId: this.selectedCoverFile?.id,
        isPublic: false,
      }, token);
      if (result) {
        this.parentRef?.showNotification(result.updated
          ? `Updated "${this.newTitle.trim()}" in your library.`
          : `"${this.newTitle.trim()}" added to your library.`);
        this.closeAddPanel();
        await this.loadBooks();
      } else {
        this.parentRef?.showNotification('Could not add the book. Supported: pdf, txt, doc, docx, rtf, odt.');
      }
    } finally {
      this.isSubmittingBook = false;
    }
  }

  // ================= Sharing =================

  openSharePanel(book: BookEntry) {
    this.shareBook = book;
    this.shareUsername = '';
    this.shareMessage = '';
  }
  closeSharePanel() { this.shareBook = undefined; this.shareMessage = ''; }

  async sharePublicly() {
    if (!this.shareBook || !this.isLoggedIn) return;
    const token = await this.parentRef?.getSessionToken();
    const res = await this.booksService.shareBook({
      userId: this.userId, bookId: this.shareBook.bookId, makePublic: true,
    }, token);
    if (res?.success) {
      this.shareMessage = 'Book is now public — everyone can see it in the catalog.';
      await this.loadBooks();
    } else {
      this.shareMessage = 'Could not share the book. Try again.';
    }
  }

  async shareWithUser() {
    if (!this.shareBook || !this.isLoggedIn) return;
    const name = this.shareUsername.trim();
    if (!name) { this.shareMessage = 'Enter a username to share with.'; return; }
    const token = await this.parentRef?.getSessionToken();
    const res = await this.booksService.shareBook({
      userId: this.userId, bookId: this.shareBook.bookId, usernames: [name],
    }, token);
    if (res?.success) {
      if (res.unknownUsernames && res.unknownUsernames.length > 0) {
        this.shareMessage = `User "${name}" was not found.`;
      } else {
        this.shareMessage = `Shared with ${name}.`;
        this.shareUsername = '';
        await this.loadBooks();
      }
    } else {
      this.shareMessage = 'Could not share the book. Try again.';
    }
  }

  async makePrivate() {
    if (!this.shareBook || !this.isLoggedIn) return;
    const token = await this.parentRef?.getSessionToken();
    const ok = await this.booksService.unshareBook({
      userId: this.userId, bookId: this.shareBook.bookId, makePublic: true,
    }, token);
    if (ok) {
      this.shareMessage = 'Book is private again — only you (and anyone individually shared) can see it.';
      await this.loadBooks();
    } else {
      this.shareMessage = 'Could not update sharing. Try again.';
    }
  }

  sharedUserEntries(book: BookEntry): { id: number; label: string }[] {
    return (book.sharedWith || []).map(id => ({ id, label: `user ${id}` }));
  }

  async removeSharedUser(id: number) {
    if (!this.shareBook || !this.isLoggedIn) return;
    const token = await this.parentRef?.getSessionToken();
    const ok = await this.booksService.unshareBook({
      userId: this.userId, bookId: this.shareBook.bookId, userIds: [id],
    }, token);
    if (ok) {
      this.shareMessage = 'Removed from shared list.';
      await this.loadBooks();
    }
  }

  /** Cover load failed (e.g. missing image) — fall back to the generated SVG. */
  onCoverError(event: Event, book: BookEntry) {
    const img = event.target as HTMLImageElement;
    if (img) {
      img.src = this.booksService.getCoverUrl({ ...book, coverFileId: undefined, coverUrl: undefined });
    }
  }

  /** Jump to the uploader's profile page. */
  openOwner(event: Event, book: BookEntry) {
    event.preventDefault();
    event.stopPropagation();
    if (book.ownerId && this.parentRef) {
      this.parentRef.createComponent('User', { userId: book.ownerId });
    }
  }

  canManage(book: BookEntry): boolean {
    return this.isLoggedIn && book.ownerId === this.userId;
  }

  visibilityLabel(book: BookEntry): string {
    if (book.isPublic) return '🌍 Public';
    if ((book.sharedWith || []).length > 0) return `👥 Shared (${book.sharedWith.length})`;
    return '🔒 Private';
  }

  formatLabel(ext: string): string {
    switch ((ext || '').toLowerCase()) {
      case 'pdf': return 'PDF';
      case 'txt': return 'TXT';
      case 'doc': return 'DOC';
      case 'docx': return 'DOCX';
      case 'docm': return 'DOCM';
      case 'dot': return 'DOT';
      case 'dotx': return 'DOTX';
      case 'dotm': return 'DOTM';
      case 'rtf': return 'RTF';
      case 'odt': return 'ODT';
      default: return (ext || '').toUpperCase();
    }
  }

  // ================= Edit / remove =================

  openEditPanel(book: BookEntry) {
    this.editBook = book;
    this.editTitle = book.title;
    this.editAuthor = book.author || '';
    this.editDescription = book.description || '';
  }
  closeEditPanel() { this.editBook = undefined; }

  async saveEdit() {
    if (!this.editBook || !this.isLoggedIn) return;
    if (!this.editTitle.trim()) { this.parentRef?.showNotification('Title cannot be empty.'); return; }
    const token = await this.parentRef?.getSessionToken();
    const ok = await this.booksService.updateBook({
      userId: this.userId,
      bookId: this.editBook.bookId,
      title: this.editTitle.trim(),
      author: this.editAuthor.trim() || undefined,
      description: this.editDescription.trim() || undefined,
    }, token);
    if (ok) {
      this.parentRef?.showNotification('Book updated.');
      this.closeEditPanel();
      await this.loadBooks();
    } else {
      this.parentRef?.showNotification('Could not update the book.');
    }
  }

  async removeBook(book: BookEntry) {
    if (!this.isLoggedIn || !this.canManage(book)) return;
    if (!confirm(`Remove "${book.title}" from your library? The uploaded file itself is not deleted.`)) return;
    const token = await this.parentRef?.getSessionToken();
    const ok = await this.booksService.removeBook({ userId: this.userId, bookId: book.bookId }, token);
    if (ok) {
      this.parentRef?.showNotification(`Removed "${book.title}" from your library.`);
      await this.loadBooks();
    } else {
      this.parentRef?.showNotification('Could not remove the book.');
    }
  }

  // ================= Reader =================

  async openReader(book: BookEntry) {
    this.readingBook = book;
    this.readerError = '';
    this.textContent = '';
    this.pdfPage = 1;
    this.zoom = 1.0;
    this.isLoadingReader = true;
    this.revokeReaderUrl();
    try {
      const blob = await this.booksService.downloadBook(book.fileId);
      if (!blob || blob.size === 0) {
        this.readerError = 'Could not load the book file (empty or missing).';
        return;
      }
      const ext = (book.fileType || '').toLowerCase();
      if (ext === 'pdf') {
        this.readerBlobType = 'application/pdf';
      } else if (ext === 'txt' || ext === 'md' || ext === 'rtf') {
        this.readerBlobType = 'text';
        this.textContent = await blob.text();
        return; // no object url needed
      } else {
        // Word formats cannot be rendered natively by browsers — offer download.
        this.readerBlobType = 'download';
        this.readerObjectUrl = URL.createObjectURL(blob);
        return;
      }
      this.readerObjectUrl = URL.createObjectURL(new Blob([blob], { type: this.readerBlobType }));
    } catch (ex) {
      console.error('Error opening book:', ex);
      this.readerError = 'Failed to open the book.';
    } finally {
      this.isLoadingReader = false;
    }
  }

  closeReader() {
    this.readingBook = undefined;
    this.textContent = '';
    this.readerError = '';
    this.revokeReaderUrl();
  }

  private revokeReaderUrl() {
    if (this.readerObjectUrl) {
      try { URL.revokeObjectURL(this.readerObjectUrl); } catch { }
      this.readerObjectUrl = undefined;
    }
    this.readerUrlCache = null;
  }

  downloadReadingBook() {
    const book = this.readingBook;
    if (!book || !this.readerObjectUrl) return;
    const a = document.createElement('a');
    a.href = this.readerObjectUrl;
    a.download = `${book.title || 'book'}.${book.fileType || 'bin'}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  copyShareLink(book: BookEntry) {
    const link = this.booksService.getShareLink(book);
    navigator.clipboard?.writeText(link).then(
      () => this.parentRef?.showNotification('Share link copied to clipboard.'),
      () => this.parentRef?.showNotification(link),
    );
  }

  zoomIn() { this.zoom = Math.min(2.5, +(this.zoom + 0.15).toFixed(2)); }
  zoomOut() { this.zoom = Math.max(0.5, +(this.zoom - 0.15).toFixed(2)); }
  nextPdfPage() { this.pdfPage++; }
  prevPdfPage() { if (this.pdfPage > 1) this.pdfPage--; }

  /** blob: URLs are rejected by Angular's default URL sanitizer, so the PDF
   *  iframe src is explicitly trusted here. The blob only ever comes from the
   *  book's own /file/getfilebyid response, so it is a same-origin resource.
   *  The SafeResourceUrl is memoized on the underlying string — a fresh object
   *  per change-detection cycle would re-set the iframe src and reload the PDF
   *  on every CD pass. */
  private readerUrlCache: { key: string; value: SafeResourceUrl } | null = null;
  get readerUrl(): SafeResourceUrl | undefined {
    if (!this.readerObjectUrl) return undefined;
    const key = `${this.readerObjectUrl}#page=${this.pdfPage}&zoom=${Math.round(this.zoom * 100)}`;
    if (!this.readerUrlCache || this.readerUrlCache.key !== key) {
      this.readerUrlCache = { key, value: this.sanitizer.bypassSecurityTrustResourceUrl(key) };
    }
    return this.readerUrlCache.value;
  }
}
