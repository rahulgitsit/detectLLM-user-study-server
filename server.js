// server.js
const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");

const app = express();

const port = process.env.PORT;

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
      u_name,
      scenario_id,
      first_message,
      benchmark_prompt,
      user_response,
      response_time,
      timestamp,
    } = req.body;
    const result = await pool.query(
      "INSERT INTO saved_conversations (u_id, u_name, scenario_id, first_message, benchmark_prompt, user_response, response_time, timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING *",
      [
        uid,
        u_name,
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
    const { u_id, u_name, age, occupation, highest_edu_lvl } = req.body;
    const result = await pool.query(
      "INSERT INTO users (u_id, u_name, age, occupation, highest_edu_lvl) VALUES ($1, $2, $3, $4, $5) RETURNING u_id",
      [u_id, u_name, age, occupation, highest_edu_lvl]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
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
    const tacticsQuery = "SELECT DISTINCT tactic FROM benchmark_prompts";

    const [scenariosResult, tacticsResult] = await Promise.all([
      pool.query(scenariosQuery),
      pool.query(tacticsQuery),
    ]);

    const scenarios = scenariosResult.rows;
    const tactics = tacticsResult.rows.map((row) => row.tactic);

    let prompts = [];
    for (const tactic of tactics) {
      const promptsQuery = `
        SELECT * FROM benchmark_prompts 
        WHERE tactic = $1
      `;
      const promptsResult = await pool.query(promptsQuery, [tactic]);
      const tacticPrompts = promptsResult.rows;

      // Shuffle and select 5 random prompts
      for (let i = tacticPrompts.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [tacticPrompts[i], tacticPrompts[j]] = [
          tacticPrompts[j],
          tacticPrompts[i],
        ];
      }
      prompts.push(...tacticPrompts.slice(0, 5));
    }

    // Shuffle all selected prompts
    for (let i = prompts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [prompts[i], prompts[j]] = [prompts[j], prompts[i]];
    }

    // Distribute prompts evenly across scenarios
    const promptsPerScenario = Math.ceil(prompts.length / scenarios.length);
    const distributedPrompts = scenarios.map((scenario, index) => ({
      ...scenario,
      prompts: prompts.slice(
        index * promptsPerScenario,
        (index + 1) * promptsPerScenario
      ),
    }));

    // Handle excess prompts
    const excessPrompts = prompts.slice(scenarios.length * promptsPerScenario);
    if (excessPrompts.length > 0) {
      distributedPrompts[distributedPrompts.length - 1].prompts.push(
        ...excessPrompts
      );
    }

    res.json({
      scenarios: distributedPrompts,
      totalPrompts: prompts.length,
      promptsPerScenario,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});
