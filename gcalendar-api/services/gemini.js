import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import fs from "fs";
import {fileTypeFromBuffer} from "file-type";
import express from 'express';

const router = express.Router();

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

let mimeType = null;
let imageBase64 = null;
const imagePath = "C:\\Users\\Laptop\\Desktop\\현수막2.png";
//const imagePath = null;
    
try{
    const imageBuffer = fs.readFileSync(imagePath);
    const imageType = await fileTypeFromBuffer(imageBuffer);
    mimeType = imageType?.mime ?? "image/png";
    imageBase64 = fs.readFileSync(imagePath, { encoding: "base64" });
}catch(err){
    mimeType = null;
    imageBase64 = null;
}

/*
const userInput = `
안녕하세요? 겨울방학 웹 프로그래밍 부트 캠프에 신청해주신 학생 여러분들,

1월 19일 월요일부터 1월 30일 금요일까지 진행될 부트 캠프에 관하여 아래와 같이 안내를 드립니다.

일정 : 1월 19일(월) ~ 1월 30일(금), 총 10일
시간 : 오전 10시부터 오후 5시까지
원활한 부프 캠프 진행을 위하여 9시 50분까지 입실 부탁드립니다.
장소 : IT대학 5호관 224호 실습실 (https://naver.me/xKEFvbl4)
커리큘럼 : 첨부를 참조해주세요.
자료 공유 및 소통을 위해서 디스코드 서버를 설정했습니다. 디스코드 서버에 참여해주세요.
https://discord.gg/fxGAvKxH
1월 23일 금요일 & 1월 30일 금요일에는 도시락을 제공할 예정입니다.
문의 사항이 있으면, 메일로 연락을 주시거나 디스코드에서 bluebrise 로 연락주세요.
`;
*/
const userInput = ``

const parts = [];
parts.push({
    text: `이미지에서 일정 정보를 추출해서 위 JSON만 출력해. 설명 문장 금지. ${userInput}`
})

if(imageBase64 && mimeType){
    parts.push({
        inlineData: {
        mimeType,
        data: imageBase64
        }
    });
}

async function main() {
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
    contents: [
      {
        role: "user",
        parts
      },
    ],
  });

  console.log(response.text);
}

router.post('/generate',async (req, res) => {
    try {
    const { city, startDate, endDate } = req.body;

    if (!city || !startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Missing required fields: city, startDate, endDate' });
    }

    const prompt = `
      ${city} 여행 계획을 ${startDate}부터 ${endDate}까지의 일정으로 상세하게 작성해줘.
      
      반드시 다음 구조의 JSON 형식으로만 응답해야 해:
      {
        "title": "${city} 여행 계획",
        "city": "${city}",
        "duration": "일정 기간 (예: 2박 3일)",
        "itinerary": [
          {
            "day": 날짜번호 (숫자),
            "date": "YYYY-MM-DD",
            "theme": "해당 날짜의 테마",
            "activities": ["활동 1", "활동 2", "활동 3"],
            "meals": {
              "lunch": "점심 추천 메뉴 및 장소",
              "dinner": "저녁 추천 메뉴 및 장소"
            }
          }
        ]
      }
      JSON 외의 다른 텍스트나 마크다운 기호(\`\\\)는 포함하지 마. 모든 내용은 한국어로 작성.
    `;

    const response = await genAI.models.generateContent({
      model: aiModels.flash, // 'gemini-3-flash-preview'
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
      }
    });

    // Debug logging
    console.log('Full AI Response:', JSON.stringify(response, null, 2));

    // Validating response content
    const responseText = response.text;
    if (!responseText) {
      throw new Error('Empty response from AI model');
    }
    console.log(responseText);

    const planJson = JSON.parse(responseText);
    res.json({ success: true, ...planJson });

  } catch (err) {
    console.error('Plan generation error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
})
export default router;