import { Component, ViewChild, ElementRef, OnDestroy, OnInit } from '@angular/core';
import { AiService } from '../../services/ai.service';
import { ChildComponent } from '../child.component';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';


@Component({
  selector: 'app-host-ai',
  templateUrl: './host-ai.component.html',
  styleUrl: './host-ai.component.css',
  standalone: false
})
export class HostAiComponent extends ChildComponent implements OnInit, OnDestroy {
  constructor(private aiService: AiService, private sanitizer: DomSanitizer) { super(); }
  userMessage: string = '';
  chatMessages: { sender: string, message: any }[] = [];

  @ViewChild('chatInput') chatInput!: ElementRef<HTMLInputElement>;
  @ViewChild('chatContainer') chatContainer!: ElementRef<HTMLDivElement>;

  ngOnInit() {
    this.parentRef?.addResizeListener();
  }
  ngOnDestroy() {
    this.parentRef?.removeResizeListener();
  }
  sendMessage() {
    const user = this.parentRef?.user;
    if (!user) { return alert("You must be logged in to use this feature!"); }
    this.userMessage = this.chatInput.nativeElement.value.trim();
    this.startLoading();
    if (this.userMessage.trim()) {
      this.pushMessage({ sender: 'You', message: this.userMessage });
      this.aiService.sendMessage(user, this.userMessage).then(
        (response) => {
          let reply = this.parseMessage(response.response);
          this.pushMessage({ sender: 'Host', message: reply });
          this.stopLoading();
        },
        (error) => {
          console.error(error);
          this.pushMessage({ sender: 'System', message: error.reply });
          this.stopLoading();
        }
      );

      this.userMessage = '';
      this.chatInput.nativeElement.value = "";
      this.chatInput.nativeElement.focus();
    }
  }
  generateImage() {
    return alert("Feature not yet available");
  }
  handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      if (event.shiftKey) {
        return;
      } else {
        event.preventDefault();
        this.sendMessage();
      }
    }
  }

  parseMessage(message: string): string {
    if (!message) return '';

    // Preserve <pre> blocks
    const preBlocks: string[] = [];
    message = message.replace(/<pre>([\s\S]*?)<\/pre>/g, (match, code) => {
      preBlocks.push(code);
      return `<pre-placeholder-${preBlocks.length - 1}>`;
    });

    // Convert **bold** to <b>...</b>
    message = message.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');

    // Convert *italic* to <i>...</i>
    message = message.replace(/\*(.*?)\*/g, '<i>$1</i>');

    // Convert [text](URL) to <a href="URL">text</a>
    message = message.replace(/\[([^\]]+)\]\((https?:\/\/[^\s]+)\)/g, '<a href="$2" target="_blank">$1</a>');

    // Convert special HTML entities
    message = message
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&copy;/g, '©');

    // Convert line breaks to <br> (except in <pre>)
    message = message.replace(/\n/g, '<br>');

    // Restore <pre> blocks
    message = message.replace(/<pre-placeholder-(\d+)>/g, (_, index) => {
      return `<pre>${preBlocks[parseInt(index)]}</pre>`;
    });

    return message;
  }  
  insertAtCursor(text: string): void {
    const chatInput = <HTMLTextAreaElement>document.querySelector('textarea');
    const cursorPos = chatInput.selectionStart;
    const textBefore = this.userMessage.substring(0, cursorPos);
    const textAfter = this.userMessage.substring(cursorPos, this.userMessage.length);

    // Update the textarea value with the code snippet
    this.userMessage = textBefore + text + textAfter;

    // Move the cursor position after the inserted snippet
    setTimeout(() => {
      chatInput.selectionStart = chatInput.selectionEnd = cursorPos + text.length;
      chatInput.focus();
    }, 0);
  }
  createCodeSnippet(): void {
    const codeSnippet = `\`\`\`
console.log("Hello, world!");
\`\`\``;
    this.insertAtCursor(codeSnippet);
  } 
  pushMessage(message: any) {
    this.chatMessages.push(message);
    setTimeout(() => { 
        const tgt = document.getElementsByClassName("chat-box")[0];
        if (tgt) {
          tgt.scrollTop = tgt.scrollHeight;
        }  
    }, 500);
  }
}
