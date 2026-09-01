export { emailService } from './email.service.js';
export { clearCapturedEmails, createEmailProvider, getCapturedEmails } from './email.provider.js';
export {
  emailVerificationTemplate,
  emailChangeConfirmationTemplate,
  accountReactivationTemplate,
  securityNoticeTemplate,
  invitationTemplate,
  passwordResetTemplate
} from './email.templates.js';
