import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private readonly fromAddress: string;
  private readonly frontendUrl: string;

  constructor(private readonly configService: ConfigService) {
    const smtpHost = this.configService.get<string>('smtpHost') || process.env.SMTP_HOST;
    const smtpPort = this.configService.get<number>('smtpPort') || Number(process.env.SMTP_PORT) || 587;
    const smtpSecure = this.configService.get<boolean>('smtpSecure') || process.env.SMTP_SECURE === 'true';
    const smtpUser = this.configService.get<string>('smtpUser') || process.env.SMTP_USER;
    const smtpPass = this.configService.get<string>('smtpPass') || process.env.SMTP_PASS;

    this.fromAddress =
      this.configService.get<string>('smtpFrom') ||
      process.env.SMTP_FROM ||
      'TDP Classroom Lite <noreply@tdpclassroom.com>';

    this.frontendUrl =
      this.configService.get<string>('frontendUrl') ||
      process.env.FRONTEND_URL ||
      'http://localhost:5173';

    if (smtpHost && smtpUser) {
      try {
        this.transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpSecure,
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        });
        this.logger.log(`SMTP Mail transport initialized for ${smtpHost}:${smtpPort}`);
      } catch (err: any) {
        this.logger.warn(`Failed to initialize SMTP transporter: ${err.message}. Fallback to logger mode.`);
        this.transporter = null;
      }
    } else {
      this.logger.log('No SMTP credentials configured. Verification emails will be logged to console.');
    }
  }

  async sendVerificationEmail(to: string, name: string, token: string, otp: string): Promise<boolean> {
    const verifyUrl = `${this.frontendUrl.replace(/\/$/, '')}/verify-email?token=${token}&email=${encodeURIComponent(to)}`;

    // Always log verification link & code for developer convenience & fallback
    this.logger.log(
      `\n┌────────────────────────────────────────────────────────┐\n` +
      `│ [EMAIL CONFIRMATION]                                   │\n` +
      `│ To:    ${to.padEnd(47)}│\n` +
      `│ Name:  ${(name || 'User').padEnd(47)}│\n` +
      `│ Code:  ${otp.padEnd(47)}│\n` +
      `│ Link:  ${verifyUrl.padEnd(47)}│\n` +
      `└────────────────────────────────────────────────────────┘`,
    );

    if (!this.transporter) {
      return true;
    }

    try {
      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirm your TDP Classroom Lite account</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 24px; }
    .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .header { background: #4f46e5; padding: 32px 24px; text-align: center; color: #ffffff; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }
    .header p { margin: 6px 0 0; opacity: 0.9; font-size: 14px; }
    .content { padding: 32px 24px; }
    .greeting { font-size: 18px; font-weight: 600; margin-bottom: 12px; }
    .message { font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 24px; }
    .otp-card { background: #f1f5f9; border-radius: 8px; border: 1px dashed #cbd5e1; text-align: center; padding: 20px; margin: 24px 0; }
    .otp-label { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #64748b; margin-bottom: 8px; }
    .otp-code { font-family: monospace; font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #4f46e5; }
    .btn-container { text-align: center; margin: 28px 0; }
    .btn { display: inline-block; background-color: #4f46e5; color: #ffffff !important; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 28px; border-radius: 8px; box-shadow: 0 2px 4px rgba(79, 70, 229, 0.3); }
    .footer { border-top: 1px solid #e2e8f0; padding: 20px 24px; text-align: center; font-size: 12px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>TDP Classroom Lite</h1>
      <p>Interactive Real-Time Virtual Classrooms</p>
    </div>
    <div class="content">
      <div class="greeting">Hi ${name || 'there'},</div>
      <div class="message">
        Thank you for joining <strong>TDP Classroom Lite</strong>! To ensure your account security and activate your access to classrooms, please verify your email address.
      </div>

      <div class="otp-card">
        <div class="otp-label">Your 6-Digit Verification Code</div>
        <div class="otp-code">${otp}</div>
      </div>

      <div class="btn-container">
        <a href="${verifyUrl}" class="btn" target="_blank">Verify Email Address</a>
      </div>

      <div class="message" style="font-size: 12px; color: #64748b;">
        This code and verification link will expire in 24 hours. If you did not create an account on TDP Classroom Lite, you can safely ignore this email.
      </div>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} The Dev Pride Technology. All rights reserved.
    </div>
  </div>
</body>
</html>
      `;

      await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        subject: `${otp} is your TDP Classroom Lite verification code`,
        text: `Hi ${name},\n\nYour TDP Classroom Lite verification code is: ${otp}\n\nOr click the link below to verify your email:\n${verifyUrl}\n\nThis code expires in 24 hours.`,
        html: htmlContent,
      });

      this.logger.log(`Verification email sent successfully to ${to}`);
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to send verification email to ${to}: ${error.message}`);
      // Return true to avoid failing user registration when SMTP provider encounters temporary network issues
      return false;
    }
  }
}
