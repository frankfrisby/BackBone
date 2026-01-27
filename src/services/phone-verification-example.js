/**
 * Phone Verification - Usage Example
 *
 * This shows how to integrate phone verification in your app.
 */

import { getPhoneVerification, VERIFICATION_STATUS } from "./phone-verification.js";

/**
 * Example: Complete verification flow
 */
async function exampleVerificationFlow() {
  const verification = getPhoneVerification();

  // Initialize (connects to Twilio)
  const initResult = await verification.initialize();
  if (!initResult.success) {
    console.log("Setup needed:", initResult.error);
    console.log(initResult.setupInstructions);
    return;
  }

  // ══════════════════════════════════════════════════════════
  // STEP 1: User enters phone number, app sends verification code
  // ══════════════════════════════════════════════════════════

  const phoneNumber = "+1234567890";  // User's phone number
  const userId = "user_123";          // Your user's ID

  console.log("Sending verification code...");
  const sendResult = await verification.sendVerificationCode(phoneNumber, userId);

  if (!sendResult.success) {
    console.log("Error:", sendResult.error);
    // Show error to user
    // If rate limited, show "Try again in 1 hour"
    return;
  }

  console.log("Code sent!");
  console.log("Verification ID:", sendResult.verificationId);
  console.log("Expires at:", new Date(sendResult.expiresAt));
  console.log("Attempts allowed:", sendResult.attemptsRemaining);

  // Store verificationId in your app state
  const verificationId = sendResult.verificationId;

  // ══════════════════════════════════════════════════════════
  // STEP 2: User enters the 6-digit code from WhatsApp
  // ══════════════════════════════════════════════════════════

  // Simulate user entering code (in real app, this comes from input)
  const userEnteredCode = "123456";  // What user types in

  console.log("\nVerifying code...");
  const verifyResult = verification.verifyCode(verificationId, userEnteredCode);

  if (verifyResult.success) {
    // ✅ SUCCESS!
    console.log("✅ Phone verified successfully!");
    console.log("Verified phone:", verifyResult.phoneNumber);

    // Now you can:
    // - Enable WhatsApp messaging for this user
    // - Save verified phone to user profile
    // - Allow AI to message user via WhatsApp

  } else {
    // Handle different failure cases
    switch (verifyResult.status) {
      case VERIFICATION_STATUS.PENDING:
        // Wrong code but still have attempts
        console.log("❌ Wrong code.");
        console.log(`Attempts remaining: ${verifyResult.attemptsRemaining}`);
        // Show: "Incorrect code. X attempts remaining."
        break;

      case VERIFICATION_STATUS.FAILED:
        // Used all 3 attempts
        console.log("❌ Too many wrong attempts.");
        console.log("Show RETRY button to user");
        // Show: "Too many attempts. [Retry] button"
        break;

      case VERIFICATION_STATUS.EXPIRED:
        // Code expired after 10 minutes
        console.log("❌ Code expired.");
        console.log("Show RETRY button to user");
        // Show: "Code expired. [Retry] button"
        break;

      case VERIFICATION_STATUS.RATE_LIMITED:
        // Too many code requests
        console.log("❌ Rate limited.");
        // Show: "Too many attempts. Try again in 1 hour."
        break;
    }
  }

  // ══════════════════════════════════════════════════════════
  // STEP 3: User hits RETRY (sends new code)
  // ══════════════════════════════════════════════════════════

  console.log("\nUser hits Retry...");
  const retryResult = await verification.retry(phoneNumber, userId);

  if (retryResult.success) {
    console.log("New code sent!");
    console.log("New verification ID:", retryResult.verificationId);
    // Start over with new verificationId
  } else {
    console.log("Retry failed:", retryResult.error);
  }
}

/**
 * Example: React/UI Component Integration
 */
const UIIntegrationExample = `
// In your React component:

import { getPhoneVerification, VERIFICATION_STATUS } from "./phone-verification.js";

function PhoneVerificationScreen() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState("");
  const [verificationId, setVerificationId] = useState(null);
  const [status, setStatus] = useState("idle"); // idle, sending, pending, verified, failed
  const [error, setError] = useState("");
  const [attemptsRemaining, setAttemptsRemaining] = useState(3);

  const verification = getPhoneVerification();

  // Send verification code
  const handleSendCode = async () => {
    setStatus("sending");
    setError("");

    const result = await verification.sendVerificationCode(phoneNumber, userId);

    if (result.success) {
      setVerificationId(result.verificationId);
      setStatus("pending");
      setAttemptsRemaining(result.attemptsRemaining);
    } else {
      setError(result.error);
      setStatus("idle");
    }
  };

  // Verify the code
  const handleVerifyCode = () => {
    const result = verification.verifyCode(verificationId, code);

    if (result.success) {
      setStatus("verified");
      // Navigate to next screen or enable features
    } else {
      setError(result.error);
      setAttemptsRemaining(result.attemptsRemaining || 0);

      if (result.status === VERIFICATION_STATUS.FAILED ||
          result.status === VERIFICATION_STATUS.EXPIRED) {
        setStatus("failed");
      }
    }
  };

  // Retry with new code
  const handleRetry = async () => {
    setCode("");
    setError("");
    const result = await verification.retry(phoneNumber, userId);

    if (result.success) {
      setVerificationId(result.verificationId);
      setStatus("pending");
      setAttemptsRemaining(result.attemptsRemaining);
    } else {
      setError(result.error);
    }
  };

  return (
    <View>
      {status === "idle" && (
        <>
          <Text>Enter your phone number</Text>
          <TextInput
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            placeholder="+1 234 567 8900"
            keyboardType="phone-pad"
          />
          <Button title="Send Code" onPress={handleSendCode} />
        </>
      )}

      {status === "pending" && (
        <>
          <Text>Enter the 6-digit code sent to your WhatsApp</Text>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="123456"
            keyboardType="number-pad"
            maxLength={6}
          />
          <Text>{attemptsRemaining} attempts remaining</Text>
          <Button title="Verify" onPress={handleVerifyCode} />
        </>
      )}

      {status === "failed" && (
        <>
          <Text>{error}</Text>
          <Button title="Retry" onPress={handleRetry} />
        </>
      )}

      {status === "verified" && (
        <Text>✅ Phone verified successfully!</Text>
      )}

      {error && status !== "failed" && (
        <Text style={{ color: "red" }}>{error}</Text>
      )}
    </View>
  );
}
`;

// Run example
// exampleVerificationFlow().catch(console.error);

console.log("Phone Verification Service Ready");
console.log("================================");
console.log("");
console.log("FLOW:");
console.log("1. User enters phone number");
console.log("2. App calls sendVerificationCode(phone, userId)");
console.log("3. User receives 6-digit code on WhatsApp");
console.log("4. User enters code in app");
console.log("5. App calls verifyCode(verificationId, code)");
console.log("6. If wrong, user has 3 attempts");
console.log("7. If failed/expired, user hits Retry for new code");
console.log("");
console.log("See UIIntegrationExample for React component code.");
