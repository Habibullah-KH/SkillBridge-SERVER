import app from "./app";
import { db } from "./prisma/db";

const PORT = process.env.PORT || 5000;

async function main(){
    try{
        await db.connect();
        console.log("connected to database successfully :)")

        app.listen(PORT, () => {
            console.log("server is listening to port :> ", PORT)
        })
    } catch(error){
        console.log("error occured :( >", error);
         await db.close();
         process.exit(1);
    }
}

main();