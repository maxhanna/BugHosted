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
  chatMessages: { sender: string, message: string }[] = []; 

  @ViewChild('chatInput') chatInput!: ElementRef<HTMLInputElement>;

  sendMessage() {
    this.userMessage = this.chatInput.nativeElement.value;
    if (this.userMessage.trim()) { 
      this.chatMessages.push({ sender: 'You', message: this.userMessage });
      console.log(this.userMessage);
      this.aiService.sendMessage(this.userMessage).then(
        (response) => { 
          this.chatMessages.push({ sender: 'Host', message: response.reply });
        },
        (error) => { 
          console.error(error);
          this.chatMessages.push({ sender: 'System', message: 'Error communicating with the server.' });
        }
      );
       
      this.userMessage = '';
    }
  }
}
