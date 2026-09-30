import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly twilioAccountSid: string;
  private readonly twilioAuthToken: string;
  private readonly twilioFrom: string;
  private readonly fast2smsApiKey: string;

  constructor(private readonly configService: ConfigService) {
    this.twilioAccountSid =
      this.configService.get<string>('twilioAccountSid') ||
      process.env.TWILIO_ACCOUNT_SID ||
      '';
    this.twilioAuthToken =
      this.configService.get<string>('twilioAuthToken') ||
      process.env.TWILIO_AUTH_TOKEN ||
      '';
    this.twilioFrom =
      this.configService.get<string>('twilioPhoneNumber') ||
      process.env.TWILIO_PHONE_NUMBER ||
      process.env.TWILIO_FROM ||
      '';
    this.fast2smsApiKey =
      this.configService.get<string>('fast2smsApiKey') ||
      process.env.FAST2SMS_API_KEY ||
      '';

    if (this.twilioAccountSid && this.twilioAuthToken && this.twilioFrom) {
      this.logger.log(`Twilio SMS service initialized with sender: ${this.twilioFrom}`);
    } else if (this.fast2smsApiKey) {
      this.logger.log('Fast2SMS service initialized');
    } else {
      this.logger.log('No SMS provider configured. SMS OTPs will be logged to console.');
    }
  }

  /**
   * Format phone number to E.164 standard if missing country code
   */
  private formatPhoneNumber(phone: string): string {
    const cleaned = phone.replace(/[^\d+]/g, '');
    if (cleaned.startsWith('+')) {
      return cleaned;
    }
    // If standard 10-digit number (common in India / US), default to +91 or check length
    if (cleaned.length === 10) {
      return `+91${cleaned}`;
    }
    return `+${cleaned}`;
  }

  async sendOtp(phone: string, otp: string, name?: string): Promise<boolean> {
    const formattedPhone = this.formatPhoneNumber(phone);
    const message = `Your TDP Classroom Lite verification code is: ${otp}. Valid for 24 hours. Do not share this code with anyone.`;

    // Always log SMS OTP to console for developer convenience and test environments
    this.logger.log(
      `\n┌────────────────────────────────────────────────────────┐\n` +
      `│ [SMS OTP NOTIFICATION]                                │\n` +
      `│ To Phone: ${formattedPhone.padEnd(45)}│\n` +
      `│ Name:     ${(name || 'User').padEnd(45)}│\n` +
      `│ OTP Code: ${otp.padEnd(45)}│\n` +
      `│ Message:  ${`Your code is: ${otp}`.padEnd(45)}│\n` +
      `└────────────────────────────────────────────────────────┘`,
    );

    // 1. Try Twilio if configured
    if (this.twilioAccountSid && this.twilioAuthToken && this.twilioFrom) {
      try {
        const url = `https://api.twilio.com/2010-04-01/Accounts/${this.twilioAccountSid}/Messages.json`;
        const auth = Buffer.from(
          `${this.twilioAccountSid}:${this.twilioAuthToken}`,
        ).toString('base64');

        const params = new URLSearchParams({
          To: formattedPhone,
          From: this.twilioFrom,
          Body: message,
        });

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        });

        if (!response.ok) {
          const errData = await response.text();
          this.logger.error(`Twilio SMS API error: ${errData}`);
          return false;
        }

        this.logger.log(`SMS OTP sent via Twilio to ${formattedPhone}`);
        return true;
      } catch (err: any) {
        this.logger.error(`Failed to send SMS via Twilio: ${err.message}`);
        return false;
      }
    }

    // 2. Try Fast2SMS if configured
    if (this.fast2smsApiKey) {
      try {
        const rawNumber = formattedPhone.replace(/^\+91/, '').replace(/[^\d]/g, '');
        const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
          method: 'POST',
          headers: {
            authorization: this.fast2smsApiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            route: 'otp',
            variables_values: otp,
            numbers: rawNumber,
          }),
        });

        if (!response.ok) {
          const errData = await response.text();
          this.logger.error(`Fast2SMS error: ${errData}`);
          return false;
        }

        this.logger.log(`SMS OTP sent via Fast2SMS to ${rawNumber}`);
        return true;
      } catch (err: any) {
        this.logger.error(`Failed to send SMS via Fast2SMS: ${err.message}`);
        return false;
      }
    }

    // Console logging succeeded
    return true;
  }
}
