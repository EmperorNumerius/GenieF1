from livef1.core.session import Session
try:
    session = Session(year=2024, meeting_name='Abu Dhabi', session_name='Race')
    print([x for x in dir(session) if 'driver' in x.lower() or 'entry' in x.lower()])
    print(session.driver_list if hasattr(session, 'driver_list') else 'no driver_list')
    print(session.drivers if hasattr(session, 'drivers') else 'no drivers')
except Exception as e:
    print('error', e)
