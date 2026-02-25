/**
 * Tool: Backup Now
 *
 * Trigger Firebase Storage backup of all user data.
 */

export const metadata = {
  id: "backup-now",
  name: "Backup Now",
  description: "Trigger Firebase Storage backup of all user data (projects, memory, goals, spreadsheets)",
  category: "system"
};

export async function execute() {
  try {
    const { backupToFirebase } = await import("../src/services/firebase/firebase-storage.js");
    const result = await backupToFirebase({ force: true });

    return {
      success: true,
      filesUploaded: result.uploaded || result.filesUploaded || 0,
      filesSkipped: result.skipped || result.filesSkipped || 0,
      errors: result.errors || [],
      duration: result.duration || null
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export default { metadata, execute };
