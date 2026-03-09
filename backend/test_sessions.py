"""Quick smoke test for livef1 integration."""
import livef1

print("livef1 version:", livef1.__version__)

# Test historical data access
season = livef1.get_season(2024)
print(f"Season 2024: {len(season.meetings)} meetings")
for m in season.meetings[:5]:
    print(f"  {m.key}: {getattr(m, 'name', '?')} — {getattr(m, 'location', '?')}")

# Test that our client module loads correctly
from livef1_client import LiveF1DataStore, get_full_race_state, get_api_status

store = LiveF1DataStore()
state = get_full_race_state(store)
print(f"\nEmpty store state: {len(state['cars'])} cars, error: {state.get('error', 'none')}")

status = get_api_status(store)
print(f"API status: connected={status['connected']}, source={status['auth_source']}")
print("\nAll checks passed!")
