const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");
const { GoogleGenAI } = require("@google/genai");

dotenv.config();
const { SUPABASE_KEY: supabaseKey, SUPABASE_URL: supabaseUrl } = process.env;
console.log("supabaseKey", supabaseKey);
console.log("supabaseUrl", supabaseUrl);
const supabase = createClient(supabaseUrl, supabaseKey);

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("bye");
});

app.get("/plans", async (req, res) => {
  const { data, error } = await supabase.from("tour_plan").select("*");
  if (error) {
    return res.status(400).json({ error: error.message });
  }
  res.json(data);
});

// 1. SDK
// 2. API Key <- .env
// 3. 여러 단계를 프롬프팅 -> (값) => (프롬프트) => (결과값)
app.post("/plans", async (req, res) => {
  const plan = req.body;
  // ai를 통해
  // npm install @google/genai
  const result = await chaining(plan);
  // plan.ai_suggestion = response2.text;
  plan.ai_suggestion = result;
  const { error } = await supabase.from("tour_plan").insert(plan);
  if (error) {
    return res.status(400).json({ error: error.message });
  }
  res.status(201).json();
});

app.delete("/plans", async (req, res) => {
  const { planId } = req.body;
  const { error } = await supabase
    .from("tour_plan") // table
    .delete() // 삭제
    .eq("id", planId); // eq = equal = id가 planId
  if (error) {
    return res.status(400).json({ error: error.message });
  }
  res.status(204).json(); // noContent
});

app.listen(port, () => {
  console.log(`서버가 ${port}번 포트로 실행 중입니다.`);
});

async function chaining(plan) {
  const ai = new GoogleGenAI({}); // GEMINI_API_KEY 알아서 인식해줌
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `
    [장소] ${plan.destination}
    [목적] ${plan.purpose}
    [인원수] ${plan.people_count}
    [시작일] ${plan.start_date}
    [종료일] ${plan.end_date}`,
    config: {
      // 형식을 구조화
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
          },
        },
        required: ["prompt"],
      },
      systemInstruction: [
        // { text: "제공받은 정보를 바탕으로 여행 계획을 짜되, 300자 이내로." },
        {
          text: `제공받은 정보를 바탕으로 최적의 여행 계획을 세우기 위한 프롬프트를 작성해줘. 응답은 JSON 형식으로 {"prompt": "프롬프트 내용"} 형식으로 작성해줘.`,
        },
      ],
      // structured output
    },
  });
  const { prompt } = JSON.parse(response.text);
  console.log("prompt", prompt);
  const response2 = await ai.models.generateContent({
    model: "gemini-2.5-flash-lite", // 모델을 상대적으로 약한 모델로...
    contents: prompt,
    config: {
      systemInstruction: [
        {
          text: "프롬프트에 따라 작성하되, 300자 이내 plain text(no markdown or rich text)로.",
        },
      ],
    },
  });
  return response2.text;
}
