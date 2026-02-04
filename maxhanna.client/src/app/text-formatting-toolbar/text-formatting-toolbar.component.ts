import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { ChildComponent } from '../child.component';
import { AppComponent } from '../app.component';

@Component({
  selector: 'app-text-formatting-toolbar',
  standalone: false,
  templateUrl: './text-formatting-toolbar.component.html',
  styleUrl: './text-formatting-toolbar.component.css'
})
export class TextFormattingToolbarComponent extends ChildComponent implements OnInit {
  constructor() { super(); }

  @Input() inputtedParentRef?: AppComponent;
  @Input() hide = false;
  @Input() parent?: HTMLTextAreaElement | HTMLInputElement;
  @Input() parentId?: string;
  @Input() parentClass? = "";

  @Output() isExpandingEmojiPanel = new EventEmitter<boolean>();
  @Output() isExpandingComponentPanel = new EventEmitter<boolean>();
  @Output() isExpandingCrawlerPanel = new EventEmitter<boolean>();

  isEmojiPanelOpen = false;
  showComponentSelector = false;
  componentSearchTerm: string = '';
  isCrawlerOpen = false;
  ngOnInit(): void {
    this.parentRef = this.inputtedParentRef ?? this.parentRef;
  }
  get textarea(): HTMLTextAreaElement | HTMLInputElement {
    let element: HTMLTextAreaElement | HTMLInputElement | null = null;

    // First try by ID
    if (this.parent) {
      element = this.parent;
    }

    if (!element && this.parentId) {
      element = document.getElementById(this.parentId) as HTMLTextAreaElement;
    }

    if (!element && this.parentId) {
      element = document.getElementById(this.parentId) as HTMLInputElement;
    }

    if (!element) {
      const selector = this.parentClass ?? 'textarea';
      element = document.querySelector(selector) as HTMLTextAreaElement;
    }

    return element;
  }

  insertPollSnippet() {
    const pollTemplate = `
  [Poll]
  Question: What's your favorite color?
  Option 1: Red
  Option 2: Blue
  Option 3: Green
  Option 4: Yellow
  [/Poll]
    `.trim();

    // Assuming you have a reference to your textarea
    const currentPos = this.textarea.selectionStart ?? 0;
    const currentValue = this.textarea.value;

    // Insert the template at cursor position
    this.textarea.value = currentValue.substring(0, currentPos) +
      pollTemplate +
      currentValue.substring(currentPos);

    this.closeAnyPanel();
    // Set cursor after the inserted template
    this.textarea.selectionStart = currentPos + pollTemplate.length;
    this.textarea.selectionEnd = currentPos + pollTemplate.length;
    this.textarea.focus();
  }

  openComponentSelector() {
    this.isExpandingComponentPanel.emit(true);
    const parent = this.inputtedParentRef ?? this.parentRef;
    parent?.showOverlay();
    this.showComponentSelector = true;
    this.componentSearchTerm = '';
    this.focusElementById('componentFilter');
  }

  closeComponentSelector() {
    this.isExpandingComponentPanel.emit(false);
    const parent = this.inputtedParentRef ?? this.parentRef;
    parent?.closeOverlay();
    this.showComponentSelector = false;
  }

  openInsertEmojiPanel() {
    this.isExpandingEmojiPanel.emit(true);
    const parent = this.inputtedParentRef ?? this.parentRef;
    parent?.showOverlay();
    this.filteredEmojis = { ...parent?.emojiMap };
    this.isEmojiPanelOpen = true;
    // focus emoji search input by exact id used in template
    this.focusElementById('emojiFilter');
  }
  // Focus an element by exact id after a short delay so the panel can render
  private focusElementById(id: string) {
    setTimeout(() => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (el) {
        el.focus();
        if ((el as any).select) (el as any).select();
      }
    }, 50);
  }

  closeInsertEmojiPanel() {
    this.isEmojiPanelOpen = false;
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent) {
      parent.closeOverlay(false);
    }
    this.isExpandingEmojiPanel.emit(false);
  }
  insertComponent(componentTitle: string) {
    const componentTag = `||component:${componentTitle}||`;
    this.insertCustomText(componentTag);
    this.closeComponentSelector();
  }

  insertCustomText(text: string, componentId?: string) {
    let targetInput = componentId
      ? document.getElementById(componentId) as HTMLInputElement
      : this.textarea;

    if (!targetInput) return;

    const start = targetInput.selectionStart || 0;
    const end = targetInput.selectionEnd || 0;

    // Insert the text at cursor position
    targetInput.value = targetInput.value.substring(0, start) +
      text +
      targetInput.value.substring(end);

    // Set cursor after the inserted text
    targetInput.selectionStart = start + text.length;
    targetInput.selectionEnd = start + text.length;
    targetInput.focus();
  } 
  insertLink(componentId?: string) {
    // Open crawler popup to select/add a URL instead of using prompt
    this.openCrawler();
  }

  openCrawler() {
    this.isExpandingCrawlerPanel.emit(true); 
    setTimeout(() => { 
      const parent = this.inputtedParentRef ?? this.parentRef;
      parent?.showOverlay();
      this.isCrawlerOpen = true;  
    }, 50);
  }

  closeCrawler() {
    this.isExpandingCrawlerPanel.emit(false); 
    this.isCrawlerOpen = false;
    const parent = this.inputtedParentRef ?? this.parentRef;
    parent?.closeOverlay();
  }

  crawlerUrlSelected(md: any) {
    // md is MetaData from crawler; we only need the URL
    const url = md?.url;
    if (!url) {
      this.closeCrawler();
      return;
    }

    // Insert into the current textarea using same logic as old method
    const targetInput = this.textarea;
    if (!targetInput) return;
    const start = targetInput.selectionStart || 0;
    const end = targetInput.selectionEnd || 0;
    const selectedText = targetInput.value.substring(start, end);

    if (selectedText) {
      const insertText = `[${selectedText}][${url}]`;
      targetInput.value = targetInput.value.substring(0, start) + insertText + targetInput.value.substring(end);
      const cursorPos = start + insertText.length;
      targetInput.selectionStart = cursorPos;
      targetInput.selectionEnd = cursorPos;
      targetInput.focus();
    } else {
      const placeholder = 'text';
      const insertText = `[${placeholder}][${url}]`;
      targetInput.value = targetInput.value.substring(0, start) + insertText + targetInput.value.substring(start);
      const placeholderStart = start + 1;
      const placeholderEnd = placeholderStart + placeholder.length;
      targetInput.selectionStart = placeholderStart;
      targetInput.selectionEnd = placeholderEnd;
      targetInput.focus();
    }

    this.closeCrawler();
  }
  insertTag(tag: string, componentId?: string) {
    let targetInput = componentId
      ? document.getElementById(componentId) as HTMLInputElement
      : this.textarea;

    if (!targetInput) return;

    const start = targetInput.selectionStart || 0;
    const end = targetInput.selectionEnd || 0;
    const selectedText = targetInput.value.substring(start, end);

    let newText: string;
    let cursorOffset: number;

    if (selectedText) {
      if (tag.startsWith('#')) {
        newText = targetInput.value.substring(0, start) +
          `${tag} ${selectedText}` +
          targetInput.value.substring(end);
        cursorOffset = start + tag.length + selectedText.length + 4;
      } else {
        newText = targetInput.value.substring(0, start) +
          `[${tag}]${selectedText}[/${tag}]` +
          targetInput.value.substring(end);
        cursorOffset = start + tag.length * 2 + selectedText.length + 4;
      }
    } else {
      // Insert empty tag
      if (tag.startsWith('#')) {
        // For headings
        newText = targetInput.value.substring(0, end) +
          `${tag} ` +  // Space after header
          targetInput.value.substring(end);
        cursorOffset = end + tag.length + 3; // After header marker and space
      } else {
        // For other tags
        newText = targetInput.value.substring(0, end) +
          `[${tag}][/${tag}]` +
          targetInput.value.substring(end);
        cursorOffset = end + tag.length + 2; // Between tags
      }
    }

    // Apply changes
    targetInput.value = newText;

    this.closeAnyPanel();

    // Set cursor position
    targetInput.setSelectionRange(cursorOffset, cursorOffset);
    targetInput.focus();
  }

  insertBold(componentId?: string) {
    this.insertTag('b', componentId);
  }
  insertItalics(componentId?: string) {
    this.insertTag('i', componentId);
  }
  insertUnderline(componentId?: string) {
    this.insertTag('u', componentId);
  }
  insertBullet(componentId?: string) {
    this.insertTag('*', componentId);
  }
  insertH2(componentId?: string) {
    this.insertTag('## ', componentId);
  }
  insertH3(componentId?: string) {
    this.insertTag('### ', componentId);
  }
  insertEmoji(emoji: string) {
    this.textarea.value += emoji;
    this.closeInsertEmojiPanel();
  }
  getNavigationItems() {
    const parent = this.inputtedParentRef ?? this.parentRef;
    const items = parent?.navigationItems || [];
    const term = (this.componentSearchTerm || '').toLowerCase().trim();
    if (!term) return items;
    return items.filter((it: any) => (it.title || '').toLowerCase().includes(term) || (it.icon || '').toLowerCase().includes(term));
  }
  searchNavigationItems(e: any) {
    const val = (e && e.target && e.target.value) ? e.target.value : '';
    this.componentSearchTerm = val;
  }
  closeAnyPanel() {
    const button = document.getElementById('closeOverlay');
    if (button) {
      button.click();
    }
  }
}
