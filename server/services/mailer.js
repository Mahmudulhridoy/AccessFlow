import nodemailer from "nodemailer";
import env from "../config/env.js";

let transport;

const getTransport = () =>
  (transport ??= nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpPort === 465,
    auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPass } : undefined,
  }));

export async function sendResetEmail(to, link) {
  if (!env.smtpHost) {
    if (env.isProd) throw new Error("SMTP is not configured");
    // Local development: no mail server needed, the link is printed in the server terminal
    console.log(`\nPassword reset link for ${to}:\n${link}\n`);
    return;
  }

  await getTransport().sendMail({
    from: env.mailFrom,
    to,
    subject: "Reset your AccessFlow password",
    text: [
      "We received a request to reset your AccessFlow password.",
      "",
      "Open this link within 30 minutes to choose a new password:",
      link,
      "",
      "If you didn't ask for this, you can ignore this email. Your password will not change.",
    ].join("\n"),
  });
}
