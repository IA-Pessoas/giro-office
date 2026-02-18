import { Request, Response } from "express"
import { UserService } from "../services/UserService"
import { bucket } from '../config/firebase';

class UserController {
    public create = async (request: Request, response: Response): Promise<void> => {
        const my_id = request.user_id
        const {
            name, 
            login, 
            password,
            permission,
            department_id
        } = request.body
      
        const userService = new UserService()

        const user = await userService.create({
            my_id,
            name,
            login,
            password,
            permission,
            department_id
        })

        response.json(user)
    }
    public login = async (request: Request, response: Response): Promise<void> => {
        const { login, password } = request.body

        const userService = new UserService()
        
        const session = await userService.login({
            login,
            password
        })

        response.json(session)
    }
    public detail = async (request: Request, response: Response): Promise<void> => {

        const user_id = request.user_id
        // console.log(user_id)

        const userService = new UserService()

        const detailUser = await userService.detail(user_id)

        response.json(detailUser)
    }
    public details = async (request: Request, response: Response): Promise<void> => {
        let { user_id } = request.body

        if (user_id === undefined)
            user_id = request.query.user_id

        const userService = new UserService()

        const detailUser = await userService.detail(user_id)

        response.json(detailUser)
    }
    public update = async (request: Request, response: Response): Promise<void> => {
        const my_id = request.user_id
        const { user_id, name, password, permission, status, department_id, current_photo } = request.body;
        const file = request.file;
      
        let photo: string = "";
      
        const updateUser = new UserService();
      
        if (file) {
          if (current_photo !== "") {
            await updateUser.deleteUserPhoto(current_photo);
          }

          const uploadResult = await updateUser.uploadUserPhoto(file, user_id);
          photo = uploadResult.filePath;
        }
      
        const user = await updateUser.update({
          my_id,
          user_id,
          name,
          password,
          permission,
          status,
          department_id,
          photo,
        });
      
        response.json(user);
    }
    public list = async (request: Request, response: Response): Promise<void> => {
        let { status } = request.body

        if (status === undefined)
            status = request.query.status

        const user = new UserService()
        const users = await user.list(status)

        response.json(users)
    }
    public getUserPhoto = async (request: Request, response: Response): Promise<void> => {
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
    
    public createPermission = async (request: Request, response: Response): Promise<void> => {
        const { user_id } = request.body
      
        const userService = new UserService()

        const user = await userService.createPermission(user_id)

        response.json(user)
    }
    public getPermission = async (request: Request, response: Response): Promise<void> => {
        const user_id = request.user_id
        const modulo = request.query.modulo as string

        const userService = new UserService()

        const permission = await userService.getPermission(user_id, modulo) 

        response.json(permission)
    }
    
    public createPermissionSpecific = async (request: Request, response: Response): Promise<void> => {
        const { user_id, task_completion } = request.body
        const my_id = request.user_id
        
        const userService = new UserService()
        
        const user = await userService.createPermissionSpecific({ my_id, user_id, task_completion })
        
        response.json(user)
    }
    public updatePermissionSpecific = async (request: Request, response: Response): Promise<void> => {
        const my_id = request.user_id
        const { user_id, task_completion } = request.body

        const userService = new UserService()

        const permission = await userService.UpdatePermissionSpecific({ my_id, user_id, task_completion }) 

        response.json(permission)
    }
    public getPermissionSpecific = async (request: Request, response: Response): Promise<void> => {
        const user_id = request.body

        const userService = new UserService()

        const permission = await userService.getPermissionSpecific(user_id) 

        response.json(permission)
    }

    public firstCreate = async (request: Request, response: Response): Promise<void> => {     
        const userService = new UserService()
        const user = await userService.firstCreate()
        response.json(user)
    }
}

export { UserController }