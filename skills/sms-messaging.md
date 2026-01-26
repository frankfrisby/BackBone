# SMS Messaging Skill

Send and receive SMS messages programmatically.

## Dependencies
```bash
npm install twilio
```

## Twilio SMS Setup

```javascript
import twilio from 'twilio';

class SMSClient {
  constructor(accountSid, authToken, fromNumber) {
    this.client = twilio(accountSid, authToken);
    this.fromNumber = fromNumber;
  }

  // Send single SMS
  async send(to, body) {
    const message = await this.client.messages.create({
      body,
      from: this.fromNumber,
      to
    });
    return {
      sid: message.sid,
      status: message.status,
      to: message.to,
      body: message.body
    };
  }

  // Send with media (MMS)
  async sendWithMedia(to, body, mediaUrls) {
    const message = await this.client.messages.create({
      body,
      from: this.fromNumber,
      to,
      mediaUrl: mediaUrls
    });
    return message;
  }

  // Send to multiple recipients
  async sendBulk(recipients, body, options = {}) {
    const results = [];
    for (const to of recipients) {
      try {
        const result = await this.send(to, body);
        results.push({ to, success: true, sid: result.sid });

        // Rate limiting
        if (options.delay) {
          await new Promise(r => setTimeout(r, options.delay));
        }
      } catch (error) {
        results.push({ to, success: false, error: error.message });
      }
    }
    return results;
  }

  // Get message status
  async getStatus(messageSid) {
    const message = await this.client.messages(messageSid).fetch();
    return {
      sid: message.sid,
      status: message.status,
      errorCode: message.errorCode,
      errorMessage: message.errorMessage
    };
  }

  // List messages
  async listMessages(options = {}) {
    const messages = await this.client.messages.list({
      dateSentAfter: options.after,
      dateSentBefore: options.before,
      to: options.to,
      from: options.from,
      limit: options.limit || 20
    });

    return messages.map(m => ({
      sid: m.sid,
      to: m.to,
      from: m.from,
      body: m.body,
      status: m.status,
      dateSent: m.dateSent
    }));
  }
}
```

## Phone Number Validation

```javascript
async function validatePhoneNumber(client, phoneNumber) {
  try {
    const lookup = await client.lookups.v2
      .phoneNumbers(phoneNumber)
      .fetch({ fields: 'line_type_intelligence' });

    return {
      valid: true,
      phoneNumber: lookup.phoneNumber,
      countryCode: lookup.countryCode,
      carrier: lookup.lineTypeIntelligence?.carrier_name,
      type: lookup.lineTypeIntelligence?.type
    };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

function formatPhoneNumber(phone, countryCode = '1') {
  // Remove all non-digits
  const cleaned = phone.replace(/\D/g, '');

  // Add country code if missing
  if (cleaned.length === 10) {
    return `+${countryCode}${cleaned}`;
  } else if (cleaned.length === 11 && cleaned.startsWith(countryCode)) {
    return `+${cleaned}`;
  }

  return `+${cleaned}`;
}
```

## SMS Templates

```javascript
class SMSTemplates {
  constructor() {
    this.templates = new Map();
  }

  add(name, template) {
    this.templates.set(name, template);
  }

  render(name, data) {
    const template = this.templates.get(name);
    if (!template) throw new Error(`Template ${name} not found`);

    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return data[key] !== undefined ? data[key] : match;
    });
  }

  // Common templates
  static defaults() {
    const templates = new SMSTemplates();

    templates.add('verification', 'Your verification code is: {{code}}. Valid for {{minutes}} minutes.');
    templates.add('reminder', 'Reminder: {{event}} is scheduled for {{time}}.');
    templates.add('confirmation', 'Your {{type}} has been confirmed. Reference: {{reference}}');
    templates.add('alert', 'ALERT: {{message}}. Reply STOP to unsubscribe.');
    templates.add('welcome', 'Welcome to {{company}}, {{name}}! Reply HELP for assistance.');

    return templates;
  }
}
```

## Opt-out Management

```javascript
class OptOutManager {
  constructor(storage) {
    this.storage = storage; // Could be database, file, etc.
    this.optedOut = new Set();
  }

  async load() {
    const data = await this.storage.get('optedOut') || [];
    this.optedOut = new Set(data);
  }

  async save() {
    await this.storage.set('optedOut', Array.from(this.optedOut));
  }

  async optOut(phoneNumber) {
    this.optedOut.add(formatPhoneNumber(phoneNumber));
    await this.save();
  }

  async optIn(phoneNumber) {
    this.optedOut.delete(formatPhoneNumber(phoneNumber));
    await this.save();
  }

  isOptedOut(phoneNumber) {
    return this.optedOut.has(formatPhoneNumber(phoneNumber));
  }

  filterRecipients(recipients) {
    return recipients.filter(r => !this.isOptedOut(r));
  }
}
```

## Webhook Handler for Incoming SMS

```javascript
import express from 'express';

function createSMSWebhookHandler(callback) {
  const router = express.Router();

  router.post('/sms', express.urlencoded({ extended: false }), async (req, res) => {
    const message = {
      from: req.body.From,
      to: req.body.To,
      body: req.body.Body,
      messageSid: req.body.MessageSid,
      numMedia: parseInt(req.body.NumMedia) || 0,
      mediaUrls: []
    };

    // Get media URLs if any
    for (let i = 0; i < message.numMedia; i++) {
      message.mediaUrls.push(req.body[`MediaUrl${i}`]);
    }

    try {
      const response = await callback(message);

      // TwiML response
      res.type('text/xml');
      if (response) {
        res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${response}</Message></Response>`);
      } else {
        res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
      }
    } catch (error) {
      console.error('SMS webhook error:', error);
      res.status(500).send('Error processing message');
    }
  });

  return router;
}
```

## Conversation Tracking

```javascript
class SMSConversation {
  constructor(storage) {
    this.storage = storage;
  }

  getKey(phone) {
    return `conversation:${formatPhoneNumber(phone)}`;
  }

  async getHistory(phone, limit = 50) {
    const key = this.getKey(phone);
    const messages = await this.storage.get(key) || [];
    return messages.slice(-limit);
  }

  async addMessage(phone, message, direction) {
    const key = this.getKey(phone);
    const messages = await this.storage.get(key) || [];

    messages.push({
      direction, // 'inbound' or 'outbound'
      body: message,
      timestamp: new Date().toISOString()
    });

    // Keep last 100 messages
    if (messages.length > 100) {
      messages.splice(0, messages.length - 100);
    }

    await this.storage.set(key, messages);
  }
}
```

## Usage Examples

```javascript
// Setup
const sms = new SMSClient(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN,
  process.env.TWILIO_PHONE_NUMBER
);

// Send single message
await sms.send('+1234567890', 'Hello from the app!');

// Send with image
await sms.sendWithMedia('+1234567890', 'Check this out!', [
  'https://example.com/image.jpg'
]);

// Bulk send
const results = await sms.sendBulk(
  ['+1111111111', '+2222222222'],
  'Flash sale: 50% off today only!',
  { delay: 500 }
);

// Templates
const templates = SMSTemplates.defaults();
const verifyMsg = templates.render('verification', { code: '123456', minutes: 10 });
await sms.send('+1234567890', verifyMsg);

// Webhook handler
app.use('/webhooks', createSMSWebhookHandler(async (msg) => {
  console.log(`Received from ${msg.from}: ${msg.body}`);

  if (msg.body.toUpperCase() === 'STOP') {
    await optOutManager.optOut(msg.from);
    return 'You have been unsubscribed.';
  }

  return 'Thanks for your message!';
}));
```
