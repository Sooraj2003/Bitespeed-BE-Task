import express from "express";
import { Request,Response } from "express";

const app = express();

app.get("/get",(req:Request,res:Response)=>{
    res.json({
        message:"got"
    })
})



app.listen(3000);
