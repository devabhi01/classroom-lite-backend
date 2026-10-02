import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;
  private readonly isConfigured: boolean = false;
  private readonly fromAddress: string;

  constructor(private readonly configService: ConfigService) {
    const rawUser =
      this.configService.get<string>('SMTP_USER') ||
      this.configService.get<string>('GMAIL_USER') ||
      this.configService.get<string>('smtpUser') ||
      process.env.SMTP_USER ||
      process.env.GMAIL_USER ||
      '';

    const rawPass =
      this.configService.get<string>('SMTP_PASS') ||
      this.configService.get<string>('GMAIL_APP_PASSWORD') ||
      this.configService.get<string>('smtpPass') ||
      process.env.SMTP_PASS ||
      process.env.GMAIL_APP_PASSWORD ||
      '';

    const user = rawUser.trim();
    // Google App Passwords often copied with spaces like "abcd efgh ijkl mnop" -> strip them
    const pass = rawPass.trim().replace(/\s+/g, '');

    const host =
      this.configService.get<string>('SMTP_HOST') ||
      this.configService.get<string>('smtpHost') ||
      process.env.SMTP_HOST ||
      'smtp.gmail.com';

    const port = Number(
      this.configService.get<number>('SMTP_PORT') ||
        this.configService.get<number>('smtpPort') ||
        process.env.SMTP_PORT ||
        587,
    );

    this.fromAddress =
      this.configService.get<string>('EMAIL_FROM') ||
      this.configService.get<string>('emailFrom') ||
      process.env.EMAIL_FROM ||
      `"TDP Classroom Lite" <${user || 'noreply@tdpclassroom.com'}>`;

    if (user && pass) {
      if (host.includes('gmail') || user.endsWith('@gmail.com')) {
        this.transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { user, pass },
        });
        this.logger.log(`EmailService: Gmail SMTP transport initialized for ${user}`);
      } else {
        this.transporter = nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          auth: { user, pass },
        });
        this.logger.log(`EmailService: Custom SMTP transport initialized with ${host}:${port} (${user})`);
      }
      this.isConfigured = true;
    } else {
      this.isConfigured = false;
      this.logger.warn(
        'EmailService: No SMTP credentials configured (GMAIL_USER and GMAIL_APP_PASSWORD not set). Real emails will NOT be sent; OTP codes will be printed to server console.',
      );
    }
  }

  /**
   * Send a 6-digit OTP email verification code
   */
  async sendVerificationOtp(to: string, name: string, otp: string): Promise<boolean> {
    const subject = `Your TDP Classroom Lite Verification Code: ${otp}`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; color: #1e293b; }
          .container { max-width: 540px; margin: 40px auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
          .header { background: #4f46e5; padding: 28px 24px; text-align: center; }
          .header h1 { color: #ffffff; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
          .header p { color: #c7d2fe; margin: 4px 0 0 0; font-size: 13px; }
          .content { padding: 32px 28px; text-align: center; }
          .greeting { font-size: 16px; font-weight: 600; margin-bottom: 8px; text-align: left; }
          .message { font-size: 14px; color: #64748b; line-height: 1.6; text-align: left; margin-bottom: 24px; }
          .otp-box { background: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 18px; margin: 24px 0; text-align: center; }
          .otp-code { font-family: monospace, Courier, monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #4f46e5; margin: 0; }
          .expiry { font-size: 12px; color: #94a3b8; margin-top: 8px; }
          .footer { background: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>TDP Classroom Lite</h1>
            <p>The Dev Pride Technology</p>
          </div>
          <div class="content">
            <div class="greeting">Hello, ${name}!</div>
            <div class="message">
              Thank you for registering on TDP Classroom Lite. Please use the following 6-digit verification code to confirm your email address and activate your account.
            </div>
            <div class="otp-box">
              <div class="otp-code">${otp}</div>
              <div class="expiry">Expires in 15 minutes</div>
            </div>
            <div class="message" style="margin-bottom: 0; font-size: 13px;">
              If you did not create an account on TDP Classroom Lite, please disregard this email.
            </div>
          </div>
          <div class="footer">
            &copy; ${new Date().getFullYear()} The Dev Pride Technology. All rights reserved.
          </div>
        </div>
      </body>
      </html>
    `;

    // Always log OTP to server console for testing/debugging
    this.logger.log(`\n==================================================\n📧 [EMAIL VERIFICATION OTP]\nTo: ${to} (${name})\nOTP Code: [ ${otp} ] (Valid for 15 mins)\n==================================================`);

    if (!this.isConfigured || !this.transporter) {
      this.logger.warn(
        `Email not delivered via SMTP: GMAIL_USER / GMAIL_APP_PASSWORD not set in environment variables. Use the OTP code [ ${otp} ] above to verify.`,
      );
      return true;
    }

    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        subject,
        html,
      });
      this.logger.log(`Verification email sent successfully to ${to}`);
      return true;
    } catch (err: any) {
      this.logger.error(`Failed to send email to ${to}: ${err.message}`);
      return false;
    }
  }
}
