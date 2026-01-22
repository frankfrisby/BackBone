/**
 * Login Panel - Splash Screen & Authentication
 *
 * Beautiful splash page with ASCII art logo and login functionality.
 * Supports both local authentication and Firebase auth.
 */

import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";

const e = React.createElement;

// ASCII Art Logo for BACKBONE
const LOGO = `
 ____    _    ____ _  ______   ___  _   _ _____
| __ )  / \\  / ___| |/ / __ ) / _ \\| \\ | | ____|
|  _ \\ / _ \\| |   | ' /|  _ \\| | | |  \\| |  _|
| |_) / ___ \\ |___| . \\| |_) | |_| | |\\  | |___
|____/_/   \\_\\____|_|\\_\\____/ \\___/|_| \\_|_____|
`.trim();

// Mini logo for smaller screens
const MINI_LOGO = `
╔══════════════════════╗
║     BACKBONE AI      ║
║  Life Operating Sys  ║
╚══════════════════════╝
`.trim();

/**
 * Login modes
 */
const LOGIN_MODE = {
  SPLASH: "splash",
  LOGIN: "login",
  REGISTER: "register",
  FORGOT_PASSWORD: "forgot_password"
};

/**
 * Input field component
 */
const InputField = ({ label, value, onChange, placeholder, isPassword, isActive, width = 40 }) => {
  return e(
    Box,
    { flexDirection: "column", marginBottom: 1 },
    e(Text, { color: isActive ? "#f59e0b" : "#64748b" }, label),
    e(
      Box,
      {
        borderStyle: isActive ? "single" : "round",
        borderColor: isActive ? "#f59e0b" : "#334155",
        paddingX: 1,
        width
      },
      isActive
        ? e(TextInput, {
            value,
            onChange,
            placeholder,
            mask: isPassword ? "*" : undefined
          })
        : e(Text, { color: "#64748b" }, isPassword ? "*".repeat(value.length) : value || placeholder)
    )
  );
};

/**
 * Animated welcome messages
 */
const WELCOME_MESSAGES = [
  "Your AI-Powered Life Operating System",
  "Trade Smarter. Live Better.",
  "Optimize Every Aspect of Your Life",
  "Autonomous Trading & Life Management",
  "Built for Those Who Demand Excellence"
];

/**
 * Login Panel Component
 */
export const LoginPanel = ({
  onLogin,
  onRegister,
  onSkip,
  authRequired = false
}) => {
  const [mode, setMode] = useState(LOGIN_MODE.SPLASH);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [activeField, setActiveField] = useState(0);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [welcomeIndex, setWelcomeIndex] = useState(0);
  const [showLogo, setShowLogo] = useState(true);

  // Cycle welcome messages
  useEffect(() => {
    if (mode === LOGIN_MODE.SPLASH) {
      const interval = setInterval(() => {
        setWelcomeIndex(prev => (prev + 1) % WELCOME_MESSAGES.length);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [mode]);

  // Handle keyboard input
  useInput((input, key) => {
    if (isProcessing) return;

    // Splash screen - any key to continue
    if (mode === LOGIN_MODE.SPLASH) {
      if (key.return || input === " ") {
        setMode(LOGIN_MODE.LOGIN);
      } else if (input === "s" && !authRequired) {
        onSkip?.();
      }
      return;
    }

    // Navigation
    if (key.tab || key.downArrow) {
      const maxFields = mode === LOGIN_MODE.LOGIN ? 2 : 4;
      setActiveField(prev => (prev + 1) % maxFields);
      return;
    }

    if (key.upArrow) {
      const maxFields = mode === LOGIN_MODE.LOGIN ? 2 : 4;
      setActiveField(prev => (prev - 1 + maxFields) % maxFields);
      return;
    }

    // Submit on Enter when on last field
    if (key.return) {
      const maxFields = mode === LOGIN_MODE.LOGIN ? 2 : 4;
      if (activeField === maxFields - 1) {
        handleSubmit();
      } else {
        setActiveField(prev => prev + 1);
      }
      return;
    }

    // Switch modes
    if (key.escape) {
      if (mode === LOGIN_MODE.LOGIN || mode === LOGIN_MODE.REGISTER) {
        setMode(LOGIN_MODE.SPLASH);
        setError(null);
        setSuccess(null);
      }
      return;
    }

    // Toggle between login and register
    if (input === "r" && mode === LOGIN_MODE.LOGIN) {
      setMode(LOGIN_MODE.REGISTER);
      setActiveField(0);
      setError(null);
      return;
    }
    if (input === "l" && mode === LOGIN_MODE.REGISTER) {
      setMode(LOGIN_MODE.LOGIN);
      setActiveField(0);
      setError(null);
      return;
    }
  });

  // Handle form submission
  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);

    if (mode === LOGIN_MODE.LOGIN) {
      if (!email || !password) {
        setError("Please enter email and password");
        return;
      }

      setIsProcessing(true);
      try {
        const result = await onLogin?.(email, password);
        if (!result?.success) {
          setError(result?.error || "Login failed");
        }
      } catch (err) {
        setError(err.message);
      }
      setIsProcessing(false);
    } else if (mode === LOGIN_MODE.REGISTER) {
      if (!email || !password || !confirmPassword) {
        setError("Please fill in all fields");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }
      if (password.length < 8) {
        setError("Password must be at least 8 characters");
        return;
      }

      setIsProcessing(true);
      try {
        const result = await onRegister?.(email, password, displayName || email.split("@")[0]);
        if (result?.success) {
          setSuccess("Account created! Please log in.");
          setMode(LOGIN_MODE.LOGIN);
          setPassword("");
          setConfirmPassword("");
          setActiveField(1); // Focus password field
        } else {
          setError(result?.error || "Registration failed");
        }
      } catch (err) {
        setError(err.message);
      }
      setIsProcessing(false);
    }
  };

  // Splash Screen
  if (mode === LOGIN_MODE.SPLASH) {
    return e(
      Box,
      {
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 2,
        borderStyle: "double",
        borderColor: "#f59e0b",
        width: "100%",
        minHeight: 20
      },
      // Logo
      e(
        Box,
        { flexDirection: "column", alignItems: "center", marginBottom: 2 },
        ...LOGO.split("\n").map((line, i) =>
          e(Text, {
            key: i,
            color: i < 2 ? "#f59e0b" : "#d97706",
            bold: i < 2
          }, line)
        )
      ),

      // Version
      e(Text, { color: "#475569" }, "v1.0.0"),

      // Animated welcome message
      e(
        Box,
        { marginY: 2 },
        e(Text, { color: "#94a3b8", italic: true }, WELCOME_MESSAGES[welcomeIndex])
      ),

      // Features highlight
      e(
        Box,
        { flexDirection: "row", gap: 4, marginY: 1 },
        e(
          Box,
          { flexDirection: "column", alignItems: "center" },
          e(Text, { color: "#22c55e", bold: true }, "TRADE"),
          e(Text, { color: "#64748b" }, "Autonomous")
        ),
        e(
          Box,
          { flexDirection: "column", alignItems: "center" },
          e(Text, { color: "#3b82f6", bold: true }, "TRACK"),
          e(Text, { color: "#64748b" }, "Everything")
        ),
        e(
          Box,
          { flexDirection: "column", alignItems: "center" },
          e(Text, { color: "#8b5cf6", bold: true }, "OPTIMIZE"),
          e(Text, { color: "#64748b" }, "Your Life")
        )
      ),

      // Actions
      e(
        Box,
        { flexDirection: "column", alignItems: "center", marginTop: 2 },
        e(Text, { color: "#f59e0b" }, "[Enter] Continue to Login"),
        !authRequired && e(Text, { color: "#64748b", dimColor: true }, "[S] Skip Login")
      ),

      // Footer
      e(
        Box,
        { marginTop: 2 },
        e(Text, { color: "#334155", dimColor: true }, "Press any key to continue...")
      )
    );
  }

  // Login Form
  if (mode === LOGIN_MODE.LOGIN) {
    return e(
      Box,
      {
        flexDirection: "column",
        padding: 2,
        borderStyle: "double",
        borderColor: "#f59e0b",
        width: 60
      },
      // Header
      e(
        Box,
        { flexDirection: "row", justifyContent: "center", marginBottom: 2 },
        e(Text, { color: "#f59e0b", bold: true }, "Welcome Back")
      ),

      // Mini logo
      e(
        Box,
        { flexDirection: "column", alignItems: "center", marginBottom: 2 },
        e(Text, { color: "#d97706" }, "BACKBONE AI")
      ),

      // Error/Success messages
      error && e(
        Box,
        { marginBottom: 1, paddingX: 1, borderStyle: "round", borderColor: "#ef4444" },
        e(Text, { color: "#ef4444" }, error)
      ),
      success && e(
        Box,
        { marginBottom: 1, paddingX: 1, borderStyle: "round", borderColor: "#22c55e" },
        e(Text, { color: "#22c55e" }, success)
      ),

      // Email field
      e(InputField, {
        label: "Email",
        value: email,
        onChange: setEmail,
        placeholder: "you@example.com",
        isActive: activeField === 0
      }),

      // Password field
      e(InputField, {
        label: "Password",
        value: password,
        onChange: setPassword,
        placeholder: "Enter password",
        isPassword: true,
        isActive: activeField === 1
      }),

      // Processing indicator
      isProcessing
        ? e(
            Box,
            { flexDirection: "row", gap: 1, justifyContent: "center", marginY: 1 },
            e(Spinner, { type: "dots" }),
            e(Text, { color: "#f59e0b" }, "Logging in...")
          )
        : e(
            Box,
            { flexDirection: "column", alignItems: "center", marginTop: 1 },
            e(
              Box,
              {
                paddingX: 4,
                paddingY: 1,
                borderStyle: "round",
                borderColor: "#f59e0b",
                backgroundColor: activeField === 1 ? "#f59e0b" : undefined
              },
              e(Text, { color: activeField === 1 ? "#1a1a2e" : "#f59e0b", bold: true }, "LOGIN")
            )
          ),

      // Footer options
      e(
        Box,
        { flexDirection: "column", alignItems: "center", marginTop: 2 },
        e(Text, { color: "#64748b" }, "[R] Create Account  [Esc] Back"),
        e(Text, { color: "#475569", dimColor: true }, "[Tab] Navigate  [Enter] Submit")
      )
    );
  }

  // Register Form
  if (mode === LOGIN_MODE.REGISTER) {
    return e(
      Box,
      {
        flexDirection: "column",
        padding: 2,
        borderStyle: "double",
        borderColor: "#22c55e",
        width: 60
      },
      // Header
      e(
        Box,
        { flexDirection: "row", justifyContent: "center", marginBottom: 2 },
        e(Text, { color: "#22c55e", bold: true }, "Create Account")
      ),

      // Error message
      error && e(
        Box,
        { marginBottom: 1, paddingX: 1, borderStyle: "round", borderColor: "#ef4444" },
        e(Text, { color: "#ef4444" }, error)
      ),

      // Display name field
      e(InputField, {
        label: "Display Name (optional)",
        value: displayName,
        onChange: setDisplayName,
        placeholder: "Your name",
        isActive: activeField === 0
      }),

      // Email field
      e(InputField, {
        label: "Email",
        value: email,
        onChange: setEmail,
        placeholder: "you@example.com",
        isActive: activeField === 1
      }),

      // Password field
      e(InputField, {
        label: "Password (min 8 characters)",
        value: password,
        onChange: setPassword,
        placeholder: "Create password",
        isPassword: true,
        isActive: activeField === 2
      }),

      // Confirm password field
      e(InputField, {
        label: "Confirm Password",
        value: confirmPassword,
        onChange: setConfirmPassword,
        placeholder: "Confirm password",
        isPassword: true,
        isActive: activeField === 3
      }),

      // Processing indicator
      isProcessing
        ? e(
            Box,
            { flexDirection: "row", gap: 1, justifyContent: "center", marginY: 1 },
            e(Spinner, { type: "dots" }),
            e(Text, { color: "#22c55e" }, "Creating account...")
          )
        : e(
            Box,
            { flexDirection: "column", alignItems: "center", marginTop: 1 },
            e(
              Box,
              {
                paddingX: 4,
                paddingY: 1,
                borderStyle: "round",
                borderColor: "#22c55e",
                backgroundColor: activeField === 3 ? "#22c55e" : undefined
              },
              e(Text, { color: activeField === 3 ? "#1a1a2e" : "#22c55e", bold: true }, "REGISTER")
            )
          ),

      // Footer options
      e(
        Box,
        { flexDirection: "column", alignItems: "center", marginTop: 2 },
        e(Text, { color: "#64748b" }, "[L] Back to Login  [Esc] Back"),
        e(Text, { color: "#475569", dimColor: true }, "[Tab] Navigate  [Enter] Submit")
      )
    );
  }

  return null;
};

/**
 * Compact auth status display for header
 */
export const AuthStatusDisplay = ({ user, onLogout }) => {
  if (!user) {
    return e(
      Box,
      { flexDirection: "row", gap: 1 },
      e(Text, { color: "#64748b" }, "Guest Mode")
    );
  }

  return e(
    Box,
    { flexDirection: "row", gap: 2 },
    e(Text, { color: "#22c55e" }, user.displayName || user.email),
    e(Text, { color: "#64748b", dimColor: true }, `[${user.role}]`)
  );
};

export default LoginPanel;
