import discord
from discord.ext import commands, tasks
import os
from dotenv import load_dotenv
import httpx
import logging

load_dotenv()

# Setup logging
logging.basicConfig(level=logging.INFO)

DISCORD_BOT_TOKEN = os.getenv("DISCORD_BOT_TOKEN")

# Assuming the backend runs locally on port 8000
API_BASE_URL = "http://127.0.0.1:8000"

# Dictionary to map Discord channel IDs to user session IDs
linked_channels = {}

intents = discord.Intents.default()
intents.message_content = True

bot = commands.Bot(command_prefix="!", intents=intents)

@bot.event
async def on_ready():
    logging.info(f"Logged in as {bot.user.name}")
    broadcast_insights.start()

@bot.command()
async def link(ctx, session_id: str):
    """Links this Discord channel to a user's dashboard session."""
    # Verify with the backend if the session is unlocked
    # For now, we'll just test if the API returns an insight.
    # If it's locked, it returns a 403.

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
            logging.error(f"Error communicating with backend: {e}")
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

    # In a real app, you might only want to fetch once and broadcast to all,
    # assuming the insights are the same globally, but for a personalized
    # experience, we fetch per session.

    async with httpx.AsyncClient() as client:
        for channel_id, session_id in list(linked_channels.items()):
            channel = bot.get_channel(channel_id)
            if not channel:
                # Channel deleted or bot removed from channel
                del linked_channels[channel_id]
                continue

            try:
                response = await client.get(
                    f"{API_BASE_URL}/api/insights",
                    headers={"session-id": session_id}
                )

                if response.status_code == 200:
                    data = response.json()
                    insight = data.get("insight")
                    if insight:
                        # You could add logic here to only broadcast if the insight changed
                        # from the last broadcast to avoid spamming the channel.
                        await channel.send(f"🏎️ **Live F1 AI Insight**: {insight}")
                elif response.status_code == 403:
                    await channel.send("🔒 Session is no longer unlocked or expired. Unlinking...")
                    del linked_channels[channel_id]
            except Exception as e:
                logging.error(f"Error fetching insight for channel {channel_id}: {e}")

if __name__ == "__main__":
    if DISCORD_BOT_TOKEN and DISCORD_BOT_TOKEN != "dummy_token":
        try:
            bot.run(DISCORD_BOT_TOKEN)
        except Exception as e:
            logging.error(f"Failed to start bot: {e}")
    else:
        logging.warning("DISCORD_BOT_TOKEN not set. Bot will not start.")
