import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import prismaClient from "../prisma"
import { LogService } from "./LogService"

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootEnvPath = path.resolve(__dirname, '../../../../.env');

dotenv.config({ path: rootEnvPath });

// Configuração do "Transporte" do Nodemailer
// Usamos o objeto createTransport que irá de fato enviar o email
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com', // Servidor SMTP do Gmail
  port: 465, // Porta do servidor SMTP (465 é a porta segura/SSL)
  secure: true, // true para port 465, false para outras portas como a 587
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

// Interface para definir a estrutura dos dados do email
interface MailOptions {
  to: string;
  subject: string;
  html: string;
}

interface CreateRequest {
  my_id: string
  email: string
  responsible: string
  new_client_sending: boolean
  task_stalled_sending: boolean
}
interface UpdateRequest {
  my_id: string
  email_id: string
  email: string
  responsible: string
  new_client_sending: boolean
  task_stalled_sending: boolean
}

class EmailService {
  async create({ my_id, email, responsible, new_client_sending, task_stalled_sending }: CreateRequest) {
    const exists = await prismaClient.emails.findFirst({
      where: {
        email
      }
    })
    if (exists)
      throw new Error("E-mail já existe")
    
    const create = await prismaClient.emails.create({
      data: {
        email,
        responsible,
        new_client_sending,
        task_stalled_sending,
      },
      select: {
        id: true,
        email: true,
        responsible: true,
        new_client_sending: true,
        task_stalled_sending: true,
      }
    })

    const ls = new LogService()
    await ls.createLog({
      my_id,
      action: "Cadastro",
      referring: "emails",
      referring_id: create.id,
      changes: "{}"
    })

    return { create }
  }
  async update({ my_id, email_id, email, responsible, new_client_sending, task_stalled_sending }: UpdateRequest) {
    try {
      const exists = await prismaClient.emails.findFirst({
        where: {
          id: email_id
        }
      })
      if (!exists)
        throw new Error("Email não existe")

      const updated = await prismaClient.emails.update({
        where: {
          id: email_id
        },
        data: {
          email, 
          responsible, 
          new_client_sending, 
          task_stalled_sending
        },
        select: {
          id: true,
          email: true,
          responsible: true,
          new_client_sending: true,
          task_stalled_sending: true,
        }
      })

      if (!updated) {
        throw new Error("Erro ao atualizar")
      }

      const ls = new LogService();
      await ls.logUpdateIfChanged({
        my_id,
        action: "Atualização",
        referring: "emails",
        referring_id: email_id,
        oldData: exists,
        updatedData: updated,
      });

      return updated
    } catch (error) {
      console.log(error)
      throw new Error("Erro ao atualizar")
    }
  }
  async detail(email_id: string) {
    const detail = await prismaClient.emails.findFirst({
      where: {
        id: email_id
      },
      select: {
        id: true,
        email: true,
        responsible: true,
        new_client_sending: true,
        task_stalled_sending: true,
      }
    })

    return { detail }
  }
  async list() {
    const list = await prismaClient.emails.findMany({
      orderBy: {
        email: 'asc'
      },
      select: {
        id: true,
        email: true,
        new_client_sending: true,
        task_stalled_sending: true,
      },
    });

    return { list };
  }
  async delete(id: string, my_id: string) {
    const exists = await prismaClient.emails.findUnique({
      where: { id }
    })
    if (!exists)
      throw new Error("Not found")

    const user = await prismaClient.user.findFirst({ where:{ id: my_id } })
    if (!user)
      throw new Error("Usuário não encontrado")
    if (user.permission !== 2) 
      throw new Error("Usuário não tem permissão")

    const response = await prismaClient.emails.delete({
      where: { id }
    })
    if (!response)
      throw new Error("Error deleting")

    return { response }
  }

  async sendWelcomeEmail(mailOptions: MailOptions) {
    try {
      // sendMail é uma função assíncrona que envia o email
      const info = await transporter.sendMail({
        from: `"Seu Nome ou Nome do App" <${process.env.EMAIL_USER}>`, // Remetente
        to: mailOptions.to, // Destinatário(s)
        subject: mailOptions.subject, // Assunto
        html: mailOptions.html, // Corpo do e-mail em HTML
      });

      console.log('Email sent: %s', info.messageId);
      return info;
    } catch (error) {
      console.error('Error sending email:', error);
      // Lançar o erro permite que o controller que chamou essa função o capture
      throw new Error('Failed to send email.');
    }
  };
  async sendTaskStalled(task_id: string) {
    try {
      const task = await prismaClient.task.findFirst({
        where: { id: task_id },
        select: {
          name: true,
          client: {
            select: {
              company_name: true
            }
          }
        }
      })
      if (!task)
        throw new Error("Tarefa não existe")

      const recipients = await prismaClient.emails.findMany({
        where: {
          task_stalled_sending: true
        },
        select: {
          email: true,
          responsible: true,
        },
        orderBy: {
          email: 'asc'
        }
      })

      const emailHtml = `
        <h1>PRODUTO PARALISADO!</h1>
        <h2>${task.name}</h2>
      `;

      if (recipients.length > 0) {
        const info = await transporter.sendMail({
          from: `"Castelo Workspace" <${process.env.EMAIL_USER}>`,
          to: recipients.map(recipient => `${recipient.responsible} <${recipient.email}>`).join(', '),
          subject: `PRODUTO PARALISADO - ${task.name} - ${task.client.company_name}`,
          html: emailHtml,
        });

        return info;
      } else {
        return {}
      }


    } catch (error) {
      console.error('Error sending email:', error);
      // Lançar o erro permite que o controller que chamou essa função o capture
      throw new Error('Failed to send email.');
    }
  };
  async sendNewClient(client_id: string, competence: string, my_id: string) {
    try {
      const client = await prismaClient.client.findFirst({
        where: { id: client_id },
        select: {
          name: true,
          company_name: true,
        }
      })
      if (!client)
        throw new Error("Cliente não existe")

      const user = await prismaClient.user.findFirst({
        where: { id: my_id },
        select: {
          name: true,
          photo: true,
          department: {
            select: {
              name: true
            }
          }
        }
      })
      if (!user)
        throw new Error("Usuário não existe")

      const recipients = await prismaClient.emails.findMany({
        where: {
          new_client_sending: true
        },
        select: {
          email: true,
          responsible: true,
        },
        orderBy: {
          email: 'asc'
        }
      })

      let emailHtml = ''
      if (competence === '') {
        emailHtml = `
          Notificação que o Projeto do cliente esta disponível para execução e monitoramento.<br /><br />

          Atenciosamente, <br /><br />

          <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 500px; border-collapse: collapse; font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #333333;">
            <tbody>
              <tr>
                <td style="padding: 20px 0;">
                  <table cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
                    <tbody>
                      <tr>
                        <td style="vertical-align: top; padding-right: 20px;">
                          <img src="${user.photo}" alt="Foto de [SEU_NOME]" width="90" style="width: 90px; border-radius: 50%;" />
                        </td>
                        <td style="vertical-align: top;">
                          <table cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
                            <tbody>
                              <tr>
                                <td style="padding-bottom: 2px;">
                                  <strong style="font-size: 18px; color: #0d47a1; font-family: Arial, Helvetica, sans-serif; letter-spacing: 0.5px;">${user.name}</strong>
                                </td>
                              </tr>
                              <tr>
                                <td style="padding-bottom: 10px;">
                                  <span style="font-size: 14px; color: #555555; font-family: Arial, Helvetica, sans-serif;">${user.department.name}</span>
                                </td>
                              </tr>
                              <tr>
                                <td style="border-top: 1px solid #dddddd; padding-bottom: 10px;"></td>
                              </tr>
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>
            </tbody>
          </table>
        `;
      } else {
        
        emailHtml = competence
      }


      const subject = (competence === '') ? `PROJETO - ${client.company_name}` : `CLIENTE NOVO - ${client.company_name}`

      if (recipients.length > 0) {
        const info = await transporter.sendMail({
          from: `"Castelo Workspace" <${process.env.EMAIL_USER}>`,
          to: recipients.map(recipient => `${recipient.responsible} <${recipient.email}>`).join(', '),
          subject: subject,
          html: emailHtml,
        });

        return info;
      } else {
        return {}
      }


    } catch (error) {
      console.error('Error sending email:', error);
      // Lançar o erro permite que o controller que chamou essa função o capture
      throw new Error('Failed to send email.');
    }
  };
}

export { EmailService }