import cors from "cors";
import express from "express";
import type {Application} from "express";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth";


const app: Application = express()

app.use(cors({
    origin: process.env.APP_URL,
    credentials: true
}))

app.all('/api/auth/{*any}', toNodeHandler(auth));

app.use(express.json())

export default app;