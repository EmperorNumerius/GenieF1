"""
GenieF1 Discord Bot

Commands
--------
/link <token>   – Link a paid GenieF1 session to this server.
/unlink         – Remove the active GenieF1 session from this server.
/status         – Show the current connection status.
/channel <name> – Set the channel where insights are broadcast.

How it works
------------
1. A user runs /link <token> with their paid session token from the GenieF1
   web dashboard.
2. The bot verifies the token against the GenieF1 backend (GET /session/<token>/status).
3. If the session is unlocked, the bot opens a persistent WebSocket connection
   to /ws/insights/<token> and forwards every message to the configured channel.
4. If the connection drops it automatically reconnects.
"""

import asyncio
import json
import logging
import os
from typing import Optional

import aiohttp
import discord
from discord import app_commands
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("genie_f1_bot")

GENIE_WS_URL = os.getenv("GENIE_F1_WS_URL", "ws://localhost:8000")
GENIE_API_URL = os.getenv("GENIE_F1_API_URL", "http://localhost:8000")
DISCORD_TOKEN = os.environ["DISCORD_BOT_TOKEN"]

# ---------------------------------------------------------------------------
# In-memory guild state
# Per-guild: { token, channel_id, ws_task }
# ---------------------------------------------------------------------------
_guild_state: dict[int, dict] = {}


# ---------------------------------------------------------------------------
# Utility: verify a session token
# ---------------------------------------------------------------------------

async def _verify_token(token: str) -> bool:
    """Return True if the token corresponds to an unlocked GenieF1 session."""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{GENIE_API_URL}/session/{token}/status", timeout=aiohttp.ClientTimeout(total=5)
            ) as resp:
                if resp.status != 200:
                    return False
                data = await resp.json()
                return bool(data.get("unlocked"))
    except Exception:
        return False


# ---------------------------------------------------------------------------
# WebSocket listener task
# ---------------------------------------------------------------------------

async def _ws_listener(guild_id: int, token: str, channel_id: int, bot: discord.Client) -> None:
    """
    Persistent WebSocket listener.  Reconnects automatically on disconnect.
    """
    backoff = 2
    while True:
        # Check the task is still wanted
        state = _guild_state.get(guild_id)
        if not state or state.get("token") != token:
            log.info("Guild %d: stopping WS listener (state changed)", guild_id)
            return

        try:
            url = f"{GENIE_WS_URL}/ws/insights/{token}"
            log.info("Guild %d: connecting to %s", guild_id, url)
            async with aiohttp.ClientSession() as http_session:
                async with http_session.ws_connect(url) as ws:
                    backoff = 2  # reset on successful connect
                    async for msg in ws:
                        if msg.type == aiohttp.WSMsgType.TEXT:
                            await _handle_insight(guild_id, channel_id, bot, msg.data)
                        elif msg.type == aiohttp.WSMsgType.CLOSE:
                            if ws.close_code == 4003:
                                # Session became locked; stop reconnecting
                                log.warning(
                                    "Guild %d: session locked (4003), stopping", guild_id
                                )
                                _guild_state.pop(guild_id, None)
                                return
                            break
                        elif msg.type == aiohttp.WSMsgType.ERROR:
                            break
        except (aiohttp.ClientError, asyncio.CancelledError) as exc:
            if isinstance(exc, asyncio.CancelledError):
                return
            log.warning("Guild %d: WS error – %s", guild_id, exc)

        log.info("Guild %d: WS disconnected, reconnecting in %ds…", guild_id, backoff)
        await asyncio.sleep(backoff)
        backoff = min(backoff * 2, 60)


async def _handle_insight(
    guild_id: int, channel_id: int, bot: discord.Client, raw: str
) -> None:
    """Parse an insight message and post it to the Discord channel."""
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return

    driver = data.get("driver", "?")
    insight = data.get("insight", "")
    telemetry = data.get("telemetry", {})

    # Build embed
    embed = discord.Embed(
        description=insight,
        color=0xE10600,  # F1 red
    )
    embed.set_author(name=f"🏎️  Car #{driver} – GenieF1 AI Engineer")

    # Add telemetry footer
    parts = []
    if telemetry.get("position"):
        parts.append(f"P{telemetry['position']}")
    if telemetry.get("last_lap"):
        parts.append(f"Lap {float(telemetry['last_lap']):.3f}s")
    compound = telemetry.get("tire_compound", "")
    age = telemetry.get("tire_age", "")
    if compound:
        parts.append(f"{compound} ({age}L)")
    if parts:
        embed.set_footer(text=" · ".join(parts))

    channel = bot.get_channel(channel_id)
    if channel is None:
        try:
            channel = await bot.fetch_channel(channel_id)
        except Exception:
            return

    try:
        await channel.send(embed=embed)
    except discord.Forbidden:
        log.warning(
            "Guild %d: missing permissions to send in channel %d", guild_id, channel_id
        )
    except Exception as exc:
        log.warning("Guild %d: failed to send message – %s", guild_id, exc)


# ---------------------------------------------------------------------------
# Bot setup
# ---------------------------------------------------------------------------

intents = discord.Intents.default()
intents.guilds = True


class GenieF1Bot(discord.Client):
    def __init__(self):
        super().__init__(intents=intents)
        self.tree = app_commands.CommandTree(self)

    async def setup_hook(self) -> None:
        await self.tree.sync()
        log.info("Command tree synced")

    async def on_ready(self) -> None:
        log.info("Logged in as %s (ID: %s)", self.user, self.user.id)


bot = GenieF1Bot()


# ---------------------------------------------------------------------------
# Slash commands
# ---------------------------------------------------------------------------


@bot.tree.command(name="link", description="Link a paid GenieF1 session to this server")
@app_commands.describe(token="Your GenieF1 session token from the web dashboard")
@app_commands.checks.has_permissions(manage_guild=True)
async def cmd_link(interaction: discord.Interaction, token: str) -> None:
    await interaction.response.defer(ephemeral=True)

    guild_id = interaction.guild_id

    unlocked = await _verify_token(token)
    if not unlocked:
        await interaction.followup.send(
            "❌ Token not found or session not yet paid. "
            "Complete payment at the GenieF1 dashboard first.",
            ephemeral=True,
        )
        return

    # Default to current channel
    channel_id = interaction.channel_id

    # Cancel any existing WS task for this guild
    old_state = _guild_state.get(guild_id, {})
    if old_task := old_state.get("ws_task"):
        old_task.cancel()

    task = asyncio.create_task(
        _ws_listener(guild_id, token, channel_id, bot)
    )
    _guild_state[guild_id] = {
        "token": token,
        "channel_id": channel_id,
        "ws_task": task,
    }

    await interaction.followup.send(
        f"✅ GenieF1 session linked! Live AI insights will be broadcast to "
        f"<#{channel_id}>.\nUse `/channel` to change the broadcast channel.",
        ephemeral=True,
    )


@bot.tree.command(name="unlink", description="Stop broadcasting GenieF1 insights")
@app_commands.checks.has_permissions(manage_guild=True)
async def cmd_unlink(interaction: discord.Interaction) -> None:
    guild_id = interaction.guild_id
    state = _guild_state.pop(guild_id, None)
    if state:
        if task := state.get("ws_task"):
            task.cancel()
        await interaction.response.send_message(
            "✅ GenieF1 session unlinked. Insights broadcasting stopped.",
            ephemeral=True,
        )
    else:
        await interaction.response.send_message(
            "ℹ️  No active GenieF1 session found for this server.", ephemeral=True
        )


@bot.tree.command(name="status", description="Show GenieF1 connection status")
async def cmd_status(interaction: discord.Interaction) -> None:
    guild_id = interaction.guild_id
    state = _guild_state.get(guild_id)
    if not state:
        await interaction.response.send_message(
            "ℹ️  No active GenieF1 session. Use `/link <token>` to connect.",
            ephemeral=True,
        )
        return

    task = state.get("ws_task")
    task_running = task and not task.done()
    channel_id = state.get("channel_id")
    status = "🟢 Live" if task_running else "🔴 Disconnected"

    await interaction.response.send_message(
        f"**GenieF1 Status**\n"
        f"Connection: {status}\n"
        f"Broadcast channel: <#{channel_id}>",
        ephemeral=True,
    )


@bot.tree.command(
    name="channel",
    description="Set the channel where GenieF1 insights are broadcast",
)
@app_commands.describe(channel="The text channel to broadcast insights to")
@app_commands.checks.has_permissions(manage_guild=True)
async def cmd_channel(
    interaction: discord.Interaction, channel: discord.TextChannel
) -> None:
    guild_id = interaction.guild_id
    state = _guild_state.get(guild_id)
    if not state:
        await interaction.response.send_message(
            "ℹ️  No active GenieF1 session. Use `/link <token>` first.",
            ephemeral=True,
        )
        return

    # Update channel and restart listener
    token = state["token"]
    old_task = state.get("ws_task")
    if old_task:
        old_task.cancel()

    new_task = asyncio.create_task(
        _ws_listener(guild_id, token, channel.id, bot)
    )
    state["channel_id"] = channel.id
    state["ws_task"] = new_task

    await interaction.response.send_message(
        f"✅ Insights will now be broadcast to {channel.mention}.",
        ephemeral=True,
    )


# ---------------------------------------------------------------------------
# Error handler
# ---------------------------------------------------------------------------


@bot.tree.error
async def on_app_command_error(
    interaction: discord.Interaction, error: app_commands.AppCommandError
) -> None:
    if isinstance(error, app_commands.MissingPermissions):
        await interaction.response.send_message(
            "❌ You need **Manage Server** permission to use this command.",
            ephemeral=True,
        )
    else:
        log.exception("Unhandled slash-command error", exc_info=error)
        await interaction.response.send_message(
            "❌ An unexpected error occurred.", ephemeral=True
        )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    bot.run(DISCORD_TOKEN, log_handler=None)
