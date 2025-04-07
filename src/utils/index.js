import { execSync } from "child_process";

/**
 * Executes a git command and returns the output
 * @param {string} command - The git command to execute
 * @returns {string} - Command output
 */
const executeGitCommand = (command) => {
  try {
    return execSync(command, { encoding: "utf-8" }).trim();
  } catch (error) {
    throw new Error(`Git command failed: ${error.message}`);
  }
};

/**
 * Fetches git commit history
 * @param {number} limit - Number of commits to fetch
 * @returns {Array} - Array of commit objects
 */
const getCommitHistory = (limit = 10) => {
  const format = '--pretty=format:"%h|%s|%an|%ad"';
  const command = `git log ${format} -n ${limit}`;

  const output = executeGitCommand(command);

  return output.split("\n").map((line) => {
    const [hash, subject, author, date] = line.replace(/"/g, "").split("|");
    return { hash, subject, author, date };
  });
};

/**
 * Gets diff for a specific commit
 * @param {string} commitHash - The commit hash
 * @returns {string} - The diff content
 */
const getCommitDiff = (commitHash) => {
  const command = `git show ${commitHash}`;
  return executeGitCommand(command);
};

/**
 * Checks if the current directory is a git repository
 * @returns {boolean} - True if it's a git repo
 */
const isGitRepository = () => {
  try {
    // Redirect stderr to suppress error messages
    const command =
      process.platform === "win32"
        ? "git rev-parse --is-inside-work-tree 2>NUL"
        : "git rev-parse --is-inside-work-tree 2>/dev/null";

    executeGitCommand(command);
    return true;
  } catch (error) {
    return false;
  }
};

export { executeGitCommand, getCommitHistory, getCommitDiff, isGitRepository };
