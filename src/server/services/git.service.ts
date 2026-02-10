import { promises as fs } from 'fs';
import path from 'path';
import { simpleGit } from 'simple-git';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const SERVICE_NAME = 'GitService';

/**
 * Initialize a git repository for a job
 * Creates directory structure, git repo, and initial commit with job metadata
 */
export async function initJobRepo(
  jobId: string,
  jobData: Record<string, unknown>
): Promise<string> {
  const repoPath = path.join(config.git.reposDir, jobId);

  try {
    // Create repository directory
    await fs.mkdir(repoPath, { recursive: true });
    logger.debug(SERVICE_NAME, `Created directory for job ${jobId}`, { repoPath });

    // Initialize git repo
    const git = simpleGit(repoPath);
    await git.init();
    logger.debug(SERVICE_NAME, `Initialized git repo for job ${jobId}`);

    // Write job.json with pretty-printed data
    const jobJsonPath = path.join(repoPath, 'job.json');
    await fs.writeFile(jobJsonPath, JSON.stringify(jobData, null, 2));
    logger.debug(SERVICE_NAME, `Wrote job.json for job ${jobId}`);

    // Write README.md with basic info
    const readmePath = path.join(repoPath, 'README.md');
    const readmeContent = `# Job ${jobId}

## Overview
This repository contains the structure and results for job **${jobId}**.

## Structure
- \`job.json\`: Job metadata and configuration
- \`tasks/\`: Task specifications and results
- \`.git/\`: Git history and version control

## Status
See \`job.json\` for the current job status.
`;
    await fs.writeFile(readmePath, readmeContent);
    logger.debug(SERVICE_NAME, `Wrote README.md for job ${jobId}`);

    // Stage and commit
    await git.add(['.']);
    await git.commit(`Init: Create job structure for ${jobId}`);
    logger.info(SERVICE_NAME, `Initialized job repo for ${jobId}`, { repoPath });

    return repoPath;
  } catch (error) {
    logger.warn(
      SERVICE_NAME,
      `Failed to initialize job repo for ${jobId}`,
      error instanceof Error ? error.message : String(error)
    );
    // Don't throw - git failures shouldn't block the main flow
    return repoPath;
  }
}

/**
 * Commit task specifications to the repository
 * Writes task specs as JSON files and creates a single commit
 */
export async function commitTaskSpecs(
  jobId: string,
  tasks: Array<{
    taskId: string;
    taskIndex: number;
    spec: Record<string, unknown>;
  }>
): Promise<void> {
  const repoPath = path.join(config.git.reposDir, jobId);

  try {
    // Create tasks directory if it doesn't exist
    const tasksDir = path.join(repoPath, 'tasks');
    await fs.mkdir(tasksDir, { recursive: true });

    // Write each task spec
    for (const { taskIndex, spec } of tasks) {
      const taskFilePath = path.join(tasksDir, `task_${taskIndex}.json`);
      await fs.writeFile(taskFilePath, JSON.stringify(spec, null, 2));
      logger.debug(SERVICE_NAME, `Wrote task spec file for job ${jobId}`, {
        taskIndex,
      });
    }

    // Stage and commit all task files
    const git = simpleGit(repoPath);
    await git.add(['tasks/']);
    await git.commit(`Tasks: Add ${tasks.length} task specification${tasks.length !== 1 ? 's' : ''}`);
    logger.info(
      SERVICE_NAME,
      `Committed ${tasks.length} task specification(s) for job ${jobId}`
    );
  } catch (error) {
    logger.warn(
      SERVICE_NAME,
      `Failed to commit task specs for job ${jobId}`,
      error instanceof Error ? error.message : String(error)
    );
    // Don't throw - git failures shouldn't block the main flow
  }
}

/**
 * Commit a single task result to the repository
 * Writes task result as JSON file and creates a commit
 */
export async function commitTaskResult(
  jobId: string,
  taskId: string,
  taskIndex: number,
  agentId: string,
  result: Record<string, unknown>
): Promise<void> {
  const repoPath = path.join(config.git.reposDir, jobId);

  try {
    // Create tasks directory if it doesn't exist
    const tasksDir = path.join(repoPath, 'tasks');
    await fs.mkdir(tasksDir, { recursive: true });

    // Write task result
    const resultFilePath = path.join(tasksDir, `task_${taskIndex}_result.json`);
    await fs.writeFile(resultFilePath, JSON.stringify(result, null, 2));
    logger.debug(SERVICE_NAME, `Wrote task result file for job ${jobId}`, {
      taskIndex,
      agentId,
    });

    // Stage and commit
    const git = simpleGit(repoPath);
    await git.add([`tasks/task_${taskIndex}_result.json`]);
    await git.commit(`Task ${taskIndex}: Completed by ${agentId}`);
    logger.info(
      SERVICE_NAME,
      `Committed task result for job ${jobId}, task ${taskIndex}`
    );
  } catch (error) {
    logger.warn(
      SERVICE_NAME,
      `Failed to commit task result for job ${jobId}, task ${taskIndex}`,
      error instanceof Error ? error.message : String(error)
    );
    // Don't throw - git failures shouldn't block the main flow
  }
}

/**
 * Update and commit job status changes
 * Reads job.json, updates the status field, writes back, and commits
 */
export async function commitJobStatus(
  jobId: string,
  status: string,
  message?: string
): Promise<void> {
  const repoPath = path.join(config.git.reposDir, jobId);

  try {
    // Read current job.json
    const jobJsonPath = path.join(repoPath, 'job.json');
    const jobDataRaw = await fs.readFile(jobJsonPath, 'utf-8');
    const jobData = JSON.parse(jobDataRaw) as Record<string, unknown>;

    // Update status
    jobData.status = status;

    // Write back with pretty printing
    await fs.writeFile(jobJsonPath, JSON.stringify(jobData, null, 2));
    logger.debug(SERVICE_NAME, `Updated job status for ${jobId}`, { status });

    // Stage and commit
    const git = simpleGit(repoPath);
    await git.add(['job.json']);
    const commitMessage = message || `Job: Status changed to ${status}`;
    await git.commit(commitMessage);
    logger.info(
      SERVICE_NAME,
      `Committed job status update for ${jobId}`,
      { status }
    );
  } catch (error) {
    logger.warn(
      SERVICE_NAME,
      `Failed to commit job status for ${jobId}`,
      error instanceof Error ? error.message : String(error)
    );
    // Don't throw - git failures shouldn't block the main flow
  }
}
