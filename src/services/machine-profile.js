/**
 * Machine Profile Service
 *
 * Discovers what software and runtimes exist on the user's machine, then
 * builds an execution plan for a given goal/request.
 */

import fs from "fs";
import path from "path";
import os from "os";
import { exec } from "child_process";
import { promisify } from "util";

import { getDataDir } from "./paths.js";

const execAsync = promisify(exec);
const DATA_DIR = getDataDir();
const MACHINE_PROFILE_PATH = path.join(DATA_DIR, "machine-profile.json");
const PROFILE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const WINDOWS_POWERSHELL_PATH = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";

const WIN_PROGRAM_FILES = process.env.ProgramFiles || "C:\\Program Files";
const WIN_PROGRAM_FILES_X86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
const WIN_LOCAL_APP_DATA = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");

const WINDOWS_APP_PATHS = {
  browsers: {
    chrome: [
      path.join(WIN_PROGRAM_FILES, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(WIN_PROGRAM_FILES_X86, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(WIN_LOCAL_APP_DATA, "Google", "Chrome", "Application", "chrome.exe")
    ],
    edge: [
      path.join(WIN_PROGRAM_FILES, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(WIN_PROGRAM_FILES_X86, "Microsoft", "Edge", "Application", "msedge.exe")
    ],
    firefox: [
      path.join(WIN_PROGRAM_FILES, "Mozilla Firefox", "firefox.exe"),
      path.join(WIN_PROGRAM_FILES_X86, "Mozilla Firefox", "firefox.exe")
    ]
  },
  office: {
    word: [
      path.join(WIN_PROGRAM_FILES, "Microsoft Office", "root", "Office16", "WINWORD.EXE"),
      path.join(WIN_PROGRAM_FILES_X86, "Microsoft Office", "root", "Office16", "WINWORD.EXE")
    ],
    excel: [
      path.join(WIN_PROGRAM_FILES, "Microsoft Office", "root", "Office16", "EXCEL.EXE"),
      path.join(WIN_PROGRAM_FILES_X86, "Microsoft Office", "root", "Office16", "EXCEL.EXE")
    ],
    powerpoint: [
      path.join(WIN_PROGRAM_FILES, "Microsoft Office", "root", "Office16", "POWERPNT.EXE"),
      path.join(WIN_PROGRAM_FILES_X86, "Microsoft Office", "root", "Office16", "POWERPNT.EXE")
    ]
  },
  cad: {
    freecad: [
      path.join(WIN_PROGRAM_FILES, "FreeCAD 1.0", "bin", "FreeCAD.exe"),
      path.join(WIN_PROGRAM_FILES, "FreeCAD 0.22", "bin", "FreeCAD.exe"),
      path.join(WIN_PROGRAM_FILES_X86, "FreeCAD 0.22", "bin", "FreeCAD.exe")
    ],
    blender: [
      path.join(WIN_PROGRAM_FILES, "Blender Foundation", "Blender", "blender.exe")
    ]
  }
};

const ensureDataDir = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
};

const readJsonSafe = (filePath, fallback = null) => {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch {}
  return fallback;
};

const writeJsonSafe = (filePath, payload) => {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
    return true;
  } catch {
    return false;
  }
};

const pathExists = (candidatePath) => {
  try {
    return !!candidatePath && fs.existsSync(candidatePath);
  } catch {
    return false;
  }
};

const firstExistingPath = (paths = []) => {
  for (const p of paths) {
    if (pathExists(p)) return p;
  }
  return null;
};

const nowIso = () => new Date().toISOString();

const platformIsWindows = () => process.platform === "win32";

const commandCheck = async (commandName) => {
  const checkCmd = platformIsWindows()
    ? `where ${commandName}`
    : `command -v ${commandName}`;

  try {
    const { stdout } = await execAsync(checkCmd, {
      timeout: 4000,
      windowsHide: true
    });
    return {
      installed: true,
      path: (stdout || "").trim().split(/\r?\n/)[0] || null
    };
  } catch {
    return { installed: false, path: null };
  }
};

const commandVersion = async (command, args = "--version") => {
  try {
    const { stdout, stderr } = await execAsync(`${command} ${args}`, {
      timeout: 6000,
      windowsHide: true
    });
    return (stdout || stderr || "").trim().split(/\r?\n/)[0] || null;
  } catch {
    return null;
  }
};

const discoverAutoCadPaths = () => {
  const discovered = [];
  const roots = [
    path.join(WIN_PROGRAM_FILES, "Autodesk"),
    path.join(WIN_PROGRAM_FILES_X86, "Autodesk")
  ];

  for (const root of roots) {
    if (!pathExists(root)) continue;
    let dirs = [];
    try {
      dirs = fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    } catch {
      continue;
    }

    for (const dir of dirs) {
      const base = path.join(root, dir.name);
      const candidates = [
        path.join(base, "acad.exe"),
        path.join(base, "acadlt.exe"),
        path.join(base, "acadlt", "acadlt.exe"),
        path.join(base, "Civil 3D", "acad.exe")
      ];
      const hit = firstExistingPath(candidates);
      if (hit) {
        discovered.push(hit);
      }
    }
  }

  return discovered;
};

const summarizeApps = (appMap = {}) =>
  Object.entries(appMap)
    .filter(([, value]) => value?.installed)
    .map(([id, value]) => ({
      id,
      installed: true,
      path: value.path || null
    }));

async function discoverMachineProfileInternal() {
  const base = {
    discoveredAt: nowIso(),
    system: {
      platform: process.platform,
      release: os.release(),
      arch: process.arch,
      hostname: os.hostname(),
      cpus: os.cpus()?.length || 0,
      totalMemoryGb: Number((os.totalmem() / (1024 ** 3)).toFixed(2))
    },
    runtimes: {},
    packageManagers: {},
    browsers: [],
    officeApps: [],
    cadApps: [],
    capabilities: {},
    notes: []
  };

  const commandChecks = await Promise.all([
    commandCheck("node"),
    commandCheck("npm"),
    commandCheck("python"),
    commandCheck("pip"),
    commandCheck("git"),
    commandCheck("powershell"),
    commandCheck("winget"),
    commandCheck("choco")
  ]);

  const [nodeCmd, npmCmd, pythonCmd, pipCmd, gitCmd, psCmd, wingetCmd, chocoCmd] = commandChecks;

  const hasWindowsPowerShellBinary = platformIsWindows() && pathExists(WINDOWS_POWERSHELL_PATH);
  const powershellInstalled = psCmd.installed || hasWindowsPowerShellBinary;
  const powershellVersion = powershellInstalled
    ? (await commandVersion("powershell", "-Command \"$PSVersionTable.PSVersion.ToString()\""))
      || (hasWindowsPowerShellBinary ? await commandVersion(`"${WINDOWS_POWERSHELL_PATH}"`, "-Command \"$PSVersionTable.PSVersion.ToString()\"") : null)
    : null;

  base.runtimes = {
    node: {
      installed: nodeCmd.installed,
      path: nodeCmd.path,
      version: nodeCmd.installed ? await commandVersion("node", "--version") : null
    },
    python: {
      installed: pythonCmd.installed,
      path: pythonCmd.path,
      version: pythonCmd.installed ? await commandVersion("python", "--version") : null
    },
    git: {
      installed: gitCmd.installed,
      path: gitCmd.path,
      version: gitCmd.installed ? await commandVersion("git", "--version") : null
    },
    powershell: {
      installed: powershellInstalled,
      path: psCmd.path || (hasWindowsPowerShellBinary ? WINDOWS_POWERSHELL_PATH : null),
      version: powershellVersion
    }
  };

  base.packageManagers = {
    npm: { installed: npmCmd.installed, path: npmCmd.path },
    pip: { installed: pipCmd.installed, path: pipCmd.path },
    winget: { installed: wingetCmd.installed, path: wingetCmd.path },
    choco: { installed: chocoCmd.installed, path: chocoCmd.path }
  };

  if (platformIsWindows()) {
    const browserInstall = {
      chrome: { installed: false, path: null },
      edge: { installed: false, path: null },
      firefox: { installed: false, path: null }
    };
    for (const [browserId, paths] of Object.entries(WINDOWS_APP_PATHS.browsers)) {
      const hit = firstExistingPath(paths);
      browserInstall[browserId] = { installed: !!hit, path: hit };
    }
    base.browsers = summarizeApps(browserInstall);

    const officeInstall = {
      word: { installed: false, path: null },
      excel: { installed: false, path: null },
      powerpoint: { installed: false, path: null }
    };
    for (const [appId, paths] of Object.entries(WINDOWS_APP_PATHS.office)) {
      const hit = firstExistingPath(paths);
      officeInstall[appId] = { installed: !!hit, path: hit };
    }
    base.officeApps = summarizeApps(officeInstall);

    const cadInstall = {
      autocad: { installed: false, path: null },
      freecad: { installed: false, path: null },
      blender: { installed: false, path: null }
    };

    const autoCadPaths = discoverAutoCadPaths();
    if (autoCadPaths.length > 0) {
      cadInstall.autocad = { installed: true, path: autoCadPaths[0] };
    }
    cadInstall.freecad = {
      installed: !!firstExistingPath(WINDOWS_APP_PATHS.cad.freecad),
      path: firstExistingPath(WINDOWS_APP_PATHS.cad.freecad)
    };
    cadInstall.blender = {
      installed: !!firstExistingPath(WINDOWS_APP_PATHS.cad.blender),
      path: firstExistingPath(WINDOWS_APP_PATHS.cad.blender)
    };
    base.cadApps = summarizeApps(cadInstall);
  } else {
    // Lightweight non-Windows checks via PATH.
    const nonWinBrowsers = await Promise.all([commandCheck("google-chrome"), commandCheck("firefox")]);
    const nonWinOffice = await Promise.all([commandCheck("soffice"), commandCheck("libreoffice")]);
    const nonWinCad = await Promise.all([commandCheck("freecad"), commandCheck("blender")]);

    base.browsers = [
      { id: "chrome", installed: nonWinBrowsers[0].installed, path: nonWinBrowsers[0].path },
      { id: "firefox", installed: nonWinBrowsers[1].installed, path: nonWinBrowsers[1].path }
    ].filter((app) => app.installed);

    base.officeApps = [
      { id: "libreoffice", installed: nonWinOffice[0].installed || nonWinOffice[1].installed, path: nonWinOffice[0].path || nonWinOffice[1].path }
    ].filter((app) => app.installed);

    base.cadApps = [
      { id: "freecad", installed: nonWinCad[0].installed, path: nonWinCad[0].path },
      { id: "blender", installed: nonWinCad[1].installed, path: nonWinCad[1].path }
    ].filter((app) => app.installed);
  }

  base.capabilities = {
    invocationMode: base.system.platform === "win32" ? "local-machine" : "local-machine-limited",
    canUseBrowser: base.browsers.length > 0,
    canUseOfficeApps: base.officeApps.length > 0,
    canUseCadApps: base.cadApps.length > 0,
    canInstallSoftware: !!(base.packageManagers.winget?.installed || base.packageManagers.choco?.installed || base.packageManagers.npm?.installed),
    canAutomateDesktop: base.system.platform === "win32" && base.runtimes.powershell?.installed
  };

  if (!base.capabilities.canAutomateDesktop) {
    base.notes.push("Desktop automation runtime is limited. Install or enable PowerShell automation support.");
  }
  if (!base.capabilities.canUseCadApps) {
    base.notes.push("No CAD app detected. CAD requests may require install or generated fallback tooling.");
  }

  return base;
}

class MachineProfileManager {
  loadProfile() {
    return readJsonSafe(MACHINE_PROFILE_PATH, null);
  }

  async discoverProfile({ forceRefresh = false, maxAgeMs = PROFILE_MAX_AGE_MS } = {}) {
    ensureDataDir();
    if (!forceRefresh) {
      const cached = this.loadProfile();
      if (cached?.discoveredAt) {
        const age = Date.now() - new Date(cached.discoveredAt).getTime();
        if (Number.isFinite(age) && age < maxAgeMs) {
          return cached;
        }
      }
    }

    const profile = await discoverMachineProfileInternal();
    writeJsonSafe(MACHINE_PROFILE_PATH, profile);
    return profile;
  }

  summarizeProfile(profile) {
    if (!profile) return "No machine profile available";
    const browsers = (profile.browsers || []).map((b) => b.id).join(", ") || "none";
    const office = (profile.officeApps || []).map((o) => o.id).join(", ") || "none";
    const cad = (profile.cadApps || []).map((c) => c.id).join(", ") || "none";
    return `platform=${profile.system?.platform || "unknown"} browsers=${browsers} office=${office} cad=${cad}`;
  }

  planForRequest({ message, analysis, capabilityIds = [], machineProfile = null } = {}) {
    const profile = machineProfile || this.loadProfile();
    const text = `${message || ""} ${analysis?.summary || ""}`.toLowerCase();

    const decisions = {};
    const plan = {
      generatedAt: nowIso(),
      strategy: "invoke_local_machine_first",
      summary: "",
      decisions,
      installCandidates: [],
      buildFallbacks: [],
      notes: []
    };

    for (const capabilityId of capabilityIds) {
      if (capabilityId === "voice_reservation") {
        decisions[capabilityId] = {
          mode: "use_installed",
          reason: "Use local voice calling integration first, then fallback tooling if needed."
        };
        continue;
      }

      if (capabilityId === "desktop_automation") {
        const hasOffice = !!profile?.capabilities?.canUseOfficeApps;
        const canAutomateDesktop = !!profile?.capabilities?.canAutomateDesktop;
        decisions[capabilityId] = canAutomateDesktop
          ? {
              mode: "use_installed",
              reason: hasOffice
                ? "Office apps and desktop runtime are available. Invoke local apps directly."
                : "Desktop runtime available. Invoke local browser/app workflows first."
            }
          : {
              mode: "scaffold",
              reason: "Desktop automation runtime not detected. Scaffold bridge and fallback tools."
            };
        continue;
      }

      if (capabilityId === "cad_design") {
        const hasCad = !!profile?.capabilities?.canUseCadApps;
        const canInstall = !!profile?.capabilities?.canInstallSoftware;
        if (hasCad) {
          decisions[capabilityId] = {
            mode: "use_installed",
            reason: "CAD software already installed. Use native CAD workflow."
          };
        } else if (canInstall) {
          decisions[capabilityId] = {
            mode: "install_then_use",
            reason: "No CAD app detected. Install FreeCAD or equivalent before execution."
          };
          plan.installCandidates.push("FreeCAD");
        } else {
          decisions[capabilityId] = {
            mode: "scaffold",
            reason: "No CAD app and no installer detected. Build fallback CAD generation tools."
          };
          plan.buildFallbacks.push("user-cad-automation");
        }
      }
    }

    const asksForOffice = /word|excel|powerpoint|spreadsheet|document/.test(text);
    if (asksForOffice && !profile?.capabilities?.canUseOfficeApps) {
      plan.notes.push("Office apps not detected. Use generated document pipeline (docx/exceljs/pptxgenjs) fallback.");
    }

    plan.summary = this.summarizePlan(plan, profile);
    return plan;
  }

  summarizePlan(plan, profile) {
    const decisionSummary = Object.entries(plan.decisions || {})
      .map(([id, decision]) => `${id}:${decision.mode}`)
      .join(", ") || "no capability decisions";

    return [
      `machine=${this.summarizeProfile(profile)}`,
      `decisions=${decisionSummary}`,
      plan.installCandidates.length > 0 ? `install=${plan.installCandidates.join("|")}` : null,
      plan.buildFallbacks.length > 0 ? `fallback=${plan.buildFallbacks.join("|")}` : null
    ].filter(Boolean).join(" ; ");
  }
}

let managerInstance = null;

export function getMachineProfileManager() {
  if (!managerInstance) {
    managerInstance = new MachineProfileManager();
  }
  return managerInstance;
}

export default {
  getMachineProfileManager
};
