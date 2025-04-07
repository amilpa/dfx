import inquirer from "inquirer";
import chalk from "chalk";
import {
  getCommitHistory,
  getCommitDiff,
  isGitRepository,
} from "../utils/index.js";

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

  try {
    // Get commit history
    const commits = getCommitHistory(20);

    // added new comment for testing

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

    // Additional options menu
    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "What would you like to do?",
        choices: [
          { name: "Save diff to file", value: "save" },
          { name: "Copy to clipboard", value: "copy" },
          { name: "Exit", value: "exit" },
        ],
      },
    ]);

    if (action === "save") {
      // Implement save to file functionality
      const { filename } = await inquirer.prompt([
        {
          type: "input",
          name: "filename",
          message: "Enter filename to save diff:",
          default: `diff-${selectedCommit}.patch`,
        },
      ]);

      const fs = require("fs");
      fs.writeFileSync(filename, diff);
      console.log(chalk.green(`Diff saved to ${filename}`));
    } else if (action === "copy") {
      // Implement clipboard functionality if available
      console.log(
        chalk.yellow(
          "Copy to clipboard functionality requires additional dependencies."
        )
      );
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error.message}`));
  }
};

export { selectCommitDiff };
