import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST || 'smtp.gmail.com',
  port: env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});

export async function enviarEmailCobranca({ email, planName, link }) {
  const mailOptions = {
    from: `"Impulso Social" <${env.SMTP_USER}>`,
    to: email,
    subject: `Aviso de Pagamento Atrasado - Assinatura ${planName}`,
    html: `
      <div style="font-family: sans-serif; padding: 20px; color: #333;">
        <h2>Sua assinatura precisa de atenção!</h2>
        <p>Identificamos que o pagamento da sua assinatura <strong>${planName}</strong> para o perfil <code>${link}</code> está em atraso.</p>
        <p>Para manter o envio automático dos seus serviços de engajamento ativo, por favor regularize o pagamento acessando o link do seu pedido ou renovando o PIX no site.</p>
        <br>
        <p>Atenciosamente,<br>Equipe Impulso Social</p>
      </div>
    `,
  };

  return await transporter.sendMail(mailOptions);
}