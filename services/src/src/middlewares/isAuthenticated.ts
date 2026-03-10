import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

interface PayLoad{
    sub: string;
    organization_id?: string;
}

export function isAuthenticated(
    request: Request,
    response: Response,
    next: NextFunction
) {
    const authToken = request.headers.authorization;

    if (!authToken) {
        response.status(401).end();
        return 
    }

    const [, token] = authToken.split(" ");

    try {
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            throw new Error("JWT_SECRET is not defined in environment variables");
        }
        
        const decoded = jwt.verify(token, jwtSecret) as PayLoad;
        
        if (!decoded || !decoded.sub) {
            return response.status(401).json({ error: 'Token inválido' });
        }

        if (!decoded.organization_id) {
            return response.status(401).json({ error: 'Organization ID não encontrado no token' });
        }

        request.user_id = decoded.sub;
        request.organization_id = decoded.organization_id;
        return next();
        
    } catch (error) {
        return response.status(401).json({ error: 'Token inválido ou expirado' });
    }
}