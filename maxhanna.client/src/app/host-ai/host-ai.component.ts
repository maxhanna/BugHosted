import { Component, ViewChild, ElementRef } from '@angular/core';
import { AiService } from '../../services/ai.service'; 
import { ChildComponent } from '../child.component'; 


@Component({
  selector: 'app-host-ai',
  templateUrl: './host-ai.component.html',
  styleUrl: './host-ai.component.css'
})
export class HostAiComponent extends ChildComponent {
  constructor(private aiService: AiService) { super(); }
  userMessage: string = '';  
  chatMessages: { sender: string, message: any }[] = [];  

  @ViewChild('chatInput') chatInput!: ElementRef<HTMLInputElement>;
  @ViewChild('chatContainer') chatContainer!: ElementRef<HTMLDivElement>;

  sendMessage() {
    this.userMessage = this.chatInput.nativeElement.value.trim();
    this.startLoading();
    if (this.userMessage.trim()) { 
      this.pushMessage({ sender: 'You', message: this.userMessage });
      console.log(this.userMessage);
      this.aiService.sendMessage(this.userMessage).then(
        (response) => { 
          this.pushMessage({ sender: 'Host', message: response.reply });
          this.stopLoading();
        },
        (error) => { 
          console.error(error);
          this.pushMessage({ sender: 'System', message: 'Error communicating with the server.' });
          this.stopLoading();
        }
      );
       
      this.userMessage = '';
      this.chatInput.nativeElement.value = "";
      this.chatInput.nativeElement.focus();
    }
  }
  generateImage() {
    this.userMessage = this.chatInput.nativeElement.value.trim();
    const prompt = this.userMessage.trim();
    if (!prompt) return;

    this.startLoading();
    this.pushMessage({ sender: 'You', message: prompt });

    this.aiService.generateImage(prompt).then(
      (response) => {
        if (response && response.reply && response.mimeType) {
          this.pushMessage({ sender: 'Host', message: { reply: response.reply, mimeType: response.mimeType } });
        } else { 
          this.pushMessage({ sender: 'Host', message: `Error generating image.` });
        }
        this.stopLoading();
      },
      (error) => {
        console.error('Image generation failed:', error);
        this.stopLoading();
      }
    );
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
  parseGeminiMessage(message: any): string {
    console.log(message);
    if (message?.message?.reply && message?.message?.mimeType) {
      let safeUrl = `data:${message.message.mimeType};base64,${message.message.reply}`;

      console.log(safeUrl.toString());
      return safeUrl.toString(); // Bypass Angular's sanitization for trusted HTML
    } 
    if (message?.sender === 'You' || message?.sender === 'System') {
      // For user/system messages, don't allow HTML rendering
      return this.formatMessage(message.message, false);
    }

    // For AI responses, allow HTML rendering
    return this.formatMessage(message?.message ?? message, true);
  }

  formatMessage(text: string, allowHtml?: boolean): string {
    // First, handle code blocks (```)
    let formattedText = text
      .replace(/```([\s\S]*?)```/g, (_, codeContent) => {
        return `<pre><code>${this.escapeHtml(codeContent.trim())}</code></pre>`;
      }) // Wrap code blocks with <pre><code> tags
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") // **bold** → <strong>bold</strong>
      .replace(/^(\d+)\. (.*)$/gm, "<ol><li>$2</li></ol>") // 1. List item → <ol><li>List item</li></ol>
      .replace(/^- (.*)$/gm, "<ul><li>$1</li></ul>"); // - List item → <ul><li>List item</li></ul>

    // Replace line breaks outside of code blocks (we don't want them inside <pre><code>)
    formattedText = formattedText.replace(/(?:^|\n)(?!<pre><code>)/g, "<br>");

    // Now, either escape or allow HTML tags depending on the flag
    return formattedText;
  }

  escapeHtmlExceptCode(text: string): string {
    // Escape HTML except inside code blocks
    return text.replace(/<pre><code>[\s\S]*?<\/code><\/pre>/g, (codeBlock) => {
      return codeBlock.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }).replace(/&(?!amp;|lt;|gt;|quot;|#039;)/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  escapeHtml(text: string): string {
    return text.replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
  createCodeSnippet(): void {
    const codeSnippet = `\`\`\`
console.log("Hello, world!");
\`\`\``; // Example code snippet, adjust as needed

    // Insert the code snippet at the current cursor position
    this.insertAtCursor(codeSnippet);
  }

  // Helper function to insert text at the current cursor position in the textarea
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
  pushMessage(message: any) {
    this.chatMessages.push(message);
    this.chatContainer.nativeElement.scrollTop = this.chatContainer.nativeElement.scrollHeight;
  }
}
