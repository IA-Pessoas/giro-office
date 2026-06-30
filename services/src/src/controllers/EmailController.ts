import { Request, Response } from "express"
import { EmailService } from "../services/EmailService"

// Interface para o corpo da requisição, para garantir a tipagem
interface SendEmailRequestBody {
  recipientEmail: string;
  userName: string;
}

class EmailController {
  public create = async (request: Request, response: Response): Promise<void> => {
    const { email, responsible, new_client_sending, task_stalled_sending } = request.body
    const my_id = request.user_id

    const emailService = new EmailService()

    const create = await emailService.create({
      my_id,
      email, 
      responsible, 
      new_client_sending, 
      task_stalled_sending
    })

    response.json(create)
  }
  public update = async (request: Request, response: Response): Promise<void> => {
    const {
      email_id, 
      email, 
      responsible, 
      new_client_sending, 
      task_stalled_sending
    } = request.body
    const my_id = request.user_id

    const emailService = new EmailService()
    const update = await emailService.update({
      my_id,
      email_id, 
      email, 
      responsible, 
      new_client_sending, 
      task_stalled_sending
    })

    response.json(update)
  }  
  public details = async (request: Request, response: Response): Promise<void> => {
    let { email_id } = request.body
    if (email_id === undefined)
      email_id = request.query.email_id

    const emailService = new EmailService()

    const detail = await emailService.detail(email_id)

    response.json(detail)
  }
  public list = async (request: Request, response: Response): Promise<void> => {
    const emailService = new EmailService();
    const list = await emailService.list();

    response.json(list);
  }
  public delete = async (request: Request, response: Response): Promise<void> => {
    let { id } = request.body
    const my_id = request.user_id

    const es = new EmailService()
    const deleted = await es.delete(id, my_id)

    response.json(deleted)
  }

  public async sendWelcomeEmail(req: Request<{}, {}, SendEmailRequestBody>, res: Response): Promise<Response> {
    const { recipientEmail, userName } = req.body;

    // 1. Validação
    if (!recipientEmail || !userName) {
      return res
        .status(400)
        .json({ message: 'Recipient email and user name are required.' });
    }

    // 2. Criação do conteúdo do email
    const emailHtml = `
      <h1>Bem-vindo(a), ${userName}!</h1>
      <p>Obrigado por se registrar em nossa plataforma.</p>
      <p>Estamos muito felizes em ter você conosco.</p>
    `;

    // 3. Lógica de envio
    try {
      await new EmailService().sendWelcomeEmail({
        to: recipientEmail,
        subject: 'Bem-vindo(a) à Nossa Plataforma!',
        html: emailHtml,
      });

      return res.status(200).json({ message: 'Welcome email sent successfully!' });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: 'Error sending email.' });
    }
  }
}

export { EmailController }