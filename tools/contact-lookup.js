/**
 * Tool: Contact Lookup
 *
 * Search contacts by name, company, or role.
 */

import fs from "fs";
import { dataFile } from "../src/services/paths.js";

export const metadata = {
  id: "contact-lookup",
  name: "Contact Lookup",
  description: "Search contacts by name, company, or role",
  category: "social"
};

export async function execute(inputs = {}) {
  const { query } = inputs;
  if (!query) return { success: false, error: "query is required" };

  try {
    const contactsPath = dataFile("contacts.json");
    if (!fs.existsSync(contactsPath)) {
      return { success: false, error: "No contacts file found" };
    }

    const raw = JSON.parse(fs.readFileSync(contactsPath, "utf-8"));
    const contacts = Array.isArray(raw) ? raw : raw.contacts || [];
    const q = query.toLowerCase();

    const matches = contacts.filter(c =>
      (c.name || "").toLowerCase().includes(q) ||
      (c.company || "").toLowerCase().includes(q) ||
      (c.role || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.notes || "").toLowerCase().includes(q)
    );

    return {
      success: true,
      query,
      count: matches.length,
      contacts: matches.slice(0, 20).map(c => ({
        name: c.name,
        company: c.company,
        role: c.role,
        email: c.email,
        phone: c.phone,
        category: c.category
      }))
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export default { metadata, execute };
