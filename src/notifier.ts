import axios from 'axios';
import pc from 'picocolors';

export class TelegramNotifier {
  private botToken: string | undefined;
  private chatId: string | undefined;

  constructor(botToken?: string, chatId?: string) {
    this.botToken = botToken;
    this.chatId = chatId;
  }

  async sendMessage(text: string): Promise<boolean> {
    if (!this.botToken || !this.chatId) {
      console.log(pc.gray(`[Telegram] Skipping notification - missing token or chat ID.`));
      return false;
    }

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      const MAX_TG_LEN = 4000;
      const safeText = text.length > MAX_TG_LEN ? text.slice(0, MAX_TG_LEN) + '\\n…(truncated)' : text;

      await axios.post(url, {
        chat_id: this.chatId,
        text: safeText,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      });
      console.log(pc.green(`[Telegram] ✅ Notification sent successfully.`));
      return true;
    } catch (error: any) {
      const reason = error.response?.data?.description || error.message;
      console.error(pc.red(`[Telegram] ❌ Failed to send message: ${reason}`));
      return false;
    }
  }
}
