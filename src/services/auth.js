/**
 * Authentication Service
 *
 * Handles user authentication for BACKBONE:
 * - Local authentication (email/password)
 * - Firebase authentication (optional)
 * - Session management
 * - User profile management
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";

import { getDataDir } from "./paths.js";
const DATA_DIR = getDataDir();
const AUTH_PATH = path.join(DATA_DIR, "auth.json");
const USERS_PATH = path.join(DATA_DIR, "users.json");
const SESSIONS_PATH = path.join(DATA_DIR, "sessions.json");

// Lazy load bcrypt for password hashing
let bcrypt = null;
const getBcrypt = async () => {
  if (bcrypt === null) {
    try {
      const module = await import("bcrypt");
      bcrypt = module.default || module;
    } catch (err) {
      // Fallback to crypto for hashing if bcrypt not available
      bcrypt = {
        hash: async (password, rounds) => {
          return crypto.createHash("sha256").update(password + rounds).digest("hex");
        },
        compare: async (password, hash) => {
          const computed = crypto.createHash("sha256").update(password + "10").digest("hex");
          return computed === hash;
        }
      };
    }
  }
  return bcrypt;
};

/**
 * Authentication states
 */
export const AUTH_STATE = {
  LOGGED_OUT: "logged_out",
  LOGGED_IN: "logged_in",
  PENDING_VERIFICATION: "pending_verification",
  LOCKED: "locked"
};

/**
 * Ensure data directory exists
 */
const ensureDataDir = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
};

/**
 * Load authentication state
 */
export const loadAuthState = () => {
  try {
    ensureDataDir();
    if (fs.existsSync(AUTH_PATH)) {
      return JSON.parse(fs.readFileSync(AUTH_PATH, "utf-8"));
    }
  } catch (error) {
    console.error("[Auth] Error loading state:", error.message);
  }
  return {
    state: AUTH_STATE.LOGGED_OUT,
    currentUser: null,
    lastLogin: null,
    requiresAuth: false,
    sessionToken: null
  };
};

/**
 * Save authentication state
 */
const saveAuthState = (state) => {
  try {
    ensureDataDir();
    fs.writeFileSync(AUTH_PATH, JSON.stringify(state, null, 2));
    return true;
  } catch (error) {
    console.error("[Auth] Error saving state:", error.message);
    return false;
  }
};

/**
 * Load users database
 */
const loadUsers = () => {
  try {
    ensureDataDir();
    if (fs.existsSync(USERS_PATH)) {
      return JSON.parse(fs.readFileSync(USERS_PATH, "utf-8"));
    }
  } catch (error) {
    console.error("[Auth] Error loading users:", error.message);
  }
  return { users: [], lastUpdated: null };
};

/**
 * Save users database
 */
const saveUsers = (data) => {
  try {
    ensureDataDir();
    data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(USERS_PATH, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error("[Auth] Error saving users:", error.message);
    return false;
  }
};

/**
 * Load sessions
 */
const loadSessions = () => {
  try {
    ensureDataDir();
    if (fs.existsSync(SESSIONS_PATH)) {
      const data = JSON.parse(fs.readFileSync(SESSIONS_PATH, "utf-8"));
      // Clean expired sessions
      const now = Date.now();
      data.sessions = data.sessions.filter(s => new Date(s.expiresAt).getTime() > now);
      saveSessions(data);
      return data;
    }
  } catch (error) {
    console.error("[Auth] Error loading sessions:", error.message);
  }
  return { sessions: [] };
};

/**
 * Save sessions
 */
const saveSessions = (data) => {
  try {
    ensureDataDir();
    fs.writeFileSync(SESSIONS_PATH, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error("[Auth] Error saving sessions:", error.message);
    return false;
  }
};

/**
 * Generate a secure session token
 */
const generateSessionToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

/**
 * Generate user ID
 */
const generateUserId = () => {
  return `user_${crypto.randomBytes(8).toString("hex")}`;
};

/**
 * Register a new user
 */
export const registerUser = async (email, password, displayName = "") => {
  const hasher = await getBcrypt();
  const users = loadUsers();

  // Check if email already exists
  if (users.users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    return { success: false, error: "Email already registered" };
  }

  // Validate email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { success: false, error: "Invalid email format" };
  }

  // Validate password (minimum 8 characters)
  if (password.length < 8) {
    return { success: false, error: "Password must be at least 8 characters" };
  }

  // Hash password
  const passwordHash = await hasher.hash(password, 10);

  // Create user
  const user = {
    id: generateUserId(),
    email: email.toLowerCase(),
    displayName: displayName || email.split("@")[0],
    passwordHash,
    createdAt: new Date().toISOString(),
    lastLogin: null,
    verified: false,
    role: users.users.length === 0 ? "admin" : "user", // First user is admin
    settings: {
      notifications: true,
      theme: "dark",
      twoFactorEnabled: false
    }
  };

  users.users.push(user);
  saveUsers(users);

  console.log(`[Auth] User registered: ${email}`);
  return {
    success: true,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role
    }
  };
};

/**
 * Login user
 */
export const login = async (email, password) => {
  const hasher = await getBcrypt();
  const users = loadUsers();

  // Find user
  const user = users.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    return { success: false, error: "Invalid email or password" };
  }

  // Check password
  const isValid = await hasher.compare(password, user.passwordHash);
  if (!isValid) {
    return { success: false, error: "Invalid email or password" };
  }

  // Generate session
  const sessionToken = generateSessionToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // Save session
  const sessions = loadSessions();
  sessions.sessions.push({
    token: sessionToken,
    userId: user.id,
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
    device: "BACKBONE CLI"
  });
  saveSessions(sessions);

  // Update user last login
  user.lastLogin = new Date().toISOString();
  saveUsers(users);

  // Update auth state
  const authState = {
    state: AUTH_STATE.LOGGED_IN,
    currentUser: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role
    },
    lastLogin: user.lastLogin,
    requiresAuth: true,
    sessionToken
  };
  saveAuthState(authState);

  console.log(`[Auth] User logged in: ${email}`);
  return {
    success: true,
    user: authState.currentUser,
    sessionToken,
    expiresAt: expiresAt.toISOString()
  };
};

/**
 * Logout current user
 */
export const logout = () => {
  const authState = loadAuthState();

  // Remove session
  if (authState.sessionToken) {
    const sessions = loadSessions();
    sessions.sessions = sessions.sessions.filter(s => s.token !== authState.sessionToken);
    saveSessions(sessions);
  }

  // Update auth state
  saveAuthState({
    state: AUTH_STATE.LOGGED_OUT,
    currentUser: null,
    lastLogin: authState.lastLogin,
    requiresAuth: authState.requiresAuth,
    sessionToken: null
  });

  console.log("[Auth] User logged out");
  return { success: true };
};

/**
 * Validate session token
 */
export const validateSession = (token) => {
  if (!token) return null;

  const sessions = loadSessions();
  const session = sessions.sessions.find(s => s.token === token);

  if (!session) return null;

  // Check expiration
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    // Remove expired session
    sessions.sessions = sessions.sessions.filter(s => s.token !== token);
    saveSessions(sessions);
    return null;
  }

  // Get user
  const users = loadUsers();
  const user = users.users.find(u => u.id === session.userId);

  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role
  };
};

/**
 * Check if user is authenticated
 */
export const isAuthenticated = () => {
  const authState = loadAuthState();

  // If auth is not required, always return true
  if (!authState.requiresAuth) {
    return true;
  }

  // Validate current session
  if (authState.sessionToken) {
    const user = validateSession(authState.sessionToken);
    if (user) {
      return true;
    }
  }

  return false;
};

/**
 * Get current user
 */
export const getCurrentUser = () => {
  const authState = loadAuthState();

  if (!authState.sessionToken) {
    return null;
  }

  return validateSession(authState.sessionToken);
};

/**
 * Enable/disable authentication requirement
 */
export const setRequiresAuth = (requires) => {
  const authState = loadAuthState();
  authState.requiresAuth = requires;
  saveAuthState(authState);
  return { success: true, requiresAuth: requires };
};

/**
 * Update user profile
 */
export const updateProfile = (userId, updates) => {
  const users = loadUsers();
  const userIndex = users.users.findIndex(u => u.id === userId);

  if (userIndex === -1) {
    return { success: false, error: "User not found" };
  }

  // Allow updating displayName and settings only
  const allowedFields = ["displayName", "settings"];
  Object.keys(updates).forEach(key => {
    if (allowedFields.includes(key)) {
      users.users[userIndex][key] = updates[key];
    }
  });

  saveUsers(users);
  return { success: true };
};

/**
 * Change password
 */
export const changePassword = async (userId, currentPassword, newPassword) => {
  const hasher = await getBcrypt();
  const users = loadUsers();
  const user = users.users.find(u => u.id === userId);

  if (!user) {
    return { success: false, error: "User not found" };
  }

  // Verify current password
  const isValid = await hasher.compare(currentPassword, user.passwordHash);
  if (!isValid) {
    return { success: false, error: "Current password is incorrect" };
  }

  // Validate new password
  if (newPassword.length < 8) {
    return { success: false, error: "New password must be at least 8 characters" };
  }

  // Update password
  user.passwordHash = await hasher.hash(newPassword, 10);
  saveUsers(users);

  // Invalidate all sessions for this user
  const sessions = loadSessions();
  sessions.sessions = sessions.sessions.filter(s => s.userId !== userId);
  saveSessions(sessions);

  return { success: true, message: "Password changed. Please log in again." };
};

/**
 * Get authentication status for display
 */
export const getAuthStatus = () => {
  const authState = loadAuthState();
  const users = loadUsers();

  return {
    state: authState.state,
    isLoggedIn: authState.state === AUTH_STATE.LOGGED_IN,
    requiresAuth: authState.requiresAuth,
    currentUser: authState.currentUser,
    lastLogin: authState.lastLogin,
    totalUsers: users.users.length
  };
};

/**
 * List all users (admin only)
 */
export const listUsers = () => {
  const users = loadUsers();
  return users.users.map(u => ({
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    createdAt: u.createdAt,
    lastLogin: u.lastLogin
  }));
};

/**
 * Delete user (admin only)
 */
export const deleteUser = (userId, adminUserId) => {
  const users = loadUsers();
  const adminUser = users.users.find(u => u.id === adminUserId);

  if (!adminUser || adminUser.role !== "admin") {
    return { success: false, error: "Admin privileges required" };
  }

  if (userId === adminUserId) {
    return { success: false, error: "Cannot delete your own account" };
  }

  const initialCount = users.users.length;
  users.users = users.users.filter(u => u.id !== userId);

  if (users.users.length < initialCount) {
    saveUsers(users);

    // Remove user's sessions
    const sessions = loadSessions();
    sessions.sessions = sessions.sessions.filter(s => s.userId !== userId);
    saveSessions(sessions);

    return { success: true };
  }

  return { success: false, error: "User not found" };
};

/**
 * Initialize first-time setup (creates admin user)
 */
export const initializeAuth = async (email, password, displayName) => {
  const users = loadUsers();

  if (users.users.length > 0) {
    return { success: false, error: "Auth already initialized" };
  }

  const result = await registerUser(email, password, displayName);
  if (result.success) {
    // Enable auth requirement after first user created
    setRequiresAuth(true);
  }

  return result;
};

export default {
  AUTH_STATE,
  loadAuthState,
  registerUser,
  login,
  logout,
  validateSession,
  isAuthenticated,
  getCurrentUser,
  setRequiresAuth,
  updateProfile,
  changePassword,
  getAuthStatus,
  listUsers,
  deleteUser,
  initializeAuth
};
