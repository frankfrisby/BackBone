import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import path from "path";
import { getDataDir } from "../services/paths.js";

/**
 * BACKBONE Contacts Directory MCP Server
 * Manages contacts across categories: linkedin, family, friends, coworkers, startup
 */

const DATA_DIR = getDataDir();
const CONTACTS_DIR = path.join(DATA_DIR, "contacts");
const CATEGORIES = ["linkedin", "family", "friends", "coworkers", "startup"];

// Ensure directory structure exists
function ensureDirectories() {
  if (!fs.existsSync(CONTACTS_DIR)) {
    fs.mkdirSync(CONTACTS_DIR, { recursive: true });
  }
  for (const cat of CATEGORIES) {
    const catDir = path.join(CONTACTS_DIR, cat);
    if (!fs.existsSync(catDir)) {
      fs.mkdirSync(catDir, { recursive: true });
    }
  }
}

ensureDirectories();

// Tool definitions
const TOOLS = [
  {
    name: "add_contact",
    description: "Add a new contact to the directory",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Full name of the contact" },
        email: { type: "string", description: "Email address" },
        phone: { type: "string", description: "Phone number" },
        company: { type: "string", description: "Company or organization" },
        role: { type: "string", description: "Job title or role" },
        category: {
          type: "string",
          description: "Category: linkedin, family, friends, coworkers, startup",
          enum: CATEGORIES,
        },
        notes: { type: "string", description: "Additional notes about the contact" },
        linkedinUrl: { type: "string", description: "LinkedIn profile URL" },
      },
      required: ["name", "category"],
    },
  },
  {
    name: "get_contacts",
    description: "List contacts, optionally filtered by category",
    inputSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "Filter by category (omit for all)",
          enum: CATEGORIES,
        },
        limit: { type: "number", description: "Max results (default 50)" },
      },
      required: [],
    },
  },
  {
    name: "search_contacts",
    description: "Search contacts by name, company, role, or notes",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_contact_profile",
    description: "Get full profile for a specific contact by ID or name",
    inputSchema: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" },
        name: { type: "string", description: "Contact name (if ID unknown)" },
      },
      required: [],
    },
  },
  {
    name: "update_contact",
    description: "Update an existing contact's details",
    inputSchema: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID to update" },
        name: { type: "string", description: "Updated name" },
        email: { type: "string", description: "Updated email" },
        phone: { type: "string", description: "Updated phone" },
        company: { type: "string", description: "Updated company" },
        role: { type: "string", description: "Updated role" },
        notes: { type: "string", description: "Updated notes" },
        linkedinUrl: { type: "string", description: "Updated LinkedIn URL" },
      },
      required: ["contactId"],
    },
  },
  {
    name: "categorize_contact",
    description: "Move a contact to a different category",
    inputSchema: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" },
        newCategory: {
          type: "string",
          description: "New category",
          enum: CATEGORIES,
        },
      },
      required: ["contactId", "newCategory"],
    },
  },
];

// === HELPERS ===

function generateId(name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `contact_${slug}_${Date.now().toString(36)}`;
}

function getContactFilePath(category, contactId) {
  return path.join(CONTACTS_DIR, category, `${contactId}.json`);
}

function readJson(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch {}
  return null;
}

function writeJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function getAllContacts() {
  const contacts = [];
  for (const cat of CATEGORIES) {
    const catDir = path.join(CONTACTS_DIR, cat);
    if (!fs.existsSync(catDir)) continue;
    const files = fs.readdirSync(catDir).filter(f => f.endsWith(".json"));
    for (const file of files) {
      const data = readJson(path.join(catDir, file));
      if (data) {
        contacts.push({ ...data, category: cat });
      }
    }
  }
  return contacts;
}

function findContactById(contactId) {
  for (const cat of CATEGORIES) {
    const filePath = getContactFilePath(cat, contactId);
    const data = readJson(filePath);
    if (data) return { ...data, category: cat, filePath };
  }
  return null;
}

function findContactByName(name) {
  const lower = name.toLowerCase();
  const all = getAllContacts();
  return all.find(c => c.name && c.name.toLowerCase() === lower) ||
    all.find(c => c.name && c.name.toLowerCase().includes(lower));
}

// === TOOL IMPLEMENTATIONS ===

function addContact(args) {
  const { name, category } = args;

  if (!CATEGORIES.includes(category)) {
    return { error: `Invalid category. Must be one of: ${CATEGORIES.join(", ")}` };
  }

  const contactId = generateId(name);
  const contact = {
    id: contactId,
    name,
    email: args.email || null,
    phone: args.phone || null,
    company: args.company || null,
    role: args.role || null,
    notes: args.notes || null,
    linkedinUrl: args.linkedinUrl || null,
    lastInteraction: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const filePath = getContactFilePath(category, contactId);
  writeJson(filePath, contact);

  return {
    success: true,
    contact: { ...contact, category },
    message: `Added ${name} to ${category} contacts`,
  };
}

function getContacts(category, limit = 50) {
  let contacts;

  if (category) {
    if (!CATEGORIES.includes(category)) {
      return { error: `Invalid category. Must be one of: ${CATEGORIES.join(", ")}` };
    }
    const catDir = path.join(CONTACTS_DIR, category);
    contacts = [];
    if (fs.existsSync(catDir)) {
      const files = fs.readdirSync(catDir).filter(f => f.endsWith(".json"));
      for (const file of files) {
        const data = readJson(path.join(catDir, file));
        if (data) contacts.push({ ...data, category });
      }
    }
  } else {
    contacts = getAllContacts();
  }

  // Sort by most recently updated
  contacts.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

  return {
    contacts: contacts.slice(0, limit),
    total: contacts.length,
    category: category || "all",
  };
}

function searchContacts(query) {
  const lower = query.toLowerCase();
  const all = getAllContacts();

  const matches = all.filter(c =>
    (c.name && c.name.toLowerCase().includes(lower)) ||
    (c.company && c.company.toLowerCase().includes(lower)) ||
    (c.role && c.role.toLowerCase().includes(lower)) ||
    (c.notes && c.notes.toLowerCase().includes(lower)) ||
    (c.email && c.email.toLowerCase().includes(lower))
  );

  return {
    results: matches,
    total: matches.length,
    query,
  };
}

function getContactProfile(contactId, name) {
  let contact;

  if (contactId) {
    contact = findContactById(contactId);
  } else if (name) {
    contact = findContactByName(name);
  } else {
    return { error: "Provide either contactId or name" };
  }

  if (!contact) {
    return { error: "Contact not found" };
  }

  return { contact };
}

function updateContact(contactId, updates) {
  const existing = findContactById(contactId);
  if (!existing) {
    return { error: `Contact not found: ${contactId}` };
  }

  const updated = { ...existing };
  delete updated.filePath;
  delete updated.category;

  if (updates.name) updated.name = updates.name;
  if (updates.email !== undefined) updated.email = updates.email;
  if (updates.phone !== undefined) updated.phone = updates.phone;
  if (updates.company !== undefined) updated.company = updates.company;
  if (updates.role !== undefined) updated.role = updates.role;
  if (updates.notes !== undefined) updated.notes = updates.notes;
  if (updates.linkedinUrl !== undefined) updated.linkedinUrl = updates.linkedinUrl;
  updated.updatedAt = new Date().toISOString();

  writeJson(existing.filePath, updated);

  return {
    success: true,
    contact: { ...updated, category: existing.category },
    message: `Updated ${updated.name}`,
  };
}

function categorizeContact(contactId, newCategory) {
  if (!CATEGORIES.includes(newCategory)) {
    return { error: `Invalid category. Must be one of: ${CATEGORIES.join(", ")}` };
  }

  const existing = findContactById(contactId);
  if (!existing) {
    return { error: `Contact not found: ${contactId}` };
  }

  const oldCategory = existing.category;
  if (oldCategory === newCategory) {
    return { message: `Contact already in ${newCategory}`, contact: existing };
  }

  // Remove from old location
  try {
    fs.unlinkSync(existing.filePath);
  } catch {}

  // Write to new location
  const contact = { ...existing };
  delete contact.filePath;
  delete contact.category;
  contact.updatedAt = new Date().toISOString();

  const newPath = getContactFilePath(newCategory, contactId);
  writeJson(newPath, contact);

  return {
    success: true,
    contact: { ...contact, category: newCategory },
    message: `Moved ${contact.name} from ${oldCategory} to ${newCategory}`,
  };
}

// === SERVER SETUP ===

const server = new Server(
  { name: "backbone-contacts", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  let result;

  switch (name) {
    case "add_contact":
      result = addContact(args);
      break;
    case "get_contacts":
      result = getContacts(args.category, args.limit);
      break;
    case "search_contacts":
      result = searchContacts(args.query);
      break;
    case "get_contact_profile":
      result = getContactProfile(args.contactId, args.name);
      break;
    case "update_contact":
      result = updateContact(args.contactId, args);
      break;
    case "categorize_contact":
      result = categorizeContact(args.contactId, args.newCategory);
      break;
    default:
      throw new Error(`Unknown tool: ${name}`);
  }

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("BACKBONE Contacts Directory MCP Server running");
}

main().catch(console.error);
