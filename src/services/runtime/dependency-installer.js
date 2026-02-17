import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { getEngineRoot } from "../paths.js";

const installLocks = new Map();

const npmCommand = () => (process.platform === "win32" ? "npm.cmd" : "npm");

const dependencyPath = (dependency) => {
  const parts = String(dependency || "").split("/").filter(Boolean);
  return path.join(getEngineRoot(), "node_modules", ...parts);
};

export const isDependencyInstalled = (dependency) => {
  if (!dependency) return false;
  const dir = dependencyPath(dependency);
  return fs.existsSync(dir);
};

export const isModuleNotFoundError = (error, dependency) => {
  if (!error) return false;
  const code = String(error.code || "");
  const text = `${error.message || ""} ${error.stack || ""}`;
  const name = String(dependency || "");
  if (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") return true;
  if (!name) return false;
  return text.includes(`Cannot find package '${name}'`) || text.includes(`Cannot find module '${name}'`);
};

const runNpmInstall = (packages = []) => {
  const appDir = getEngineRoot();
  const cmd = npmCommand();
  const args = ["install", "--no-audit", "--no-fund", "--no-save", ...packages];
  const env = {
    ...process.env,
    NPM_CONFIG_AUDIT: "false",
    NPM_CONFIG_FUND: "false",
    NPM_CONFIG_OFFLINE: "false",
    NPM_CONFIG_PREFER_ONLINE: "true"
  };

  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: appDir,
      windowsHide: true,
      env
    });

    let stderr = "";
    let stdout = "";

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk || "");
    });

    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk || "");
    });

    child.on("error", (err) => {
      resolve({
        success: false,
        error: err.message || String(err || "Failed to run npm install")
      });
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ success: true });
        return;
      }
      const errText = (stderr || stdout || "").trim();
      resolve({
        success: false,
        error: errText || `${cmd} exited with code ${code}`
      });
    });
  });
};

export const ensureRuntimeDependency = async (dependency) => {
  const name = String(dependency || "").trim();
  if (!name) {
    return { success: false, error: "dependency name is required" };
  }

  if (isDependencyInstalled(name)) {
    return { success: true, installed: false, dependency: name };
  }

  if (installLocks.has(name)) {
    return installLocks.get(name);
  }

  const promise = (async () => {
    const install = await runNpmInstall([name]);
    if (!install.success) {
      return {
        success: false,
        dependency: name,
        error: install.error
      };
    }

    if (!isDependencyInstalled(name)) {
      return {
        success: false,
        dependency: name,
        error: `Dependency still missing after install: ${name}`
      };
    }

    return { success: true, installed: true, dependency: name };
  })();

  installLocks.set(name, promise);
  try {
    return await promise;
  } finally {
    installLocks.delete(name);
  }
};

export const ensureRuntimeDependencies = async (dependencies = []) => {
  const unique = [...new Set((dependencies || []).map((d) => String(d || "").trim()).filter(Boolean))];
  const results = [];
  for (const dep of unique) {
    // Keep sequential to avoid npm lock contention.
    results.push(await ensureRuntimeDependency(dep));
  }

  const failed = results.filter((r) => !r.success);
  return {
    success: failed.length === 0,
    results,
    failed
  };
};
