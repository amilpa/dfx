import inquirer from "inquirer";
import chalk from "chalk";
import fs from "fs";
import path from "path";
import os from "os";
import dotenv from "dotenv";
import { exec } from "child_process";
import {
  getCommitHistory,
  getCommitDiff,
  isGitRepository,
} from "../utils/index.js";
import { Groq } from "groq-sdk";

// Load environment variables from both default .env and user's custom .dfx.env file
const envPath = path.join(os.homedir(), ".dfx.env");
dotenv.config();
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

/**
 * Command to set up Groq API key
 */
const setupGroqApiKey = async () => {
  console.log(chalk.cyan("Setting up Groq API Key"));

  const { apiKey } = await inquirer.prompt([
    {
      type: "password",
      name: "apiKey",
      message: "Enter your Groq API Key:",
      validate: (input) => input.trim() !== "" || "API Key cannot be empty",
    },
  ]);

  try {
    // Create or update .env file in user's home directory
    const envPath = path.join(os.homedir(), ".dfx.env");

    // Read existing .env file if it exists
    let envContent = "";
    try {
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, "utf8");
      }
    } catch (error) {
      // Ignore errors reading the file, we'll create it
    }

    // Update or add GROQ_API_KEY
    const envLines = envContent
      .split("\n")
      .filter((line) => !line.startsWith("GROQ_API_KEY="));
    envLines.push(`GROQ_API_KEY=${apiKey}`);

    // Write back to file
    fs.writeFileSync(envPath, envLines.join("\n"), "utf8");

    // Set in current process
    process.env.GROQ_API_KEY = apiKey;

    console.log(chalk.green(`Groq API Key successfully saved to ${envPath}`));
    console.log(
      chalk.yellow("Note: The API key is now active for this session.")
    );

    return true;
  } catch (error) {
    console.error(chalk.red(`Error saving API key: ${error.message}`));
    return false;
  }
};

/**
 * Function to check if Groq API key is set up
 * @returns {boolean} - True if API key is set up, false otherwise
 */
const isGroqApiKeySetup = () => {
  return !!process.env.GROQ_API_KEY;
};

/**
 * Command to select a commit and view its diff
 */
const selectCommitDiff = async () => {
  if (!isGitRepository()) {
    console.error(
      chalk.red(
        "Not a git repository. Please run this command in a git repository."
      )
    );
    return;
  }

  // Check if Groq API key is set up
  if (!isGroqApiKeySetup()) {
    console.log(chalk.yellow("Groq API Key is not set up. Setting up now..."));
    const success = await setupGroqApiKey();
    if (!success) {
      console.log(
        chalk.yellow("Continuing without AI explanation capability...")
      );
    }
  }

  try {
    // Get commit history
    const commits = getCommitHistory(20);

    if (!commits.length) {
      console.log(chalk.yellow("No commits found in this repository."));
      return;
    }

    // Present commit selection menu
    const { selectedCommit } = await inquirer.prompt([
      {
        type: "list",
        name: "selectedCommit",
        message: "Select a commit to view diff:",
        choices: commits.map((commit) => ({
          name: `${chalk.green(commit.hash)} ${chalk.white(
            commit.subject
          )} - ${chalk.yellow(commit.author)} (${chalk.blue(commit.date)})`,
          value: commit.hash,
        })),
      },
    ]);

    // Get and display the diff for selected commit
    const diff = getCommitDiff(selectedCommit);
    console.log(chalk.cyan("\n--- Commit Diff ---\n"));
    console.log(diff);

    // Use Groq LLM to explain the diff
    console.log(chalk.cyan("\n--- AI Explanation of Diff ---\n"));
    try {
      const explanation = await explainDiffWithGroq(diff);
      console.log(explanation);
    } catch (error) {
      console.error(
        chalk.red(`Error getting AI explanation: ${error.message}`)
      );
      console.log(chalk.yellow("Continuing without AI explanation..."));
    }

    // Additional options menu
    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "What would you like to do?",
        choices: [
          { name: "Copy diff to clipboard", value: "copy" },
          { name: "Select another commit", value: "another" },
          { name: "Exit", value: "exit" },
        ],
      },
    ]);

    if (action === "copy") {
      try {
        await copyToClipboard(diff);
        console.log(chalk.green("Diff copied to clipboard successfully!"));

        // Ask what to do next after copying
        const { nextAction } = await inquirer.prompt([
          {
            type: "list",
            name: "nextAction",
            message: "What would you like to do now?",
            choices: [
              { name: "Select another commit", value: "another" },
              { name: "Exit", value: "exit" },
            ],
          },
        ]);

        if (nextAction === "another") {
          return selectCommitDiff();
        }
        // If "exit" is selected, the function will simply return
      } catch (error) {
        console.error(
          chalk.red(`Error copying to clipboard: ${error.message}`)
        );
      }
    } else if (action === "another") {
      // Restart the commit selection process
      return selectCommitDiff();
    }
    // If "exit" is selected, the function will simply return
  } catch (error) {
    console.error(chalk.red(`Error: ${error.message}`));
  }
};

/**
 * Function to explain a git diff using Groq LLM
 * @param {string} diff - The git diff to explain
 * @returns {Promise<string>} - The explanation from Groq LLM
 */
async function explainDiffWithGroq(diff) {
  // Check for GROQ_API_KEY in environment variables
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY environment variable is not set");
  }

  // Trim the diff to reduce token count
  const trimmedDiff = trimDiff(diff);

  const groq = new Groq({ apiKey });

  const prompt = `Analyze this git diff concisely:
- What changed?
- Why?
- Impact?

No markdown formatting. Plain text only.

Git diff:
\`\`\`
${trimmedDiff}
\`\`\``;

  const chatCompletion = await groq.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: "gemma2-9b-it",
    max_tokens: 500, // Limit response length
  });

  // Process the response to remove any remaining markdown if needed
  let response = chatCompletion.choices[0].message.content;
  // Remove markdown headings (# Heading)
  response = response.replace(/^#{1,6}\s+/gm, "");
  // Remove bold/italic markers
  response = response.replace(/\*\*/g, "").replace(/\*/g, "");
  // Remove markdown bullet points and replace with plain text
  response = response.replace(/^\s*[-*+]\s+/gm, "- ");

  return response;
}

/**
 * Helper function to trim diff content to reduce token usage
 * @param {string} diff - The original git diff
 * @returns {string} - The trimmed diff
 */
function trimDiff(diff) {
  // Split diff into lines
  const lines = diff.split("\n");

  // If diff is small, return as is
  if (lines.length < 100) return diff;

  // For larger diffs, focus on the most important parts
  const fileHeaders = [];
  const importantChanges = [];

  // Collect file headers and changed lines
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Capture file headers
    if (
      line.startsWith("diff --git") ||
      line.startsWith("+++") ||
      line.startsWith("---")
    ) {
      fileHeaders.push(line);
    }
    // Capture actual code changes (+ or - lines)
    else if (line.startsWith("+") || line.startsWith("-")) {
      // Include a bit of context
      const start = Math.max(0, i - 2);
      const end = Math.min(lines.length, i + 3);
      for (let j = start; j < end; j++) {
        if (!importantChanges.includes(lines[j])) {
          importantChanges.push(lines[j]);
        }
      }
    }
  }

  // Combine file headers with important changes
  const result = [...fileHeaders, "...", ...importantChanges];

  // Deduplicate lines
  return [...new Set(result)].join("\n");
}

/**
 * Helper function to copy text to clipboard using system commands
 * @param {string} text - The text to copy to clipboard
 * @returns {Promise<void>}
 */
function copyToClipboard(text) {
  return new Promise((resolve, reject) => {
    // Create a temporary file with the content
    const tempFile = path.join(os.tmpdir(), `diff-${Date.now()}.txt`);
    fs.writeFileSync(tempFile, text);

    let command;
    if (process.platform === "win32") {
      // Windows
      command = `type "${tempFile}" | clip`;
    } else if (process.platform === "darwin") {
      // macOS
      command = `cat "${tempFile}" | pbcopy`;
    } else {
      // Linux (requires xclip or xsel)
      command = `cat "${tempFile}" | xclip -selection clipboard || cat "${tempFile}" | xsel -i -b`;
    }

    exec(command, (error) => {
      // Clean up the temporary file
      try {
        fs.unlinkSync(tempFile);
      } catch (err) {
        // Ignore cleanup errors
      }

      if (error) {
        reject(new Error(`Failed to copy to clipboard: ${error.message}`));
      } else {
        resolve();
      }
    });
  });
}

export { selectCommitDiff, setupGroqApiKey };
