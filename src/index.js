console.log("Welcome to the dfx CLI tool!");

import { Command } from "commander";
import { selectCommitDiff } from "./commands/index.js";

const program = new Command();

const run = (argv) => {
  program
    .name("dfx")
    .description("A command-line interface tool for various tasks")
    .version("1.0.0");

  // Add your commands here
  program
    .command("hello")
    .description("Say hello")
    .action(() => {
      console.log("Hello, world! not");
    });

  program
    .command("git-diff")
    .description("Select a commit and view its diff")
    .action(selectCommitDiff);

  program.parse(argv);
};

export { run };
