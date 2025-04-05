import { Component, ViewChild, ElementRef, OnDestroy, OnInit } from '@angular/core';
import { AiService } from '../../services/ai.service';
import { ChildComponent } from '../child.component';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { User } from '../../services/datacontracts/user/user';


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
    const user = this.parentRef?.user ?? new User(0); 
    this.userMessage = this.chatInput.nativeElement.value.trim();
    this.startLoading();
    if (this.userMessage.trim()) {
      this.pushMessage({ sender: 'You', message: this.userMessage.replace('\n', "<br>") });
      this.aiService.sendMessage(user, false, this.userMessage).then(
        (response) => {
          let reply = this.aiService.parseMessage(response.response);
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
