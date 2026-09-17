import nodemailer from "nodemailer";

const cleanEnvStr = (val) => (val ? String(val).trim().replace(/^['"]|['"]$/g, '') : '');

const EMAIL_TIMEOUT_MS = 10000;

const sendEmail = async (options) => {
  const host = cleanEnvStr(process.env.SMTP_HOST);
  const port = Number(cleanEnvStr(process.env.SMTP_PORT)) || 587;
  const user = cleanEnvStr(process.env.SMTP_USER);
  const pass = cleanEnvStr(process.env.SMTP_PASS);
  const from = cleanEnvStr(process.env.EMAIL_FROM) || `"VMS" <${user}>`;

  if (!host || !port || !user || !pass) {
    console.error('[EMAIL] Missing SMTP configuration:', {
      host: !!host,
      port: !!port,
      user: !!user,
      pass: !!pass,
    });
    throw new Error("SMTP configuration is missing in environment variables (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS).");
  }

  console.log(`[EMAIL] Initializing SMTP transport (${host}:${port}, secure=${port === 465})...`);

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
  });

  const sendTask = async () => {
    await transporter.verify();
    return await transporter.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      text: options.text || "",
      html: options.html || "",
      cc: options.cc,
      bcc: options.bcc,
      attachments: options.attachments || [],
    });
  };

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`SMTP email operation timed out after ${EMAIL_TIMEOUT_MS}ms`));
    }, EMAIL_TIMEOUT_MS);
  });

  try {
    const info = await Promise.race([sendTask(), timeoutPromise]);
    return info;
  } catch (error) {
    console.error('[EMAIL] Send operation error:', error?.message || error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

export default sendEmail;

