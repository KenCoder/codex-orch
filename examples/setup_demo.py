from pathlib import Path

Path('session_ready.txt').write_text('setup complete')
print('setup complete')
