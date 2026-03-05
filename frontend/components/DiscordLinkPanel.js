/**
 * DiscordLinkPanel component
 *
 * Allows a paid user to link their Discord server to their GenieF1 session so
 * the bot can broadcast live AI insights to a channel.
 *
 * The Discord bot invite URL adds the bot to the guild; the guild ID is then
 * sent to the backend to associate it with the session.
 */

import { useState } from "react";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Replace with your actual Discord bot client ID
const DISCORD_BOT_CLIENT_ID =
  process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID || "YOUR_DISCORD_CLIENT_ID";

const BOT_INVITE = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_BOT_CLIENT_ID}&permissions=2048&scope=bot`;

export default function DiscordLinkPanel({ token }) {
  const [guildId, setGuildId] = useState("");
  const [status, setStatus] = useState(null); // null | "linking" | "linked" | "error"
  const [error, setError] = useState(null);

  async function handleLink(e) {
    e.preventDefault();
    if (!guildId.trim()) return;
    setStatus("linking");
    setError(null);
    try {
      const res = await fetch(`${API_URL}/session/${token}/link-discord`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guild_id: guildId.trim() }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.detail || "Failed to link");
      }
      setStatus("linked");
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  }

  if (status === "linked") {
    return (
      <div className="bg-green-900/30 border border-green-700 rounded-xl p-4 text-sm text-green-300">
        ✅ Discord server linked! The bot will start broadcasting AI insights to
        your server.
      </div>
    );
  }

  return (
    <div className="bg-f1gray border border-gray-700 rounded-xl p-4">
      <h3 className="text-sm font-black uppercase tracking-widest text-white mb-3">
        🤖 Link Discord Server
      </h3>
      <p className="text-xs text-gray-400 mb-4">
        Invite the GenieF1 bot to your server, then enter your Discord Server
        (Guild) ID below to start receiving live AI race insights.
      </p>

      <a
        href={BOT_INVITE}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2 px-4 rounded-lg mb-4 transition-colors"
      >
        + Add GenieF1 Bot to Server
      </a>

      <form onSubmit={handleLink} className="flex gap-2">
        <input
          type="text"
          value={guildId}
          onChange={(e) => setGuildId(e.target.value)}
          placeholder="Discord Server ID (e.g. 1234567890)"
          className="flex-1 bg-f1dark border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-f1red"
        />
        <button
          type="submit"
          disabled={status === "linking" || !guildId.trim()}
          className="bg-f1red hover:bg-red-700 disabled:opacity-50 text-white text-sm font-bold py-2 px-4 rounded-lg transition-colors"
        >
          {status === "linking" ? "Linking…" : "Link"}
        </button>
      </form>

      {error && (
        <p className="text-red-400 text-xs mt-2">{error}</p>
      )}

      <p className="text-xs text-gray-600 mt-3">
        To find your Server ID: enable Developer Mode in Discord, then
        right-click your server name and click &quot;Copy ID&quot;.
      </p>
    </div>
  );
}
