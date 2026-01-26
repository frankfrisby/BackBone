# Email Automation Skill

Send emails programmatically using various providers.

## Dependencies
```bash
npm install nodemailer
```

## Basic Email Setup with Nodemailer

```javascript
import nodemailer from 'nodemailer';

// Gmail configuration
const createGmailTransport = (user, appPassword) => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass: appPassword }
  });
};

// SMTP configuration
const createSMTPTransport = (config) => {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port || 587,
    secure: config.secure || false,
    auth: { user: config.user, pass: config.pass }
  });
};
```

## Send Basic Email

```javascript
async function sendEmail(transporter, options) {
  const mailOptions = {
    from: options.from,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html
  };

  const result = await transporter.sendMail(mailOptions);
  return result;
}
```

## Send Email with Attachments

```javascript
async function sendEmailWithAttachments(transporter, options) {
  const mailOptions = {
    from: options.from,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
    attachments: options.attachments.map(att => ({
      filename: att.filename,
      path: att.path,
      contentType: att.contentType
    }))
  };

  return await transporter.sendMail(mailOptions);
}
```

## Send HTML Email with Template

```javascript
function createHTMLEmail(data) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #4472C4; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .footer { padding: 10px; text-align: center; font-size: 12px; color: #999; }
        .button { display: inline-block; padding: 10px 20px; background: #4472C4; color: white; text-decoration: none; border-radius: 5px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${data.title}</h1>
        </div>
        <div class="content">
          <p>Hello ${data.name},</p>
          <p>${data.message}</p>
          ${data.buttonText ? `<p><a href="${data.buttonUrl}" class="button">${data.buttonText}</a></p>` : ''}
        </div>
        <div class="footer">
          <p>${data.footer || 'Sent with love'}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

async function sendTemplatedEmail(transporter, to, from, data) {
  return await sendEmail(transporter, {
    from,
    to,
    subject: data.subject,
    html: createHTMLEmail(data)
  });
}
```

## Bulk Email Sending

```javascript
async function sendBulkEmails(transporter, recipients, template) {
  const results = [];

  for (const recipient of recipients) {
    try {
      const personalizedHtml = createHTMLEmail({
        ...template,
        name: recipient.name
      });

      const result = await sendEmail(transporter, {
        from: template.from,
        to: recipient.email,
        subject: template.subject,
        html: personalizedHtml
      });

      results.push({ email: recipient.email, success: true, messageId: result.messageId });

      // Rate limiting - wait between emails
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      results.push({ email: recipient.email, success: false, error: error.message });
    }
  }

  return results;
}
```

## Email Validation

```javascript
function validateEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

function validateEmails(emails) {
  return emails.map(email => ({
    email,
    valid: validateEmail(email)
  }));
}
```

## Usage Examples

```javascript
// Setup
const transporter = createGmailTransport('your@gmail.com', 'app-password');

// Send simple email
await sendEmail(transporter, {
  from: 'your@gmail.com',
  to: 'recipient@example.com',
  subject: 'Hello',
  text: 'This is a test email'
});

// Send HTML email
await sendTemplatedEmail(transporter, 'recipient@example.com', 'your@gmail.com', {
  title: 'Welcome!',
  subject: 'Welcome to our service',
  name: 'John',
  message: 'Thank you for signing up. We are excited to have you!',
  buttonText: 'Get Started',
  buttonUrl: 'https://example.com/start'
});

// Send with attachment
await sendEmailWithAttachments(transporter, {
  from: 'your@gmail.com',
  to: 'recipient@example.com',
  subject: 'Report Attached',
  text: 'Please find the report attached.',
  attachments: [
    { filename: 'report.pdf', path: './report.pdf' }
  ]
});

// Bulk send
await sendBulkEmails(transporter, [
  { name: 'John', email: 'john@example.com' },
  { name: 'Jane', email: 'jane@example.com' }
], {
  from: 'your@gmail.com',
  subject: 'Newsletter',
  title: 'Monthly Update',
  message: 'Here is what happened this month...'
});
```
