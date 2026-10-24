import { db } from "./src/prisma/db";

const users = await (db.orm.public.User as any).include("posts").all();
console.dir(users, { depth: null });

await db.close();
