import { Component, ViewChild, ElementRef, OnDestroy, OnInit, ChangeDetectorRef } from '@angular/core';
import { AiService } from '../../services/ai.service';
import { ChildComponent } from '../child.component';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { User } from '../../services/datacontracts/user/user';
import { SpeechRecognitionComponent } from '../speech-recognition/speech-recognition.component';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { MediaSelectorComponent } from '../media-selector/media-selector.component';

export class AIMessage { sender?: string; message: any };

@Component({
  selector: 'app-host-ai',
  templateUrl: './host-ai.component.html',
  styleUrl: './host-ai.component.css',
  standalone: false
})
export class HostAiComponent extends ChildComponent implements OnInit, OnDestroy {
  selectedFile?: FileEntry;
  isShowingHelpPopup: boolean = false;
  constructor(private aiService: AiService, private sanitizer: DomSanitizer, private cdr: ChangeDetectorRef) { super(); }
  userMessage: string = '';
  chatMessages: AIMessage[] = [];
  hostName: string = "Host";

  responseLength? = 200;
  isMenuOpen = false;
  startedTalking = false;
  tmpStartTalkingVariable = false;
  private utterance: SpeechSynthesisUtterance | null = null;
  private engineeredText: string = ". (previous message history: ";
  private savedMessageHistory: string[] = [];
  speechRecognitionUnavailable?: boolean = undefined;

  @ViewChild('chatInput') chatInput!: ElementRef<HTMLInputElement>;
  @ViewChild('chatContainer') chatContainer!: ElementRef<HTMLDivElement>;
  @ViewChild(SpeechRecognitionComponent) speechRecognitionComponent?: SpeechRecognitionComponent;
  @ViewChild(MediaSelectorComponent) fileSelector?: MediaSelectorComponent;

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

    if (!this.userMessage.trim() && !this.selectedFile) return alert("No message sent");

    // Check for voice commands
    if (this.userWantsToForgetHistory(this.userMessage)) {
      this.savedMessageHistory = [];
      this.parentRef.showNotification("Memory cleared.");
    }
    if (this.userWantsToChangeResponseLength(this.userMessage)) {
      this.userMessage = "";
      this.chatInput.nativeElement.value = "";
      this.chatInput.nativeElement.focus();
      return;
    }

    this.checkIfUserWantsToChangeResponseLengthToVerbose(this.userMessage);

    this.startLoading();
    this.pushMessage({ sender: 'You', message: this.userMessage.replace('\n', "<br>") });
    this.parentRef.getSessionToken().then(sessionToken => {
      this.aiService.sendMessage(user.id ?? 0, false, this.userMessage + this.engineeredText + JSON.stringify(this.savedMessageHistory) + ")", sessionToken, this.responseLength, this.selectedFile?.id).then(
        (response) => {
          // Handle plain "Access Denied" string response
          if (typeof response === 'string' && response.toLowerCase().includes('access denied') && response.length <= 'access denied'.length + 5) {
            this.parentRef?.showNotification('Access Denied');
            this.stopLoading();
            return;
          }
          let reply = this.aiService.parseMessage(response.response ?? response.reply);
          this.savedMessageHistory.push((response.response ?? response.reply));
          this.pushMessage({ sender: this.hostName, message: reply });
          this.chatInput.nativeElement.value = "";
          this.chatInput.nativeElement.focus();
          this.savedMessageHistory.push(this.userMessage);
          this.userMessage = '';
          this.selectedFile = undefined;
          this.fileSelector?.removeAllFiles();
          this.stopLoading();
        },
        (error) => {
          console.error(error);
          // Handle "Access Denied" in error response
          const errorMsg = error?.reply ?? error?.message ?? (typeof error === 'string' ? error : '');
          if (typeof errorMsg === 'string' && errorMsg.toLowerCase().includes('access denied')) {
            this.parentRef?.showNotification('Access Denied');
          } else {
            this.pushMessage({ sender: 'System', message: error.reply });
          }
          this.chatInput.nativeElement.value = "";
          setTimeout(() => {
            this.chatInput.nativeElement.focus();
          }, 50);
          this.savedMessageHistory.push(this.userMessage);
          this.userMessage = '';
          this.selectedFile = undefined;
          this.fileSelector?.removeAllFiles();
          this.stopLoading();
        }
      );
    });
  }

  speechRecognitionEvent(transcript: string | undefined) {
    if (transcript) {
      this.startedTalking = true;
      this.chatInput.nativeElement.value += transcript;
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
  refreshScreen() {
    this.userMessage = this.chatInput.nativeElement.value.trim();
    this.cdr.detectChanges();
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

  speakMessage(message: string, listenAfter = true) {
    if (!this.startedTalking) {
      return;
    }
    if ('speechSynthesis' in window) {
      console.log("Speech synthesis is supported! ", message);
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
          this.startedTalking = false;
          this.cdr.detectChanges(); // Ensure UI updates
          console.log("Finished speaking all segments.");
          if (listenAfter) {
            console.log("Resuming listening after speaking.");
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
          if (this.startedTalking) {
            setTimeout(() => speakSegments(index + 1), 0);
          }
        };

        window.speechSynthesis.speak(utterance);
      };

      // Start the recursive speaking of segments.
      speakSegments(0);
    } else {
      console.log("Speech synthesis is NOT supported in this browser.");
      this.startedTalking = false;
      this.cdr.detectChanges();
    }
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
    this.startedTalking = false;
    this.cdr.detectChanges();
    setTimeout(() => {
      speechSynthesis.cancel();

      if (this.utterance) {
        this.utterance.onend = null;
        this.utterance.onerror = null;
        this.utterance = null;
      }

      this.speechRecognitionComponent?.stopListening();
    }, 10);
  }

  stopListening() {
    this.startedTalking = false;
    this.cdr.detectChanges();
  }

  userWantsToStopVoice(message: string): boolean {
    //console.log(message);
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
    //console.log(message);
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

  userWantsToChangeResponseLength(message: string): boolean {
    const lowerMessage = message.toLowerCase().trim();
    const responseLengthPatterns = [
      /set response length to (\d+)/,
      /change response length to (\d+)/,
      /response length (\d+)/,
      /make response length (\d+)/
    ];

    for (const pattern of responseLengthPatterns) {
      const match = lowerMessage.match(pattern);
      if (match && match[1]) {
        //console.log("user wants to change length");
        const newLength = parseInt(match[1], 10);
        // Validate the response length (e.g., ensure it's a reasonable number)
        if (newLength >= 0 && newLength <= 1000) { // Adjust max limit as needed
          this.responseLength = newLength === 0 ? undefined : newLength;
          this.parentRef?.showNotification(`Response length set to ${newLength === 0 ? 'unlimited' : newLength}.`);
          this.pushMessage({ sender: 'System', message: `Response length changed to ${newLength === 0 ? 'unlimited' : newLength}.` });
          return true;
        } else {
          this.parentRef?.showNotification("Invalid response length. Please choose a number between 0 and 1000.");
          this.pushMessage({ sender: 'System', message: "Invalid response length. Please choose a number between 0 and 1000." });
          return true;
        }
      }
    }
    return false;
  }

  checkIfUserWantsToChangeResponseLengthToVerbose(message: string): boolean {
    const lowerMessage = message.toLowerCase().trim();
    const responseLengthPatterns = [
      /(?:^|\s)(?:go in )?detail(?:ed|s)?(?:$|\s)/,  // matches "detail", "details", "detailed", "go in detail"
      /(?:^|\s)more detail(?:s|ed)?(?:$|\s)/,         // matches "more detail", "more details"
      /(?:^|\s)be verbose(?:$|\s)/,                   // matches "be verbose"
      /(?:^|\s)elaborate(?:$|\s)/,                   // matches "elaborate"
      /(?:^|\s)long(?:er)? response(?:$|\s)/          // matches "long response", "longer response"
    ];

    for (const pattern of responseLengthPatterns) {
      if (pattern.test(lowerMessage)) {
        this.responseLength = 450;
        this.parentRef?.showNotification(`Response length changed to Medium.`);
        return true;
      }
    }
    return false;
  }

  speechRecognitionNotSupportedEvent(event: boolean) {
    this.speechRecognitionUnavailable = event;
  }

  greetingMessage(): string {
    const hour = new Date().getHours();

    if (hour < 5) {
      return 'Burning the midnight oil 🌌';
    } else if (hour < 12) {
      return 'Good morning ☀️';
    } else if (hour < 17) {
      return 'Good afternoon 🌤️';
    } else if (hour < 21) {
      return 'Good evening 🌇';
    } else {
      return 'Good night 🌙';
    }
  }

  changeResponseLength(event: Event) {
    this.responseLength = parseInt((event.target as HTMLSelectElement).value);
    if (this.responseLength == 0 || !this.responseLength) {
      this.responseLength = undefined;
    }
  }

  showMenuPanel() {
    if (this.isMenuOpen) {
      this.closeMenuPanel();
      return;
    }
    this.isMenuOpen = true;
    if (this.parentRef) {
      this.parentRef.showOverlay();
    }
  }

  closeMenuPanel() {
    this.isMenuOpen = false;
    if (this.parentRef) {
      this.parentRef.closeOverlay();
    }
  }

  clearMemory() {
    this.savedMessageHistory = [];
    this.parentRef?.showNotification("Memory cleared.");
    this.closeMenuPanel();
  }

  listenToChatMessage(message: AIMessage) {
    if (!this.startedTalking) {
      this.startedTalking = true;
      this.cdr.detectChanges();
      setTimeout(() => {
        this.speakMessage(message.message, false);
      }, 20);
    } else {
      this.startedTalking = false;
      this.stopTalking();
    }
  }
  sayOutloud() {
    this.startedTalking = true;
    this.cdr.detectChanges();
    // console.log("Saying out loud: ", this.chatInput.nativeElement.value);
    this.speakMessage(this.chatInput.nativeElement.value ?? "", false)
  }
  async selectFile(files: FileEntry[]) {
    this.selectedFile = files.flatMap(fileArray => fileArray)[0];
  }
  showHelpPopup() {
    this.isShowingHelpPopup = true;
    this.parentRef?.showOverlay();
  }
  closeHelpPopup() {
    this.isShowingHelpPopup = false;
    this.parentRef?.closeOverlay();
  }
}