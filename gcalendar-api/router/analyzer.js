import multer from 'multer';
import path from 'path';
import express from 'express';
import fs from'fs';
import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';

dotenv.config();


const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const router = express.Router();

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "upload/"),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});

const upload = multer({storage : storage});

function filenameToUploadGemini(path, mimeType){    
    return {inlineData: {
        data: fs.readFileSync(path).toString("base64"),
        mimeType   
    }
}
}


router.post("/image", upload.single('image'), async(req, res) => {

    console.log("req.file:", req.file);
    console.log("file size:", req.file?.size);

    if (!req.file || req.file.size === 0) {
        return res.status(400).json({
            success: false,
            message: "Image upload failed (empty file)"
    });
    }



    try{
        if(!req.file) return res.status(400).send({success : false, message : "file not found"});
        
        const filePath = req.file.path;
        const mimeType = req.file.mimetype;
        const userInput = '';
        const prompt = `이미지에서 일정 정보를 추출해서 위 JSON만 출력해. 설명 문장 금지. ${userInput}`;
        const imagePart = filenameToUploadGemini(filePath, mimeType);


        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            config: {
                systemInstruction: `
                    이미지 파일이 입력되면 텍스트를 추출한 뒤 아래의 JSON 형식에 맞춰서 응답해 줘.
                    텍스트 입력이 들어오면 아래의 JSON 형식에 알맞게 내용을 분류해서 응답해 줘.

                    응답은 반드시 아래의 형식에 맞춰서 답변해야 해.
                    {
                        "summary": "일정 제목",
                        "description": "일정 설명",
                        "location": "일정 장소",
                        "start": {
                            "date": "yyyy-mm-dd"
                            또는
                            "dateTime": "RFC3339 timestamp",
                            "timeZone": "string"
                        },
                        "end": {
                            "date": "yyyy-mm-dd"
                            또는
                            "dateTime": "RFC3339 timestamp",
                            "timeZone": "string"
                        }
                    }
                `.trim(),
                temperature: 0.2,
                maxOutputTokens: 3000,
                },
            contents: [{
                    role: "user",
                    parts: [
                        {text: prompt}, 
                        imagePart]
            },],
            });

        const resultText = response.text || "failed to analyze image";

        res.send({success : true, message : resultText}); 

    } catch(err){
        res.status(500).send({ success : false, message : err.message});
    }
});

export default router;