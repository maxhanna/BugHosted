import { Component, ViewChild, ElementRef, OnDestroy, OnInit } from '@angular/core';
import { AiService } from '../../services/ai.service';
import { ChildComponent } from '../child.component';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { User } from '../../services/datacontracts/user/user';
import { SpeechRecognitionComponent } from '../speech-recognition/speech-recognition.component';


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
  hostName: string = "Host";

  startedTalking = false;
  tmpStartTalkingVariable = false;
  private utterance: SpeechSynthesisUtterance | null = null; 
  private engineeredText: string = ". This is our previous message history: ";
  private savedMessageHistory: string[] = [];

  @ViewChild('chatInput') chatInput!: ElementRef<HTMLInputElement>;
  @ViewChild('chatContainer') chatContainer!: ElementRef<HTMLDivElement>;
  @ViewChild(SpeechRecognitionComponent) speechRecognitionComponent?: SpeechRecognitionComponent;

  ngOnInit() {
    this.parentRef?.addResizeListener();
  }
  ngOnDestroy() {
    this.parentRef?.removeResizeListener();
    if (this.speechRecognitionComponent) {
      this.speechRecognitionComponent.stopListening(); 
    }
    this.stopTalking();
  }
  sendMessage() {
    const user = this.parentRef?.user ?? new User(0);
    this.userMessage = this.chatInput.nativeElement.value.trim(); 
    if (this.userWantsToStopVoice(this.userMessage)) {
      this.chatInput.nativeElement.value = "";
      this.userMessage = "";
      this.stopTalking();
      return;
    }
    this.startLoading();
    if (this.userMessage.trim()) {
      this.pushMessage({ sender: 'You', message: this.userMessage.replace('\n', "<br>") });
      this.aiService.sendMessage(user, false, this.userMessage + this.engineeredText + JSON.stringify(this.savedMessageHistory)).then(
        (response) => {
          let reply = this.aiService.parseMessage(response.response ?? response.reply);
          this.pushMessage({ sender: this.hostName, message: reply });
          this.stopLoading();
        },
        (error) => {
          console.error(error);
          this.pushMessage({ sender: 'System', message: error.reply });
          this.stopLoading();
        }
      );
      this.savedMessageHistory.push(this.userMessage); 
      this.userMessage = '';
      this.chatInput.nativeElement.value = "";
      this.chatInput.nativeElement.focus();
    }
  }
  speechRecognitionEvent(transcript: string | undefined) {
    if (transcript) {
      this.startedTalking = true;
      this.chatInput.nativeElement.value = transcript;
      setTimeout(() => {
        this.sendMessage();
      }, 100);
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
    if (message.sender === this.hostName) {
      this.speakMessage(message.message); 
    }
    setTimeout(() => {
      const tgt = document.getElementsByClassName("chat-box")[0];
      if (tgt) {
        tgt.scrollTop = tgt.scrollHeight;
      }
    }, 500);
  }
  speakMessage(message: string) {
    if (!this.startedTalking) {
      return;
    }
    this.stopListeningTemporarily();
    if ('speechSynthesis' in window) {
      console.log("Speech synthesis is supported! ", message);
      const cleanMessage = message.replace(/<\/?[^>]+(>|$)/g, "").replace(/[^\x20-\x7E]/g, "");  
      //this.lastSpokenMessage = cleanMessage.toLowerCase();

      // Create the speech synthesis utterance
      this.utterance = new SpeechSynthesisUtterance(cleanMessage);
      this.utterance.lang = 'en-US';

      // Check available voices
      const voices = speechSynthesis.getVoices();

      // If voices are available, choose the first one (or a specific one)
      if (voices.length > 0) {
        const naturalVoice = voices.find(voice => voice.name.toLowerCase().includes('mark') || voice.name.toLowerCase().includes('zira') || voice.name.toLowerCase().includes('microsoft'));
        this.utterance.voice = naturalVoice || voices[0];
      } else {
        // If no voices available, we need to wait for them to load
        speechSynthesis.onvoiceschanged = () => {
          const voices = speechSynthesis.getVoices();
          const naturalVoice = voices.find(voice => voice.name.toLowerCase().includes('mark') || voice.name.toLowerCase().includes('zira') || voice.name.toLowerCase().includes('microsoft'));
          if (this.utterance) { 
            this.utterance.voice = naturalVoice || voices[0];
          }
          console.log(voices);
        };
      }

      // Adjust the pitch and rate for a more natural sound
      this.utterance.pitch = 0.8; // 1 is the default, increase or decrease for a higher/lower pitch
      this.utterance.rate = 1; // 1 is the default, increase for faster or decrease for slower speech

      this.utterance.onend = () => {
        if (this.startedTalking) {
          this.startListening();
        }
      };
      speechSynthesis.speak(this.utterance);
    } else {
      console.log("Speech synthesis is NOT supported in this browser.");
    }
  }
  private stopListeningTemporarily() {
    this.stopListening();
    this.tmpStartTalkingVariable = true;
    setTimeout(() => { this.startedTalking = true; this.tmpStartTalkingVariable = false; }, 1000);
  }
  private startListening() {
    this.stopListening(); 
    setTimeout(() => {
      // Call startListening and pass the onResult callback
      this.speechRecognitionComponent?.startListening((transcript: string) => {
        console.log('Transcript received:', transcript);
      });
    }, 1);
  }

  stopTalking() {
    if (this.utterance) {
      speechSynthesis.cancel();
      this.utterance = null;
    }
    this.startedTalking = false;
    this.speechRecognitionComponent?.stopListening();
  }
  stopListening() {
    this.startedTalking = false;
  }
  userWantsToStopVoice(message: string): boolean {
    console.log(message);
    if (message.toLowerCase().includes("cancel") ||
      message.toLowerCase().includes("stop") ||
      message.toLowerCase().includes("quit") ||
      message.toLowerCase().includes("forget about it") ||
      message.toLowerCase().includes("nevermind") ||
      message.toLowerCase().includes("halt") ||
      message.toLowerCase().includes("no") ||
      message.toLowerCase().includes("pause") ||
      message.toLowerCase().includes("end")) {
      return true;
    }
    else
      return false;
  }
}
