import discord
from discord.ext import commands, tasks
import os
import httpx
import logging
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("discord_bot")

DISCORD_BOT_TOKEN = os.getenv("DISCORD_BOT_TOKEN")
API_BASE_URL = os.getenv("API_BASE_URL", "http://127.0.0.1:8000")

linked_channels = {}

intents = discord.Intents.default()
intents.message_content = True

bot = commands.Bot(command_prefix="!", intents=intents)

@bot.event
async def on_ready():
    logger.info(f"Logged in as {bot.user.name}")
    broadcast_insights.start()

@bot.command()
async def link(ctx, session_id: str):
    """Links this Discord channel to a user's dashboard session."""
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"{API_BASE_URL}/api/insights",
                headers={"session-id": session_id}
            )

            if response.status_code == 200:
                linked_channels[ctx.channel.id] = session_id
                await ctx.send(f"✅ Successfully linked channel to session `{session_id}`. Live F1 insights will be broadcasted here.")
            else:
                await ctx.send("❌ Failed to link. This session might not be unlocked via the paywall yet.")
        except Exception as e:
            logger.error(f"Error communicating with backend: {e}")
            await ctx.send("❌ Error communicating with the F1 backend.")

@bot.command()
async def unlink(ctx):
    """Unlinks this Discord channel."""
    if ctx.channel.id in linked_channels:
        del linked_channels[ctx.channel.id]
        await ctx.send("✅ Successfully unlinked channel.")
    else:
        await ctx.send("⚠️ This channel is not currently linked.")

@tasks.loop(seconds=15)
async def broadcast_insights():
    """Fetches insights from the backend and broadcasts to linked channels."""
    if not linked_channels:
        return

    async with httpx.AsyncClient() as client:
        # Check if the backend has an active session before querying insights
        try:
            status_response = await client.get(f"{API_BASE_URL}/api/status")
            if status_response.status_code == 200:
                status_data = status_response.json()
                if not status_data.get("is_connected", False) or status_data.get("cars_tracked", 0) == 0:
                    # No active session, quietly skip to avoid crashing or spamming errors
                    return
        except Exception as e:
            logger.debug(f"Could not reach backend status endpoint: {e}")
            return

        for channel_id, session_id in list(linked_channels.items()):
            channel = bot.get_channel(channel_id)
            if not channel:
                del linked_channels[channel_id]
                continue

            try:
                response = await client.get(
                    f"{API_BASE_URL}/api/insights",
                    headers={"session-id": session_id}
                )

                if response.status_code == 200:
                    data = response.json()
                    insight = data.get("response")
                    if insight:
                        await channel.send(f"🏎️ **Live F1 AI Insight**: {insight}")
                elif response.status_code == 403:
                    await channel.send("🔒 Session is no longer unlocked or expired. Unlinking...")
                    del linked_channels[channel_id]
            except Exception as e:
                logger.error(f"Error fetching insight for channel {channel_id}: {e}")

if __name__ == "__main__":
    if DISCORD_BOT_TOKEN and DISCORD_BOT_TOKEN != "dummy_token" and DISCORD_BOT_TOKEN != "your_discord_bot_token_here":
        try:
            bot.run(DISCORD_BOT_TOKEN)
        except Exception as e:
            logger.error(f"Failed to start bot: {e}")
    else:
        logger.warning("DISCORD_BOT_TOKEN not valid. Bot will not start.")