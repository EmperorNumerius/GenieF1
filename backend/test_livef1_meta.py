import livef1
season = livef1.get_season(2024)
print("Keys of season:")
print(dir(season))
meeting = season.meetings[-1]
print("Meeting attrs:", dir(meeting))
print("Meeting dict?", vars(meeting) if hasattr(meeting, "__dict__") else "no dict")
if hasattr(meeting, "circuit"):
    circuit = meeting.circuit
    print("Circuit attrs:", circuit)

print("Checking China 2024 Race")
try:
    china = livef1.get_session(2024, "Chinese Grand Prix", "Race")
    print(china)
except Exception as e:
    print(e)
