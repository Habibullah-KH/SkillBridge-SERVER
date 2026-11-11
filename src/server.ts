import app from "./app";
import { prisma } from "./lib/prisma";

const PORT = process.env.PORT || 5000;

const main = async( )=> {
try{
    await prisma.$connect();
    console.log("connected to the database successfully")

    app.listen(PORT, () => {
        console.log("server is running on port : ", PORT);
    })
}
catch(err){
    console.error("An error occoure :( > ", err);
    await prisma.$disconnect();
    process.exit(1);
}
}

main();
