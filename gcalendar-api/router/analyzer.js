import multer from 'multer';
import path from 'path';
import express from 'express';
import fs from'fs';
import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';
import { pool } from '../db/db.js';

dotenv.config();


const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const router = express.Router();

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/images/"),
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

const planDir = "uploads/plans/";

function savePlanToServerStorage(planData){
    const safeSummary = planData.summary.replace(/[^a-z0-9ㄱ-ㅎㅏ-ㅣ가-힣]/gi, '_').substring(0, 20);
    const randomNumber = (Math.floor(Math.random() * 10) + 1).toString();
    const fileName = `${Date.now()}_${safeSummary}${randomNumber}.json`;
    const filePath = path.join(planDir, fileName);
    
    fs.writeFile(filePath, JSON.stringify(planData, null, 2), (err) => {
        if (err) {
            console.error('파일 저장 중 오류 발생:', err);
        } else {
            console.log(`일정 저장 완료: ${filePath}`);
        }
    });

    return filePath;
}

async function dbInsert(messagepath, imagepath = null){
    
    // Insert log : image exists
    if(imagepath != null)
    {
        const newLog = await pool.query(
        `INSERT INTO logs 
        (messagepath, imagepath) VALUES ($1, $2) 
        RETURNING id, messagepath, imagepath, created_at`,
        [messagepath, imagepath]
    );
    } else {
        const newLog = await pool.query(
        `INSERT INTO logs 
        (messagepath) VALUES ($1) 
        RETURNING id, messagepath, created_at`,
        [messagepath]
    );
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
        
        const imagepath = req.file.path;
        const mimeType = req.file.mimetype;
        const userInput = '';
        const prompt = `이미지에서 일정 정보를 추출해서 위 JSON만 출력해. 설명 문장 금지. ${userInput}`;
        const imagePart = filenameToUploadGemini(imagepath, mimeType);


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
                        "start": { "date": "YYYY-MM-DD", "time": "HH:MM", "timeZone": "Asia/Seoul" },
                        "end":   { "date": "YYYY-MM-DD", "time": "HH:MM", "timeZone": "Asia/Seoul" }
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

        const resultText = response.text || "";
        const cleaned = resultText
        .trim()
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```$/i, "")
        .trim();

        let parsed;
        try {
        parsed = JSON.parse(cleaned);
        } catch (e) {
        return res.status(500).json({
            success: false,
            message: "Gemini output is not valid JSON",
            raw: resultText
        });
        }
        
        console.log(response.text);
        const messagepath = savePlanToServerStorage(parsed);
        
        dbInsert(messagepath, imagepath);
        
        return res.json({ success: true, message: parsed });

    } catch(err){
        res.status(500).json({ success : false, message : err.message});
    }
});


router.post("/text", async (req, res) => {
  try {
    const text = String(req.body?.text ?? "").trim();
    if (!text) {
      return res.status(400).json({ success: false, message: "text is required" });
    }

    const prompt = `아래 텍스트에서 일정 정보를 추출해서 위 JSON만 출력해. 설명 문장 금지.\n\n${text}`;

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
            "start": { "date": "YYYY-MM-DD", "time": "HH:MM", "timeZone": "Asia/Seoul" },
            "end":   { "date": "YYYY-MM-DD", "time": "HH:MM", "timeZone": "Asia/Seoul" }
            }
        `.trim(),
        temperature: 0.2,
        maxOutputTokens: 3000,
      },
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
    });

    const resultText = response.text || "";
    const cleaned = resultText
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return res.status(500).json({
        success: false,
        message: "Gemini output is not valid JSON",
        raw: resultText,
      });
    }
    
    const messagepath = savePlanToServerStorage(parsed);
    dbInsert(messagepath);

    return res.json({ success: true, message: parsed });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/multi", upload.single('image'), async (req, res) => {

    console.log("req.file:", req.file);
    //console.log("file size:", req.file?.size);

    if (!req.file || req.file.size === 0) {
        return res.status(400).json({
            success: false,
            message: "Image upload failed (empty file)"
    });
    }

    try{
        if(!req.file) return res.status(400).send({success : false, message : "file not found"});
        
        const imagepath = req.file.path;
        const mimeType = req.file.mimetype;
        //const userInput = String(req.body?.text ?? "").trim();
        //const prompt = `아래 텍스트에서 일정 정보를 추출해서 위 JSON만 출력해. 설명 문장 금지.\n\n${userInput}`;
        const imagePart = filenameToUploadGemini(imagepath, mimeType);

        // 2. HTTP 요청의 'prompt' 필드 읽기 (req.body.prompt)
        const userInput = String(req.body?.prompt ?? "").trim();
        
        // 3. 프롬프트 구성: 날짜 유효성 및 데이터 우선순위 가이드 추가
        const prompt = `
            [데이터 우선순위]
            1. 텍스트 대화 내용
            2. 이미지 내의 텍스트 정보

            [지시사항]
            - 입력된 대화나 이미지의 날짜가 달력상 불가능한 날짜(예: 윤년이 아닌 해의 2월 29일)라면, 
              문맥상 가장 적절한 실제 날짜로 교정해서 출력해. (예: 2026년 2월 29일 -> 2026-03-01)
            - 출력은 오직 JSON만 해.

            사용자 입력 대화:
            ${userInput}
        `.trim();

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
                        "start": { "date": "YYYY-MM-DD", "time": "HH:MM", "timeZone": "Asia/Seoul" },
                        "end":   { "date": "YYYY-MM-DD", "time": "HH:MM", "timeZone": "Asia/Seoul" }
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

        const resultText = response.text || "";
        const cleaned = resultText
        .trim()
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```$/i, "")
        .trim();

        let parsed;
        try {
        parsed = JSON.parse(cleaned);
        } catch (e) {
        return res.status(500).json({
            success: false,
            message: "Gemini output is not valid JSON",
            raw: resultText
        });
        }
        
        console.log(response.text);
        const messagepath = savePlanToServerStorage(parsed);
        
        dbInsert(messagepath, imagepath);
        
        return res.json({ success: true, message: parsed });

    } catch(err){
        res.status(500).json({ success : false, message : err.message});
    }
});
export default router;