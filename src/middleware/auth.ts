import type { NextFunction, Request, Response } from 'express';
import {auth as authFromLib} from "../lib/auth"

export enum UserRole {
        STUDENT = "STUDENT",
        TEACHER = "TEACHER",
        ADMIN = "ADMIN"
}

const auth = (...role: UserRole[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        try{
            const session = authFromLib.api.getSession({headers: req.headers})
            console.log(session);

            next()
        }
        catch(error){
            return res.status(403).json({
                success: false,
                message: error
            })
        }
    }
}

export default auth;