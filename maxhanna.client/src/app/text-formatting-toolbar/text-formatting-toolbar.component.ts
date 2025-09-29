import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ChildComponent } from '../child.component';
import { AppComponent } from '../app.component';

@Component({
  selector: 'app-text-formatting-toolbar',
  standalone: false,
  templateUrl: './text-formatting-toolbar.component.html',
  styleUrl: './text-formatting-toolbar.component.css'
})
export class TextFormattingToolbarComponent extends ChildComponent { 
  constructor() { super(); }

  @Input() inputtedParentRef?: AppComponent; 
  @Input() hide = false;
  @Input() parent?: HTMLTextAreaElement | HTMLInputElement;
  @Input() parentId?: string;
  @Input() parentClass? = "";

  @Output() isExpandingEmojiPanel = new EventEmitter<boolean>();
  @Output() isExpandingComponentPanel = new EventEmitter<boolean>();

  isEmojiPanelOpen = false;
  showComponentSelector = false;

  get textarea(): HTMLTextAreaElement | HTMLInputElement  {
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

    // If not found by ID, try by class or default selector
    if (!element) {
      const selector = this.parentClass ?? 'textarea';
      element = document.querySelector(selector) as HTMLTextAreaElement;
    }

    // If still not found, you could throw an error or return a default
    if (!element) {
      console.warn('Textarea element not found');
      // Optionally throw an error: throw new Error('Textarea element not found');
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
  /**
   * Insert a link using the format [label][url].
   * If the user has text selected it will use that as the label and wrap it.
   * Otherwise it will insert a placeholder label and the provided url.
   */
  insertLink(componentId?: string) {
    let targetInput = componentId
      ? document.getElementById(componentId) as HTMLInputElement
      : this.textarea;

    if (!targetInput) return;

    const start = targetInput.selectionStart || 0;
    const end = targetInput.selectionEnd || 0;
    const selectedText = targetInput.value.substring(start, end);

    // Ask for URL
    const url = window.prompt('Enter URL (include http(s)://)', 'https://www.example.com');
    if (!url) return; // cancelled

    let insertText: string;
    let cursorPos = start;

    if (selectedText) {
      // Wrap selected text
      insertText = `[${selectedText}][${url}]`;
      targetInput.value = targetInput.value.substring(0, start) + insertText + targetInput.value.substring(end);
      cursorPos = start + insertText.length;
    } else {
      // Insert placeholder
      const placeholder = 'text';
      insertText = `[${placeholder}][${url}]`;
      targetInput.value = targetInput.value.substring(0, start) + insertText + targetInput.value.substring(start);
      // place caret between [ and ] of the placeholder to let user edit
      const placeholderStart = start + 1; // after '['
      const placeholderEnd = placeholderStart + placeholder.length;
      targetInput.selectionStart = placeholderStart;
      targetInput.selectionEnd = placeholderEnd;
      targetInput.focus();
      return;
    }

    // set cursor after inserted text
    targetInput.selectionStart = cursorPos;
    targetInput.selectionEnd = cursorPos;
    targetInput.focus();
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
    return parent?.navigationItems || [];
  }
  closeAnyPanel() {
    const button = document.getElementById('closeOverlay');
    if (button) {
      button.click();
    }
  }
}
