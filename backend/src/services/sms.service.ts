import crypto from 'crypto';

export interface SendOtpResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface SmsProvider {
  sendOtp(mobile: string, otp: string, clientName: string): Promise<SendOtpResult>;
}

/**
 * Twilio SMS Provider
 */
export class TwilioSmsProvider implements SmsProvider {
  private accountSid: string;
  private authToken: string;
  private fromNumber: string;

  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID || '';
    this.authToken = process.env.TWILIO_AUTH_TOKEN || '';
    this.fromNumber = process.env.TWILIO_FROM_NUMBER || '';
  }

  async sendOtp(mobile: string, otp: string, clientName: string): Promise<SendOtpResult> {
    if (!this.accountSid || !this.authToken || !this.fromNumber) {
      throw new Error('Twilio configuration missing (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER)');
    }

    const formattedTo = mobile.startsWith('+') ? mobile : `+91${mobile.replace(/\D/g, '')}`;
    const body = `Your CAFlow Client Portal verification code is ${otp}. Valid for 5 minutes. Do not share this OTP with anyone. - Manavi Associates`;

    const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');

    const params = new URLSearchParams();
    params.append('To', formattedTo);
    params.append('From', this.fromNumber);
    params.append('Body', body);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.message || 'Failed to send SMS via Twilio' };
    }
    return { success: true, messageId: data.sid };
  }
}

/**
 * MSG91 / Indian DLT compliant SMS Provider
 */
export class Msg91SmsProvider implements SmsProvider {
  private authKey: string;
  private templateId: string;
  private senderId: string;

  constructor() {
    this.authKey = process.env.MSG91_AUTH_KEY || '';
    this.templateId = process.env.MSG91_TEMPLATE_ID || '';
    this.senderId = process.env.MSG91_SENDER_ID || 'MANAVI';
  }

  async sendOtp(mobile: string, otp: string): Promise<SendOtpResult> {
    if (!this.authKey) {
      throw new Error('MSG91_AUTH_KEY is not configured');
    }

    const cleanMobile = mobile.replace(/\D/g, '');
    const mobileWithCountry = cleanMobile.length === 10 ? `91${cleanMobile}` : cleanMobile;

    const url = `https://control.msg91.com/api/v5/otp?template_id=${this.templateId}&mobile=${mobileWithCountry}&authkey=${this.authKey}&otp=${otp}`;

    const res = await fetch(url, { method: 'POST' });
    const data = await res.json();

    if (data.type === 'error') {
      return { success: false, error: data.message };
    }
    return { success: true, messageId: data.request_id };
  }
}

/**
 * Fast2SMS (Indian DLT SMS Gateway)
 */
export class Fast2SmsProvider implements SmsProvider {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.FAST2SMS_API_KEY || '';
  }

  async sendOtp(mobile: string, otp: string): Promise<SendOtpResult> {
    if (!this.apiKey) {
      throw new Error('FAST2SMS_API_KEY is not configured');
    }

    const cleanMobile = mobile.replace(/\D/g, '').slice(-10);

    const res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
      method: 'POST',
      headers: {
        authorization: this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        variables_values: otp,
        route: 'otp',
        numbers: cleanMobile,
      }),
    });

    const data = await res.json();
    if (!data.return) {
      return { success: false, error: data.message || 'Fast2SMS error' };
    }
    return { success: true, messageId: data.request_id };
  }
}

/**
 * Console SMS Provider for Development & Automated Testing
 * Securely logs formatted dispatch without exposing OTP to client endpoints
 */
export class ConsoleSmsProvider implements SmsProvider {
  async sendOtp(mobile: string, otp: string, clientName: string): Promise<SendOtpResult> {
    const maskedMobile = mobile.replace(/(\d{2})\d+(\d{4})/, '$1******$2');
    console.log(`\n================== [SMS DISPATCH GATEWAY] ==================`);
    console.log(`📱 Recipient Client: ${clientName}`);
    console.log(`📞 Mobile Number:    ${maskedMobile}`);
    console.log(`🔐 Verification OTP: ${otp}`);
    console.log(`⏳ Expiration:       5 Minutes (300 Seconds)`);
    console.log(`🏢 Sender ID:        MANAVI-ASSOCIATES-CAFLOW`);
    console.log(`============================================================\n`);
    return { success: true, messageId: `DEV-SMS-${Date.now()}` };
  }
}

/**
 * Provider factory based on environment settings
 */
export class SmsService {
  private static instance: SmsService;
  private provider: SmsProvider;

  private constructor() {
    const providerType = (process.env.SMS_PROVIDER || '').toUpperCase();
    if (providerType === 'TWILIO' && process.env.TWILIO_ACCOUNT_SID) {
      this.provider = new TwilioSmsProvider();
    } else if (providerType === 'MSG91' && process.env.MSG91_AUTH_KEY) {
      this.provider = new Msg91SmsProvider();
    } else if (providerType === 'FAST2SMS' && process.env.FAST2SMS_API_KEY) {
      this.provider = new Fast2SmsProvider();
    } else {
      this.provider = new ConsoleSmsProvider();
    }
  }

  public static getInstance(): SmsService {
    if (!SmsService.instance) {
      SmsService.instance = new SmsService();
    }
    return SmsService.instance;
  }

  public setProvider(provider: SmsProvider) {
    this.provider = provider;
  }

  public async sendOtp(mobile: string, otp: string, clientName: string): Promise<SendOtpResult> {
    return this.provider.sendOtp(mobile, otp, clientName);
  }

  /**
   * Cryptographically secure 6-digit numeric OTP generator (100000 - 999999)
   */
  public static generateSecureOtp(): string {
    return crypto.randomInt(100000, 1000000).toString();
  }

  /**
   * One-way cryptographic hash for OTP with salt
   */
  public static hashOtp(otp: string, salt: string = ''): string {
    const secret = process.env.OTP_SALT_SECRET || 'caflow_otp_salt_secret_2026_finance_ops';
    return crypto.createHmac('sha256', secret).update(`${otp}:${salt}`).digest('hex');
  }

  /**
   * Verifies an OTP against a stored hash
   */
  public static verifyOtpHash(enteredOtp: string, storedHash: string, salt: string = ''): boolean {
    const computedHash = this.hashOtp(enteredOtp, salt);
    return crypto.timingSafeEqual(Buffer.from(computedHash), Buffer.from(storedHash));
  }
}
