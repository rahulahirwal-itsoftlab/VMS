import crypto from 'node:crypto';
import sendEmail from '../../utils/email.js';

export const ACTIVATION_TOKEN_TTL_MINUTES = Number(process.env.ACTIVATION_TOKEN_TTL_MINUTES || 60);
export const ACTIVATION_RESEND_COOLDOWN_MINUTES = Number(process.env.ACTIVATION_RESEND_COOLDOWN_MINUTES || 2);

export const generateActivationToken = () => crypto.randomBytes(32).toString('base64url');

export const hashActivationToken = (token) =>
  crypto.createHash('sha256').update(token, 'utf8').digest('hex');

export const getActivationUrl = (token) => {
  const baseUrl = process.env.FRONTEND_ACTIVATION_URL || process.env.FRONTEND_URL || 'http://localhost:5173/activate-account';
  const url = new URL(baseUrl);
  url.searchParams.set('token', token);
  return url.toString();
};

const safeName = (user) => `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'User';
const safeCreatorName = (creator) => `${creator?.first_name || ''} ${creator?.last_name || ''}`.trim() || creator?.email || 'an administrator';

export const buildActivationEmail = ({ user, creator, token }) => {
  const activationUrl = getActivationUrl(token);
  const expiresIn = `${ACTIVATION_TOKEN_TTL_MINUTES} minutes`;
  const name = safeName(user);
  const creatorName = safeCreatorName(creator);

  const html = `<!DOCTYPE html>
<html>
<body style="background:#f8fafc;padding:24px;font-family:Arial,sans-serif;color:#0f172a;">
  <div style="max-width:620px;margin:auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:28px;">
    <h2 style="margin:0 0 16px;color:#1d4ed8;">Vendor Management System account invitation</h2>
    <p>Hello <b>${name}</b>,</p>
    <p>${creatorName} created your VMS account. Use the secure link below to set your password.</p>
    <table style="width:100%;border-collapse:collapse;margin:18px 0;">
      <tr><td style="padding:6px 0;color:#64748b;">Employee ID</td><td style="padding:6px 0;font-weight:700;">${user.employee_id || '-'}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b;">Role</td><td style="padding:6px 0;font-weight:700;">${user.role}</td></tr>
    </table>
    <p style="margin:24px 0;">
      <a href="${activationUrl}" style="background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;">Set your password</a>
    </p>
    <p>This link expires in <b>${expiresIn}</b> and can be used only once.</p>
    <p style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px;">Security warning: do not forward this invitation. VMS will never ask you to share your password.</p>
    <p style="font-size:12px;color:#64748b;">If the button does not work, paste this link into your browser:<br>${activationUrl}</p>
  </div>
</body>
</html>`;

  const text = [
    'Vendor Management System account invitation',
    `Hello ${name},`,
    `${creatorName} created your VMS account.`,
    `Employee ID: ${user.employee_id || '-'}`,
    `Role: ${user.role}`,
    `Set your password: ${activationUrl}`,
    `This link expires in ${expiresIn} and can be used only once.`,
    'Security warning: do not forward this invitation. VMS will never ask you to share your password.',
  ].join('\n');

  return {
    subject: 'Set up your VMS account',
    html,
    text,
    activationUrl,
  };
};

export const sendActivationEmail = async ({ user, creator, token }) => {
  const email = buildActivationEmail({ user, creator, token });
  await sendEmail({
    to: user.email,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
  return email;
};
