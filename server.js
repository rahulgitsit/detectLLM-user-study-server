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

// Endpoint to save captcha responses
app.post("/api/save-captcha-response", async (req, res) => {
  try {
    const { uid, tactic, technique, prompt, user_response } = req.body;
    const result = await pool.query(
      "INSERT INTO captcha_responses (uid, tactic, technique, prompt, user_response, timestamp) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *",
      [uid, tactic, technique, prompt, user_response]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Endpoint to save a conversation
app.post("/api/save-conversation", async (req, res) => {
  try {
    const {
      uid,
      // u_name,
      scenario_id,
      tactic,
      technique,
      first_message,
      benchmark_prompt,
      user_response,
      response_time,
      timestamp,
    } = req.body;
    const result = await pool.query(
      "INSERT INTO saved_conversations (u_id, scenario_id, tactic, technique, first_message, benchmark_prompt, user_response, response_time, timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING *",
      [
        uid,
        // u_name,
        scenario_id,
        tactic,
        technique,
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

app.get("/api/study-data", async (req, res) => {
  try {
    const scenariosQuery = "SELECT * FROM scenarios ORDER BY id";
    const promptsQuery = `
      SELECT tactic, COUNT(*) OVER(PARTITION BY tactic) as tactic_count, *
      FROM benchmark_prompts
      WHERE tactic NOT IN ('String Processing Tasks', 'Basic Math')
    `;
    const totalPromptsQuery =
      "SELECT COUNT(*) as total FROM benchmark_prompts WHERE tactic NOT IN ('String Processing Tasks', 'Basic Math')";

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

// app.get("/api/string-math-data", async (req, res) => {
//   try {
//     const scenariosQuery = "SELECT * FROM scenarios ORDER BY id";
//     const promptsQuery = `
//       SELECT tactic, COUNT(*) OVER(PARTITION BY tactic) as tactic_count, *
//       FROM benchmark_prompts
//       WHERE tactic IN ('String Processing Tasks', 'Basic Math')
//     `;
//     const totalPromptsQuery =
//       "SELECT COUNT(*) as total FROM benchmark_prompts WHERE tactic IN ('String Processing Tasks', 'Basic Math')";

//     const [scenariosResult, promptsResult, totalPromptsResult] =
//       await Promise.all([
//         pool.query(scenariosQuery),
//         pool.query(promptsQuery),
//         pool.query(totalPromptsQuery),
//       ]);

//     const scenarios = scenariosResult.rows;
//     const prompts = promptsResult.rows;
//     const totalPrompts = parseInt(totalPromptsResult.rows[0].total);

//     const promptsPerTactic = {};
//     prompts.forEach((prompt) => {
//       if (!promptsPerTactic[prompt.tactic]) {
//         promptsPerTactic[prompt.tactic] = Math.round(
//           (prompt.tactic_count / totalPrompts) * totalQuestions
//         );
//       }
//     });

//     // Shuffle prompts
//     for (let i = prompts.length - 1; i > 0; i--) {
//       const j = Math.floor(Math.random() * (i + 1));
//       [prompts[i], prompts[j]] = [prompts[j], prompts[i]];
//     }

//     // Distribute prompts per tactic
//     const selectedPrompts = {};
//     Object.keys(promptsPerTactic).forEach((tactic) => {
//       selectedPrompts[tactic] = prompts
//         .filter((prompt) => prompt.tactic === tactic)
//         .slice(0, promptsPerTactic[tactic]);
//     });

//     // Flatten selected prompts
//     const flattenedPrompts = Object.values(selectedPrompts).flat();

//     // Shuffle all selected prompts
//     for (let i = flattenedPrompts.length - 1; i > 0; i--) {
//       const j = Math.floor(Math.random() * (i + 1));
//       [flattenedPrompts[i], flattenedPrompts[j]] = [
//         flattenedPrompts[j],
//         flattenedPrompts[i],
//       ];
//     }

//     // Distribute prompts evenly across scenarios
//     const promptsPerScenario = Math.ceil(
//       flattenedPrompts.length / scenarios.length
//     );
//     const distributedPrompts = scenarios.map((scenario, index) => ({
//       ...scenario,
//       prompts: flattenedPrompts.slice(
//         index * promptsPerScenario,
//         (index + 1) * promptsPerScenario
//       ),
//     }));

//     // Handle excess prompts
//     const excessPrompts = flattenedPrompts.slice(
//       scenarios.length * promptsPerScenario
//     );
//     if (excessPrompts.length > 0) {
//       distributedPrompts[distributedPrompts.length - 1].prompts.push(
//         ...excessPrompts
//       );
//     }

//     res.json({
//       scenarios: distributedPrompts,
//       totalPrompts: flattenedPrompts.length,
//       promptsPerScenario,
//     });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: "Server error" });
//   }
// });

app.get("/api/string-math-data", async (req, res) => {
  try {
    const promptsQuery = `
      SELECT *
      FROM benchmark_prompts
      WHERE tactic IN ('String Processing Tasks', 'Basic Math')
      ORDER BY RANDOM()
      LIMIT $1
    `;
    const totalPromptsQuery =
      "SELECT COUNT(*) as total FROM benchmark_prompts WHERE tactic IN ('String Processing Tasks', 'Basic Math')";

    const [promptsResult, totalPromptsResult] = await Promise.all([
      pool.query(promptsQuery, [totalQuestions]),
      pool.query(totalPromptsQuery),
    ]);

    const prompts = promptsResult.rows;
    // const totalPrompts = prompts.length;

    res.json(
      prompts
      // totalPrompts,
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/save-survey-response", async (req, res) => {
  try {
    const {
      uid,
      overall_difficulty,
      easiest_task,
      most_difficult_task,
      difficulty_compared_to_captcha,
      additional_comments,
    } = req.body;

    const result = await pool.query(
      "INSERT INTO survey_responses (uid, overall_difficulty, easiest_task, most_difficult_task, difficulty_compared_to_captcha, additional_comments) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [
        uid,
        overall_difficulty,
        easiest_task,
        most_difficult_task,
        difficulty_compared_to_captcha,
        additional_comments,
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// function generateRandomCode() {
//   const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
//   let result = "";
//   for (let i = 0; i < 7; i++) {
//     result += chars.charAt(Math.floor(Math.random() * chars.length));
//   }
//   return result;
// }

app.post("/api/fetch-reward-code", async (req, res) => {
  try {
    const { uid } = req.body;
    if (!uid) {
      return res.status(400).json({ error: "UUID is required" });
    }

    const userResult = await pool.query(
      "SELECT u_id FROM users WHERE u_id = $1",
      [uid]
    );
    console.log(userResult);
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

    // Fetch the next unused code from the reward_codes table
    const codeResult = await pool.query(
      "SELECT code FROM reward_codes WHERE used = false ORDER BY code LIMIT 1 FOR UPDATE"
    );

    if (codeResult.rowCount === 0) {
      return res.status(500).json({ error: "No reward codes available" });
    }

    const code = codeResult.rows[0].code;

    // Mark the code as used
    await pool.query("UPDATE reward_codes SET used = true WHERE code = $1", [
      code,
    ]);

    // Save the fetched code to the users table
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

app.post("/api/fetch-reward-code-captcha", async (req, res) => {
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

    const captchaCountResult = await pool.query(
      "SELECT COUNT(*) as count FROM captcha_responses WHERE uid = $1",
      [uid]
    );
    const captchaCount = parseInt(captchaCountResult.rows[0].count);
    if (captchaCount < totalQuestions) {
      return res.status(400).json({ error: "Survey not finished!" });
    }

    // Fetch the next unused code from the reward_codes table
    const codeResult = await pool.query(
      "SELECT code FROM reward_codes WHERE used = false ORDER BY code LIMIT 1 FOR UPDATE"
    );

    if (codeResult.rowCount === 0) {
      return res.status(500).json({ error: "No reward codes available" });
    }

    const code = codeResult.rows[0].code;

    // Mark the code as used
    await pool.query("UPDATE reward_codes SET used = true WHERE code = $1", [
      code,
    ]);

    // Save the fetched code to the users table
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
