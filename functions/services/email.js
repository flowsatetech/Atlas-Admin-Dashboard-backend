const path = require('path');
const fs = require('fs');
const { logger } = require('../helpers');

const EMAIL_TEMPLATES_DIR = path.join(__dirname, '..', 'templates', 'emails');

const MAIL_FROM = process.env.MAIL_FROM || 'info@atlasafrica.org';
const BREVO_API_KEY = process.env.BREVO_API_KEY || '';
const DASHBOARD_URL = process.env.APP_BASE_URL
  ? (() => {
      try {
        const urls = JSON.parse(process.env.APP_BASE_URL);
        return Array.isArray(urls) && urls.length > 0 ? urls[0] : 'http://localhost:3000';
      } catch {
        return 'http://localhost:3000';
      }
    })()
  : 'http://localhost:3000';

function loadBaseTemplate() {
  try {
    return fs.readFileSync(path.join(EMAIL_TEMPLATES_DIR, 'base.html'), 'utf8');
  } catch (err) {
    logger('EMAIL_SERVICE').error('Failed to load base email template:', err);
    return '<html><body>{{BODY_CONTENT}}</body></html>';
  }
}

function loadEmailTemplate(templateName) {
  try {
    const templatePath = path.join(EMAIL_TEMPLATES_DIR, templateName);
    return fs.readFileSync(templatePath, 'utf8');
  } catch (err) {
    logger('EMAIL_SERVICE').error(`Failed to load email template "${templateName}":`, err);
    return `<p>{{MESSAGE}}</p>`;
  }
}

function renderTemplate(template, variables) {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value || '');
  }
  return result;
}

function buildEmailHtml(bodyContent) {
  const baseTemplate = loadBaseTemplate();
  return baseTemplate.replace('{{BODY_CONTENT}}', bodyContent);
}

class EmailService {
  static async sendMail({ to, subject, html }) {
    if (!to) {
      logger('EMAIL_SERVICE').warn('sendMail called without recipient');
      return false;
    }

    if (!BREVO_API_KEY) {
      logger('EMAIL_SERVICE').warn('sendMail called without BREVO_API_KEY set in environment');
      return false;
    }

    try {
      const payload = {
        sender: { name: "Atlas Admin Notifications", email: MAIL_FROM },
        to: [{ email: to }],
        subject: subject,
        htmlContent: html
      };

      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': BREVO_API_KEY,
          'content-type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Brevo API returned ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      logger('EMAIL_SERVICE').info(`Email sent to ${to}: ${data.messageId}`);
      return true;
    } catch (error) {
      console.error(`[EMAIL_SERVICE_ERROR] Failed to send email to ${to}:`, error.message);
      return false;
    }
  }

  static async sendNotificationEmail({ user, notification, templateVariables = {} }) {
    if (!user || !user.email) {
      logger('EMAIL_SERVICE').warn('sendNotificationEmail called without valid user');
      return false;
    }

    const templateMap = {
      TASK_ASSIGNMENT: {
        template: 'task-assignment.html',
        subject: (v) => `New Task Assigned: ${v.TASK_TITLE}`,
      },
      PROJECT_ASSIGNMENT: {
        template: 'project-assignment.html',
        subject: (v) => `Added to Project: ${v.PROJECT_NAME}`,
      },
      CLIENT_ASSIGNMENT: {
        template: 'client-assignment.html',
        subject: (v) => `Client Assigned: ${v.CLIENT_NAME}`,
      },
      LEAD_ASSIGNMENT: {
        template: 'lead-assignment.html',
        subject: (v) => `Lead Assigned: ${v.LEAD_NAME}`,
      },
      COMMENT_MENTION: {
        template: 'comment-mention.html',
        subject: () => `You were mentioned in a comment`,
      },
      ROLE_CHANGE: {
        template: 'role-changed.html',
        subject: (v) => `Account Permissions Updated: ${v.NEW_ROLE}`,
      },
      SYSTEM_ALERT: {
        template: 'system-alert.html',
        subject: () => `System Alert`,
      },
      CLIENT_CREATED: {
        template: 'client-created.html',
        subject: (v) => `New Client Created: ${v.CLIENT_NAME}`,
      },
      PROJECT_STATUS_CHANGE: {
        template: 'project-update.html',
        subject: (v) => `Project Update: ${v.PROJECT_NAME}`,
      },
      LEAD_STATUS_CHANGE: {
        template: 'lead-update.html',
        subject: (v) => `Lead Update: ${v.LEAD_NAME}`,
      },
      PROJECT_COMMENT: {
        template: 'project-comment.html',
        subject: (v) => `New Comment on Project: ${v.PROJECT_NAME}`,
      },
      PASSWORD_UPDATED: {
        template: 'password-changed.html',
        subject: () => 'Your Password Was Updated',
      },
      NEW_LOGIN_DETECTED: {
        template: 'new-login-detected.html',
        subject: () => 'New Login Detected on Your Account',
      },
    };

    const emailConfig = templateMap[notification.type];
    if (!emailConfig) {
      logger('EMAIL_SERVICE').warn(`No email template configured for notification type: ${notification.type}`);
      return false;
    }

    const firstName = user.firstName || user.fullName || 'User';
    const lastName = user.lastName || '';
    const recipientName = `${firstName} ${lastName}`.trim() || 'User';

    const variables = {
      RECIPIENT_NAME: recipientName,
      DASHBOARD_URL,
      ...templateVariables,
    };

    const bodyContent = renderTemplate(loadEmailTemplate(emailConfig.template), variables);
    const html = buildEmailHtml(bodyContent);
    const subject = typeof emailConfig.subject === 'function'
      ? emailConfig.subject(variables)
      : 'Notification from Atlas Admin Dashboard';

    return this.sendMail({ to: user.email, subject, html });
  }

  static async sendNotificationEmails(notificationsWithUsers = []) {
    if (!Array.isArray(notificationsWithUsers) || notificationsWithUsers.length === 0) return [];

    const results = await Promise.allSettled(
      notificationsWithUsers.map(({ user, notification, templateVariables }) =>
        this.sendNotificationEmail({ user, notification, templateVariables })
      )
    );

    return results.map((r) => r.status === 'fulfilled' ? r.value : false);
  }
}

module.exports = EmailService;