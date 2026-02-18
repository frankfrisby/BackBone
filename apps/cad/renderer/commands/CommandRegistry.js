export class CommandRegistry {
  constructor() {
    this.commands = new Map();
    this.aliases = new Map();
  }

  register(name, aliases, handler) {
    this.commands.set(name.toUpperCase(), handler);
    for (const a of aliases) this.aliases.set(a.toUpperCase(), name.toUpperCase());
  }

  resolve(input) {
    const upper = input.toUpperCase().trim();
    return this.commands.get(upper) || this.commands.get(this.aliases.get(upper));
  }

  getCompletions(partial) {
    const upper = partial.toUpperCase();
    const results = [];
    for (const name of this.commands.keys()) {
      if (name.startsWith(upper)) results.push(name);
    }
    for (const [alias, name] of this.aliases) {
      if (alias.startsWith(upper)) results.push(`${alias} (${name})`);
    }
    return results;
  }
}
