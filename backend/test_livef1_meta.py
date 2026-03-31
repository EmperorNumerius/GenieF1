import livef1
season = livef1.get_season(2026)
print("Keys of season:")
print(dir(season))
meeting = season.meetings[-1]
print("Meeting attrs:", dir(meeting))
print("Meeting dict?", vars(meeting) if hasattr(meeting, "__dict__") else "no dict")
if hasattr(meeting, "circuit"):
    circuit = meeting.circuit
    print("Circuit type:", type(circuit))
    print("Circuit dir:", [a for a in dir(circuit) if not a.startswith("_")])
    print("Circuit vars:", vars(circuit) if hasattr(circuit, "__dict__") else "no dict")

print("Checking China 2024 Race")
try:
    china = livef1.get_session(2026, "Chinese Grand Prix", "Race")
    print(china)
except Exception as e:
    print(e)
