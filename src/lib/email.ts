import nodemailer from "nodemailer";

// Sends through the club's Gmail account when GMAIL_USER and
// GMAIL_APP_PASSWORD are set; otherwise prints the message to the server
// console so local development needs no email setup.
let transport: nodemailer.Transporter | null = null;

export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    console.log(`\n--- email to ${to} ---\nSubject: ${subject}\n\n${text}\n----------------------\n`);
    return;
  }
  transport ??= nodemailer.createTransport({ service: "gmail", auth: { user, pass: pass.replace(/\s/g, "") } });
  // Gmail always sends as the signed-in account, so only the display name is ours to pick.
  await transport.sendMail({ from: { name: process.env.EMAIL_FROM_NAME || "T4C Hub", address: user }, to, subject, text });
}
