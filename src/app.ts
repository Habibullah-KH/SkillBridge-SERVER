import cors from "cors";
import express from "express";
import type {Application} from "express";
import { toNodeHandler } from "better-auth/node";
import {auth as authFromLib} from "./lib/auth"

import auth from "./middleware/auth";
import {UserRole} from "./middleware/auth";


const app: Application = express()

app.use(cors({
    origin: process.env.APP_URL,
    credentials: true
}))

app.all("/api/auth/{*any}", toNodeHandler(authFromLib));

app.use(express.json())

app.use("/",auth(UserRole.STUDENT), (req, res) => {
    console.log("apple");
    res.send("apple run")
})
export default app;