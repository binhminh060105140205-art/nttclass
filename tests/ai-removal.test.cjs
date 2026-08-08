const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("AI assistant is fully removed", () => {
    const files = ["index.html", "app-shell.js", "core.js", "server.js", "style.css", "lithos-app-bundle.css", "pink-minimal-theme.css", "schema-postgres.sql", ".env.example"];
    const source = files.map(read).join("\n");
    assert.equal(fs.existsSync(path.join(root, "ai-chat.js")), false);
    assert.doesNotMatch(source, /nav-ai-chat|view-ai-chat|aiChat|ai-chat|ai-conversation|AiConversations|OPENAI_API_KEY|OPENAI_CHAT_MODEL/i);
});
