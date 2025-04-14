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
  private engineeredText: string = ". (previous message history: ";
  private savedMessageHistory: string[] = [];
  speechRecognitionUnavailable?: boolean = undefined;

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
    setTimeout(() => {
      this.stopTalking();
    }, 50);
  }
  sendMessage() {
    if (!this.parentRef) return alert("No parent ref?");
    const user = this.parentRef.user ?? new User(0);
    this.userMessage = this.chatInput.nativeElement.value.trim();
    if (!this.userMessage.trim()) return alert("No message sent");
    if (this.userWantsToForgetHistory(this.userMessage)) {
      this.savedMessageHistory = [];
    }
    if (this.userWantsToStopVoice(this.userMessage)) {
      this.userMessage = "";
      this.stopTalking();
      return;
    }
    this.startLoading();
    if (this.userMessage.trim()) {
      this.pushMessage({ sender: 'You', message: this.userMessage.replace('\n', "<br>") });
      this.parentRef.getSessionToken().then(sessionToken => {
        this.aiService.sendMessage(user.id ?? 0, false, this.userMessage + this.engineeredText + JSON.stringify(this.savedMessageHistory) + ")", sessionToken).then(
          (response) => {
            let reply = this.aiService.parseMessage(response.response ?? response.reply);
            this.savedMessageHistory.push((response.response ?? response.reply));
            this.pushMessage({ sender: this.hostName, message: reply });
            this.chatInput.nativeElement.value = "";
            this.chatInput.nativeElement.focus();
            this.stopLoading();
          },
          (error) => {
            console.error(error);
            this.pushMessage({ sender: 'System', message: error.reply });
            this.chatInput.nativeElement.value = "";
            setTimeout(() => { 
              this.chatInput.nativeElement.focus();
            }, 50);
            this.stopLoading();
          }
        );
      })
      this.savedMessageHistory.push(this.userMessage);
      this.userMessage = '';
    }
  }
  speechRecognitionEvent(transcript: string | undefined) {
    if (transcript) {
      this.startedTalking = true;
      this.chatInput.nativeElement.value = transcript;
      setTimeout(() => {
        this.sendMessage();
      }, 100);
    } else {
      this.startedTalking = false;
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

      // Remove HTML tags and non-ASCII characters.
      let cleanMessage = message.replace(/<\/?[^>]+(>|$)/g, "").replace(/[^\x20-\x7E]/g, "");

      // Replace "e.g.", "eg.", or "ex." (case-insensitive) with "example".
      cleanMessage = cleanMessage.replace(/\b(e\.g\.|eg\.|ex\.)\b/gi, "example");

      // Remove parentheses and their contents.
      cleanMessage = cleanMessage.replace(/\(.*?\)/g, '');

      // Split the message into segments based on punctuation.
      // This regular expression captures groups of characters ending with punctuation.
      const segments: string[] = [];
      const regex = /[^,;:\-\.]+[,:;\-\.]*/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(cleanMessage)) !== null) {
        segments.push(match[0].trim());
      }

      // Function to speak the segments sequentially.
      const speakSegments = (index: number) => {
        if (index >= segments.length) {
          // All segments spoken; resume listening if applicable.
          if (this.startedTalking) {
            this.startListening();
          }
          return;
        }

        const segment = segments[index];
        const utterance = new SpeechSynthesisUtterance(segment);
        utterance.lang = 'en-US';
        utterance.pitch = 0.8; // Lower than the default for a more natural tone.
        utterance.rate = 1.2;    // Normal speaking rate.
        utterance.volume = 1;

        // Choose a preferred voice if available.
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
          const naturalVoice = voices.find(voice =>
            voice.name.toLowerCase().includes('mark') ||
            voice.name.toLowerCase().includes('zira') ||
            voice.name.toLowerCase().includes('microsoft')
          );
          utterance.voice = naturalVoice || voices[0];
        }

        utterance.onend = () => {
          // Default pause time.
          let pauseTime = 200;
          const lastChar = segment.slice(-1);
          if (lastChar === ',') {
            pauseTime = 300;
          } else if (lastChar === ':' || lastChar === ';' || lastChar === '.') {
            pauseTime = 400;
          } else if (lastChar === '-') {
            if (/ \- /.test(segment)) {// Only add a pause if the dash is surrounded by spaces.
              pauseTime = 300;
            } else {
              pauseTime = 0;
            }
          }
          setTimeout(() => speakSegments(index + 1), pauseTime);
        };

        window.speechSynthesis.speak(utterance);
      };

      // Start the recursive speaking of segments.
      speakSegments(0);
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
    speechSynthesis.cancel();

    if (this.utterance) {
      this.utterance.onend = null;
      this.utterance.onerror = null;
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
    const stopWords = [
      "cancel", "stop", "quit", "forget about it", "nevermind",
      "halt", "no", "pause", "end"
    ];

    const lowerMessage = message.toLowerCase();

    // Check for exact phrase matches first (like "forget about it")
    for (const phrase of stopWords) {
      if (lowerMessage === phrase) return true;
      if (lowerMessage.includes(phrase) && phrase.includes(" ")) return true;
    }

    // Tokenize for single-word exact matches (e.g., "no" vs "know")
    const tokens = lowerMessage.split(/\b[\s,!.?;]+\b/);
    for (const token of tokens) {
      if (stopWords.includes(token)) return true;
    }

    return false;
  } 
  userWantsToForgetHistory(message: string): boolean {
    console.log(message);
    const forgetKeywords = new Set([
      "forget", "erase", "clear", "delete", "remove",
      "reset", "wipe", "discard", "start over", "start fresh",
      "clean slate", "forget everything", "forget what i said"
    ]);
    const lowered = message.toLowerCase();

    for (const keyword of forgetKeywords) {
      if (lowered.includes(keyword)) {
        console.log(`Matched forget intent keyword: "${keyword}"`);
        return true;
      }
    }
    return false;
  }
  speechRecognitionNotSupportedEvent(event: boolean) { 
    this.speechRecognitionUnavailable = event;
  }
}
