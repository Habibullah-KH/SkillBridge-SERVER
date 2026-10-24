import db form "./src/prisma/db"

const users = await db.orm.public.User.include("posts").all();
console.dir(users, { depth: null });

await db.close();