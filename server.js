// server.js
const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");

const app = express();

require("dotenv").config();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

// const pool = new Pool({
//   user: "postgres",
//   host: "localhost",
//   database: "detect_LLM",
//   password: "root",
//   port: 5432,
// });

const totalQuestions = process.env.TOTAL_QUESTIONS || 41;
// // Endpoint to get a scenario
// app.get("/api/scenario/:id", async (req, res) => {
//   try {
//     const { id } = req.params;
//     const result = await pool.query("SELECT * FROM scenarios WHERE id = $1", [
//       id,
//     ]);
//     res.json(result.rows[0]);
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: "Server error" });
//   }
// });

// // Endpoint to get a random benchmark prompt
// app.get("/api/benchmark-prompt", async (req, res) => {
//   try {
//     const result = await pool.query(
//       "SELECT * FROM benchmark_prompts ORDER BY RANDOM() LIMIT 1"
//     );
//     res.json(result.rows[0]);
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: "Server error" });
//   }
// });

// Endpoint to save a conversation
app.post("/api/save-conversation", async (req, res) => {
  try {
    const {
      uid,
      // u_name,
      scenario_id,
      first_message,
      benchmark_prompt,
      user_response,
      response_time,
      timestamp,
    } = req.body;
    const result = await pool.query(
      "INSERT INTO saved_conversations (u_id, scenario_id, first_message, benchmark_prompt, user_response, response_time, timestamp) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *",
      [
        uid,
        // u_name,
        scenario_id,
        first_message,
        benchmark_prompt,
        user_response,
        response_time,
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Endpoint to save user details
app.post("/api/save-user", async (req, res) => {
  try {
    const { u_id, age, occupation, highest_edu_lvl } = req.body;
    const result = await pool.query(
      "INSERT INTO users (u_id, age, occupation, highest_edu_lvl) VALUES ($1, $2, $3, $4) RETURNING u_id",
      [u_id, age, occupation, highest_edu_lvl]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});

// app.get("/api/total-scenarios", async (req, res) => {
//   try {
//     const result = await pool.query("SELECT COUNT(*) as total FROM scenarios");
//     // console.log(result.rows[0].total);
//     res.json({ total: parseInt(result.rows[0].total) });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: "Server error" });
//   }
// });

app.get("/api/study-data", async (req, res) => {
  try {
    const scenariosQuery = "SELECT * FROM scenarios ORDER BY id";
    const promptsQuery = `
      SELECT tactic, COUNT(*) OVER(PARTITION BY tactic) as tactic_count, * 
      FROM benchmark_prompts
    `;
    const totalPromptsQuery = "SELECT COUNT(*) as total FROM benchmark_prompts";

    const [scenariosResult, promptsResult, totalPromptsResult] =
      await Promise.all([
        pool.query(scenariosQuery),
        pool.query(promptsQuery),
        pool.query(totalPromptsQuery),
      ]);

    const scenarios = scenariosResult.rows;
    const prompts = promptsResult.rows;
    const totalPrompts = parseInt(totalPromptsResult.rows[0].total);

    const promptsPerTactic = {};
    prompts.forEach((prompt) => {
      if (!promptsPerTactic[prompt.tactic]) {
        promptsPerTactic[prompt.tactic] = Math.round(
          (prompt.tactic_count / totalPrompts) * totalQuestions
        );
      }
    });

    // Shuffle prompts
    for (let i = prompts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [prompts[i], prompts[j]] = [prompts[j], prompts[i]];
    }

    // Distribute prompts per tactic
    const selectedPrompts = {};
    Object.keys(promptsPerTactic).forEach((tactic) => {
      selectedPrompts[tactic] = prompts
        .filter((prompt) => prompt.tactic === tactic)
        .slice(0, promptsPerTactic[tactic]);
    });

    // Flatten selected prompts
    const flattenedPrompts = Object.values(selectedPrompts).flat();

    // Shuffle all selected prompts
    for (let i = flattenedPrompts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [flattenedPrompts[i], flattenedPrompts[j]] = [
        flattenedPrompts[j],
        flattenedPrompts[i],
      ];
    }

    // Distribute prompts evenly across scenarios
    const promptsPerScenario = Math.ceil(
      flattenedPrompts.length / scenarios.length
    );
    const distributedPrompts = scenarios.map((scenario, index) => ({
      ...scenario,
      prompts: flattenedPrompts.slice(
        index * promptsPerScenario,
        (index + 1) * promptsPerScenario
      ),
    }));

    // Handle excess prompts
    const excessPrompts = flattenedPrompts.slice(
      scenarios.length * promptsPerScenario
    );
    if (excessPrompts.length > 0) {
      distributedPrompts[distributedPrompts.length - 1].prompts.push(
        ...excessPrompts
      );
    }

    res.json({
      scenarios: distributedPrompts,
      totalPrompts: flattenedPrompts.length,
      promptsPerScenario,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

function generateRandomCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 7; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

app.post("/api/generate-code", async (req, res) => {
  try {
    const { uid } = req.body;
    if (!uid) {
      return res.status(400).json({ error: "UUID is required" });
    }

    const userResult = await pool.query(
      "SELECT u_id FROM users WHERE u_id = $1",
      [uid]
    );
    if (userResult.rowCount === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const conversationCountResult = await pool.query(
      "SELECT COUNT(*) as count FROM saved_conversations WHERE u_id = $1",
      [uid]
    );
    const conversationCount = parseInt(conversationCountResult.rows[0].count);
    if (conversationCount < totalQuestions) {
      return res.status(400).json({ error: "Survey not finished!" });
    }

    const code = generateRandomCode();

    // Save the generated code to the users table
    await pool.query("UPDATE users SET reward_code = $1 WHERE u_id = $2", [
      code,
      uid,
    ]);

    res.json({ code });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});
