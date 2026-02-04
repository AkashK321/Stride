"""
WSGI entry point for Gunicorn
"""

from inference import app

if __name__ == "__main__":
    app.run()
