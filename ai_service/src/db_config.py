import os
from dotenv import load_dotenv
from sqlalchemy import create_engine

# Cargar variables de entorno desde .env
load_dotenv(os.path.join(os.path.dirname(__file__), "../.env"))

DB_URL = os.getenv("DATABASE_URL", "postgresql://postgres:admin@localhost:5432/vatto")

def get_engine():
    return create_engine(DB_URL)
