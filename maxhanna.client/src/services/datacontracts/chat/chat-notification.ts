export class ChatNotification {
  chatId: number;
  count: number;

  constructor(chatId: number, count: number) {
    this.chatId = chatId;
    this.count = count;
  }
}
