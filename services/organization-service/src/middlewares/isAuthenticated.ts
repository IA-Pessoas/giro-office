import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

interface PayLoad {
  sub: string;
}

export function isAuthenticated(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  const authToken = request.headers.authorization;

  if (!authToken) {
    response.status(401).end();
    return;
  }

  const [, token] = authToken.split(" ");

  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error("JWT_SECRET is not defined in environment variables");
    }

    const { sub } = jwt.verify(token, jwtSecret) as PayLoad;

    request.user_id = sub;

    return next();
  } catch (error) {
    return response.status(401).end();
  }
}
