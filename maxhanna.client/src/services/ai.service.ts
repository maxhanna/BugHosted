// user.service.ts
import { Injectable } from '@angular/core';
import { User } from './datacontracts/user/user';
import { Observable } from 'rxjs/internal/Observable';
import { HttpClient } from '@angular/common/http';
@Injectable({
  providedIn: 'root'
})
export class AiService { 
  async sendMessage(userId: number, skipSave = false, message: string, encryptedUserId: string, maxCount?: number, fileId?: number) {
    try {
      const response = await fetch('/ai/sendmessagetoai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Encrypted-UserId': encryptedUserId,
        },
        body: JSON.stringify({ UserId: userId, Message: message, SkipSave: skipSave, MaxCount: maxCount ?? 0, FileId: fileId }),
      }); 
      return response.json();
    } catch (error) {
      console.error('Error in AI streaming response:', error);
      throw error;
    }
  }

  async generateImage(userId: number, message: string) {
    try {
      const response = await fetch(`/ai/generateimagewithai`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, Message: message }),
      });

      return await response.json();
    } catch (error) {
    }
  }


  async getMarketSentiment(startDate?: string, endDate?: string) {
    try {
      const body = JSON.stringify({ startDate, endDate });

      const response = await fetch('/ai/getmarketsentiment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body,
      });

      // Check for empty response
      const contentLength = response.headers.get('content-length');
      if (!response.ok || contentLength === '0') {
        return null;
      }
      // Try to parse JSON, handle empty/invalid
      try {
        return await response.json();
      } catch (jsonErr) {
        console.error('Market sentiment: invalid JSON response', jsonErr);
        return null;
      }
    } catch (error) {
      console.error('Failed to get market sentiment:', error);
      return null;
    }
  }

  async analyzeWallet(userId: number, walletAddress: string, currency: string | undefined, encryptedUserId: string, maxCount?: number) {
    try {
      const body = { UserId: userId, WalletAddress: walletAddress, Currency: currency ?? 'btc', MaxCount: maxCount ?? 600, SkipSave: false };
      const response = await fetch('/ai/analyzewallet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Encrypted-UserId': encryptedUserId,
        },
        body: JSON.stringify(body),
      });
      return await response.json();
    } catch (error) {
      console.error('Error calling AnalyzeWallet:', error);
      throw error;
    }
  }

  async analyzeCoin(userId: number, coin: string, encryptedUserId: string, maxCount?: number) {
    try {
      const body = { UserId: userId, Coin: coin, MaxCount: maxCount ?? 600, SkipSave: false };
      const response = await fetch('/ai/analyzecoin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Encrypted-UserId': encryptedUserId,
        },
        body: JSON.stringify(body),
      });
      return await response.json();
    } catch (error) {
      console.error('Error calling AnalyzeCoin:', error);
      throw error;
    }
  }
  

  parseMessage(message: string): string {
    if (!message) return '';

    const preBlocks: string[] = [];

    // 1. Capture ```language\ncode\n``` blocks (with optional language)
    message = message.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang = '', code) => {
      const safeCode = this.escapeHTML(code);
      preBlocks.push(`<pre><code class="language-${lang}">${safeCode}</code></pre>`);
      return `<pre-placeholder-${preBlocks.length - 1}>`;
    });

    // 2. Escape everything else (important: do NOT escape the placeholders!)
    message = message
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // 3. Restore <pre> blocks (placeholders are safe to replace now)
    message = message.replace(/&lt;pre-placeholder-(\d+)&gt;/g, (_, index) => {
      return preBlocks[parseInt(index)];
    });

    // 4. Continue with markdown-like transformations
    message = message.replace(/^###### (.*$)/gim, '<h6>$1</h6>')
      .replace(/^##### (.*$)/gim, '<h5>$1</h5>')
      .replace(/^#### (.*$)/gim, '<h4>$1</h4>')
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>');

    message = message.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');
    message = message.replace(/^\s*[-*] (.*$)/gim, '<li>$1</li>');
    message = message.replace(/(<li>.*<\/li>)/gims, '<ul>$1</ul>');
    message = message.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    message = message.replace(/__(.*?)__/g, '<b>$1</b>');
    message = message.replace(/\*(.*?)\*/g, '<i>$1</i>');
    message = message.replace(/_(.*?)_/g, '<i>$1</i>');
    message = message.replace(/`([^`]+)`/g, '<code>$1</code>');
    message = message.replace(/\[([^\]]+)\]\((https?:\/\/[^\s]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    message = message.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s]+)\)/g, '<img src="$2" alt="$1">');
    message = message.replace(/\n/g, '<br>');

    return message;
  }

  private escapeHTML(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

}
