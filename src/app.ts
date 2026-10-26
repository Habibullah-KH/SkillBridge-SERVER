import express, { Application } from "express";

const app: Application = express();

app.use(express.json());

app.get("/", (_req, res) => {
    res.status(200).send("SKILLBRIDGE server is running :)")
})
export default app;