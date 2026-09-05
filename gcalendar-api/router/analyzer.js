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

async function savePlanToServerStorage(planData){
  if (!fs.existsSync(planDir)) fs.mkdirSync(planDir, { recursive: true });

  const safeSummary = (planData.summary ?? "")
    .replace(/[^a-z0-9ㄱ-ㅎㅏ-ㅣ가-힣]/gi, "_")
    .substring(0, 20);

  const randomNumber = String(Math.floor(Math.random() * 10) + 1);
  const fileName = `${Date.now()}_${safeSummary}${randomNumber}.json`;
  const filePath = path.join(planDir, fileName);

  await fs.promises.writeFile(filePath, JSON.stringify(planData, null, 2), "utf-8");
  return filePath;
}



async function dbInsert(summary, messagepath, imagepath = null, eventId = null) {
  const { rows } = await pool.query(
    `
    INSERT INTO logs (summary, messagepath, imagepath, event_id)
    VALUES ($1, $2, $3, $4)
    RETURNING id, summary, messagepath, imagepath, event_id, created_at
    `,
    [summary ?? null, messagepath, imagepath, eventId]
  );
  return rows[0];
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
        const messagepath = await savePlanToServerStorage(parsed);
        const saved = await dbInsert(parsed?.summary, messagepath, imagepath, null);
        return res.json({ success: true, message: parsed, logId: saved.id });

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
    
    const messagepath = await savePlanToServerStorage(parsed);
    const saved = await dbInsert(parsed?.summary, messagepath, null, null);
    return res.json({ success: true, message: parsed, logId: saved.id });


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
        const messagepath = await savePlanToServerStorage(parsed);
        const saved = await dbInsert(parsed?.summary, messagepath, imagepath, null);
        return res.json({ success: true, message: parsed, logId: saved.id });

    } catch(err){
        res.status(500).json({ success : false, message : err.message});
    }
});

router.patch("/logs/:id/event", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const eventId = String(req.body?.eventId ?? "").trim();
    if (!id || !eventId) return res.status(400).json({ success:false, message:"id/eventId required" });

    const { rows } = await pool.query(
      `UPDATE logs SET event_id=$1 WHERE id=$2 RETURNING id, event_id`,
      [eventId, id]
    );
    return res.json({ success:true, log: rows[0] });
  } catch (err) {
    return res.status(500).json({ success:false, message: err.message });
  }
});

router.get("/logs/by-event/:eventId", async (req, res) => {
  try {
    const eventId = String(req.params.eventId ?? "").trim();
    if (!eventId) return res.status(400).json({ success:false, message:"eventId required" });

    const { rows } = await pool.query(
      `SELECT id, summary, messagepath, imagepath, event_id, created_at
       FROM logs
       WHERE event_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [eventId]
    );

    const row = rows[0] ?? null;
    if (!row) return res.status(404).json({ success:false, message:"log not found" });

    return res.json({ success:true, log: row });
  } catch (err) {
    return res.status(500).json({ success:false, message: err.message });
  }
});

router.get("/logs/:id/raw", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success:false, message:"invalid log id" });
    }

    const { rows } = await pool.query(
      `SELECT id, messagepath, imagepath FROM logs WHERE id=$1`,
      [id]
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ success:false, message:"log not found" });

    let planJson = null;
    if (row.messagepath) {
      const p = path.resolve(row.messagepath);
      if (fs.existsSync(p)) {
        planJson = JSON.parse(fs.readFileSync(p, "utf-8"));
      }
    }

    return res.json({
      success: true,
      raw: { plan: planJson, imagepath: row.imagepath }
    });
  } catch (err) {
    return res.status(500).json({ success:false, message: err.message });
  }
});



router.get("/logs", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);

    const { rows } = await pool.query(
      `
      SELECT id, summary, created_at
      FROM logs
      ORDER BY created_at DESC
      LIMIT $1
      `,
      [limit]
    );

    return res.json({ success: true, logs: rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});


router.delete("/logs", async (req, res) => {
  try {
    // 1) DB에서 삭제 대상 경로 확보
    const { rows } = await pool.query(`SELECT messagepath, imagepath FROM logs`);

    // 2) DB 삭제 (먼저 경로를 확보했으니 DB는 지워도 됨)
    await pool.query(`DELETE FROM logs`);

    // 3) 파일만 찾아가서 삭제
    let deletedFiles = 0;

    for (const r of rows) {
      for (const p of [r.messagepath, r.imagepath]) {
        if (!p) continue;

        const abs = path.resolve(p);
        if (!fs.existsSync(abs)) continue;

        try {
          const st = fs.statSync(abs);
          if (st.isFile()) {
            fs.unlinkSync(abs);
            deletedFiles += 1;
          }
        } catch {
          // 파일 삭제 실패는 무시 (권한/잠금 등)
        }
      }
    }

    return res.json({ success: true, deletedRows: rows.length, deletedFiles });
  } catch (e) {
    return res.status(500).json({ success: false, message: String(e) });
  }
});


export default router;