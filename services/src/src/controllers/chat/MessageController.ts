import { Request, Response } from "express"
import { MessageService } from "../../services/chat/MessageService"
import { bucket } from '../../config/firebase';

export class MessageController {
    public createMessage = async (req: Request, res: Response): Promise<void> => {
        const sender_id = req.user_id
        const { chat_id } = req.params
        const { content, type } = req.body
        const file = req.file;

        if (!chat_id || !content)
            throw new Error('ID do chat e conteúdo da mensagem são obrigatórios')

        const ms = new MessageService();

        let fileUrl: string = ""

        if (file) {
          const uploadResult = await ms.uploadMedia(file, chat_id);
          fileUrl = uploadResult.filePath;
        }

        const messageService = new MessageService()
        const message = await messageService.createMessage({ sender_id, chat_id, content, fileUrl, type })

        res.json(message)
    }

    public getMessagesForChat = async (req: Request, res: Response): Promise<void> => {
        const user_id = req.user_id
        const chat_id = req.params.chat_id
        const { limit, page } = req.query as { limit?: number, page?: number }

        if (!chat_id)
            throw new Error('ID do chat é obrigatório')

        const messageService = new MessageService()
        const messages = await messageService.getMessagesForChat({
            chat_id,
            user_id,
            limit,
            page,
        })

        res.json(messages)
    }

    public searchMessages = async (req: Request, res: Response): Promise<void> => {
        const user_id = req.user_id
        const { query } = req.query as { query: string }

        const messageService = new MessageService()
        const messages = await messageService.searchMessages(user_id, query)

        res.json(messages)
    }

    public uploadMedia = async (req: Request, res: Response): Promise<void> => {
        const file = req.file;
        const { chat_id } = req.body

        if (!req.file) {
            res.status(400).json({ error: "Nenhum arquivo enviado." });
            return 
        }

        let fileUrl: string = "";

        const messageService = new MessageService()
        const upload = await messageService.uploadMedia(file, chat_id)

        fileUrl = upload.filePath;

        res.json({ fileUrl });
    }
    public getMedia = async (request: Request, response: Response): Promise<void> => {
        const { filePath } = request.query;
        if (!filePath || typeof filePath !== 'string') {
            response.status(400).json({ error: 'Parâmetro filePath é obrigatório.' });
            return
        }

        try {
            const file = bucket.file(filePath);
            const [url] = await file.getSignedUrl({
                action: 'read',
                expires: Date.now() + 5 * 60 * 1000, // 5 minutos
            });

            response.json({ url });
        } catch (error) {
            response.status(500).json({ error: 'Erro ao gerar URL assinada.' });
        }
    }
}