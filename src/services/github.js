import fetch from "node-fetch";
import { spawn } from "child_process";

/**
 * GitHub Integration Service for BACKBONE
 * Manages private repo for code backup and version control
 */

export const getGitHubConfig = () => {
  return {
    accessToken: process.env.GITHUB_ACCESS_TOKEN,
    username: process.env.GITHUB_USERNAME,
    repoName: process.env.GITHUB_REPO_NAME || "backbone-private",
    repoVisibility: process.env.GITHUB_REPO_VISIBILITY || "private",
    ready: Boolean(process.env.GITHUB_ACCESS_TOKEN)
  };
};

const buildHeaders = (config) => ({
  Authorization: `token ${config.accessToken}`,
  Accept: "application/vnd.github.v3+json",
  "User-Agent": "BACKBONE/2.0"
});

/**
 * Fetch authenticated user info
 */
export const fetchUser = async (config) => {
  if (!config.ready) return null;

  try {
    const response = await fetch("https://api.github.com/user", {
      headers: buildHeaders(config)
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    console.error("GitHub user fetch failed:", error.message);
    return null;
  }
};

/**
 * Create a new private repository
 */
export const createRepository = async (config, name, description) => {
  if (!config.ready) {
    return { success: false, error: "GitHub not configured" };
  }

  try {
    const response = await fetch("https://api.github.com/user/repos", {
      method: "POST",
      headers: buildHeaders(config),
      body: JSON.stringify({
        name: name || config.repoName,
        description: description || "BACKBONE private configuration and memory",
        private: config.repoVisibility === "private",
        auto_init: true
      })
    });

    if (!response.ok) {
      const error = await response.json();
      if (error.errors?.[0]?.message?.includes("already exists")) {
        return { success: true, exists: true, message: "Repository already exists" };
      }
      throw new Error(error.message || `GitHub API error: ${response.status}`);
    }

    const repo = await response.json();
    return {
      success: true,
      repo: {
        name: repo.name,
        fullName: repo.full_name,
        url: repo.html_url,
        cloneUrl: repo.clone_url,
        sshUrl: repo.ssh_url,
        private: repo.private
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Check if repository exists
 */
export const checkRepository = async (config, repoName) => {
  if (!config.ready) return null;

  try {
    const user = await fetchUser(config);
    if (!user) return null;

    const response = await fetch(`https://api.github.com/repos/${user.login}/${repoName || config.repoName}`, {
      headers: buildHeaders(config)
    });

    if (response.status === 404) {
      return { exists: false };
    }

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const repo = await response.json();
    return {
      exists: true,
      repo: {
        name: repo.name,
        fullName: repo.full_name,
        url: repo.html_url,
        cloneUrl: repo.clone_url,
        private: repo.private
      }
    };
  } catch (error) {
    console.error("GitHub repo check failed:", error.message);
    return null;
  }
};

/**
 * Execute git command
 */
const execGit = (args, cwd) => {
  return new Promise((resolve, reject) => {
    const git = spawn("git", args, { cwd, shell: true });

    let stdout = "";
    let stderr = "";

    git.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    git.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    git.on("close", (code) => {
      if (code === 0) {
        resolve({ success: true, output: stdout.trim() });
      } else {
        resolve({ success: false, error: stderr.trim() || stdout.trim() });
      }
    });

    git.on("error", (err) => {
      reject(err);
    });
  });
};

/**
 * Initialize git repository in directory
 */
export const initRepository = async (workDir) => {
  try {
    // Check if already initialized
    const statusResult = await execGit(["status"], workDir);
    if (statusResult.success) {
      return { success: true, message: "Repository already initialized" };
    }

    // Initialize new repo
    const initResult = await execGit(["init"], workDir);
    return initResult;
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Set up remote origin
 */
export const setRemote = async (config, workDir) => {
  if (!config.ready) {
    return { success: false, error: "GitHub not configured" };
  }

  try {
    const user = await fetchUser(config);
    if (!user) {
      return { success: false, error: "Could not fetch GitHub user" };
    }

    const remoteUrl = `https://${config.accessToken}@github.com/${user.login}/${config.repoName}.git`;

    // Remove existing origin if present
    await execGit(["remote", "remove", "origin"], workDir);

    // Add new origin
    const result = await execGit(["remote", "add", "origin", remoteUrl], workDir);

    return result.success
      ? { success: true, remote: `https://github.com/${user.login}/${config.repoName}` }
      : result;
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Commit and push changes
 */
export const commitAndPush = async (workDir, message = "BACKBONE auto-sync") => {
  try {
    // Stage all changes
    const addResult = await execGit(["add", "-A"], workDir);
    if (!addResult.success) {
      return addResult;
    }

    // Check if there are changes to commit
    const statusResult = await execGit(["status", "--porcelain"], workDir);
    if (!statusResult.output) {
      return { success: true, message: "No changes to commit" };
    }

    // Commit
    const commitResult = await execGit(
      ["commit", "-m", `"${message} - ${new Date().toISOString()}"`],
      workDir
    );
    if (!commitResult.success) {
      return commitResult;
    }

    // Push
    const pushResult = await execGit(["push", "-u", "origin", "main"], workDir);

    return pushResult.success
      ? { success: true, message: "Changes pushed successfully" }
      : pushResult;
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Full setup: create repo, init, set remote, initial commit
 */
export const setupPrivateRepo = async (config, workDir) => {
  if (!config.ready) {
    return { success: false, error: "GitHub not configured" };
  }

  const steps = [];

  // 1. Create repository on GitHub
  const createResult = await createRepository(config);
  steps.push({ step: "create_repo", ...createResult });
  if (!createResult.success && !createResult.exists) {
    return { success: false, steps, error: "Failed to create repository" };
  }

  // 2. Initialize local git
  const initResult = await initRepository(workDir);
  steps.push({ step: "init_local", ...initResult });

  // 3. Set remote
  const remoteResult = await setRemote(config, workDir);
  steps.push({ step: "set_remote", ...remoteResult });
  if (!remoteResult.success) {
    return { success: false, steps, error: "Failed to set remote" };
  }

  // 4. Create .gitignore if not exists
  const fs = await import("fs");
  const path = await import("path");
  const gitignorePath = path.join(workDir, ".gitignore");

  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(
      gitignorePath,
      `# BACKBONE gitignore
node_modules/
.env
*.log
.DS_Store
`
    );
    steps.push({ step: "create_gitignore", success: true });
  }

  // 5. Initial commit and push
  const pushResult = await commitAndPush(workDir, "Initial BACKBONE setup");
  steps.push({ step: "initial_push", ...pushResult });

  return {
    success: pushResult.success,
    steps,
    repoUrl: remoteResult.remote
  };
};

/**
 * Get GitHub status
 */
export const getGitHubStatus = async () => {
  const config = getGitHubConfig();

  if (!config.ready) {
    return {
      connected: false,
      status: "Not configured",
      message: "Add GITHUB_ACCESS_TOKEN to .env"
    };
  }

  const user = await fetchUser(config);
  if (!user) {
    return {
      connected: false,
      status: "Invalid token",
      message: "GitHub access token is invalid"
    };
  }

  const repoCheck = await checkRepository(config);

  return {
    connected: true,
    user: user.login,
    avatarUrl: user.avatar_url,
    repoExists: repoCheck?.exists || false,
    repoUrl: repoCheck?.repo?.url || null,
    status: repoCheck?.exists ? "Repository ready" : "Repository not created"
  };
};
