const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { GoogleGenAI } = require('@google/genai');

// Load environment variables from .env file
dotenv.config();

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('./')); // Serve static frontend files from current directory

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// API Route for AI Coach
app.post('/api/coach', async (req, res) => {
  try {
    const { profile, log, goals, streak } = req.body;

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'YOUR_API_KEY_HERE') {
      return res.status(500).json({ error: 'Gemini API key is not configured on the server.' });
    }

    // Construct the prompt with user's data
    const prompt = `
      You are FitCore AI, a world-class, highly motivational personal fitness coach.
      
      USER PROFILE:
      - Name: ${profile.name}
      - Goal: ${profile.goal} weight
      - Current Weight: ${profile.weight} kg
      - Activity Level: ${profile.activityLevel}
      
      CURRENT STATUS (Today):
      - Calories Consumed: ${log.caloriesIn} kcal (Goal: ${goals.calories} kcal)
      - Water Intake: ${log.water} ml (Goal: ${goals.water} ml)
      - Workouts Logged: ${log.workout.exercises.length} exercises
      - Current Streak: ${streak} days
      
      Based on this data, provide a structured JSON response with the following keys EXACTLY:
      {
        "greeting": "A short, highly motivational greeting using their name",
        "analysis": "A brief 2-sentence analysis of their progress today (e.g. 'You are 500 calories under goal, great job! You need more water.')",
        "tips": [
          { "title": "Hydration/Nutrition/Recovery", "content": "Specific actionable tip 1 based on their data" },
          { "title": "Hydration/Nutrition/Recovery", "content": "Specific actionable tip 2 based on their data" },
          { "title": "Hydration/Nutrition/Recovery", "content": "Specific actionable tip 3 based on their data" }
        ]
      }
      
      Ensure the response is valid JSON and nothing else. Do not include markdown formatting like \`\`\`json.
    `;

    // Call Gemini API
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      }
    });

    const aiResponseText = response.text;
    const aiData = JSON.parse(aiResponseText);
    
    res.json(aiData);

  } catch (error) {
    console.error('Error calling Gemini API:', error);
    res.status(500).json({ error: 'Failed to generate AI insights.' });
  }
});

// Start server
app.listen(port, () => {
  console.log(`FitCore AI Server is running!`);
  console.log(`Open http://localhost:${port} in your browser.`);
});
